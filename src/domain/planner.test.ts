import { describe, expect, it } from 'vitest';
import { buildSeedCatalog } from '../data/seedCatalog';
import { DEFAULT_PLANNING } from '../data/repo';
import { buildPlan, diffPlans, scoreFood, type PlanInput, type PlanMember } from './planner';
import type { MemberRestriction, RatingCode, Tier } from './types';

const foods = buildSeedCatalog();
const food = (id: string) => foods.find((f) => f.id === id)!;
const restr = (memberId: string, subject: string, extra: Partial<MemberRestriction> = {}): MemberRestriction =>
  ({ id: `${memberId}:${subject}`, memberId, type: 'allergy', subject, active: true, createdAt: '', ...extra });
const member = (id: string, extra: Partial<PlanMember> = {}): PlanMember =>
  ({ id, name: id, restrictions: [], needs: [], ratings: {}, ignoredRefusals: [], surveyId: `s-${id}`, ...extra });
const input = (members: PlanMember[], tier: Tier = 'medium', extra: Partial<PlanInput> = {}): PlanInput => ({
  tier, scenario: tier === 'short' ? 'no-cook' : 'limited-cook', days: tier === 'short' ? 3 : tier === 'medium' ? 14 : 90,
  defaults: { ...DEFAULT_PLANNING }, members, foods, ...extra,
});
const all5 = (ids: string[]): Record<string, RatingCode> => Object.fromEntries(ids.map((i) => [i, 5 as RatingCode]));

describe('planner: hard safeguards', () => {
  it('never stocks a food that conflicts with anyone’s allergy, however much others like it', () => {
    const fans = ['a', 'b', 'c'].map((id) => member(id, { ratings: all5(['peanut-butter', 'pb-packets']) }));
    const alice = member('alice', { restrictions: [restr('alice', 'peanut')] });
    const plan = buildPlan(input([...fans, alice]));
    expect(plan.items.map((i) => i.foodId)).not.toContain('peanut-butter');
    const ex = plan.excluded.find((e) => e.foodId === 'peanut-butter')!;
    expect(ex.reasons).toEqual([{ memberId: 'alice', reasons: ['Contains Peanut'] }]);
    // "May contain" is also kept out for an allergy.
    expect(plan.excluded.some((e) => e.foodId === 'granola-bars')).toBe(true);
  });

  it('honours "can’t eat it" survey answers', () => {
    const plan = buildPlan(input([member('a', { ratings: { 'chili-canned': 'blocked' } }), member('b', { ratings: all5(['chili-canned']) })]));
    expect(plan.items.some((i) => i.foodId === 'chili-canned')).toBe(false);
  });

  it('no-cook plans only use food that needs no heat', () => {
    const plan = buildPlan(input([member('a'), member('b')], 'short'));
    expect(plan.items.length).toBeGreaterThan(0);
    for (const i of plan.items) expect(food(i.foodId).prep.edibleWithoutHeat).toBe(true);
    expect(plan.excluded.find((e) => e.foodId === 'pinto-beans-dry')?.scenarioOnly).toBeTruthy();
    expect(plan.fuel.burnerMinutes).toBe(0);
  });
});

describe('planner: preferences', () => {
  it('“avoid when possible” loses to a good alternative', () => {
    const m = member('a', { restrictions: [restr('a', 'milk', { type: 'intolerance', strictness: 'avoid' })] });
    const plan = buildPlan(input([m, member('b')]));
    expect(plan.items.some((i) => i.foodId === 'shelf-milk')).toBe(false);
  });

  it('a dislike pulls a food below a safe alternative instead of being outvoted', () => {
    const ratings = all5(['tuna-pouch', 'chicken-canned']);
    const fans = ['a', 'b', 'c'].map((id) => member(id, { ratings }));
    const picky = member('d', { ratings: { 'chicken-canned': 4 }, restrictions: [restr('d', 'food:tuna', { type: 'dislike' })] });
    const tuna = scoreFood(food('tuna-pouch'), [...fans, picky], 'medium', 14).score;
    const chicken = scoreFood(food('chicken-canned'), [...fans, picky], 'medium', 14).score;
    expect(chicken).toBeGreaterThan(tuna);
  });

  it('“avoid when possible” intolerances keep the food eligible but flag it', () => {
    const m = member('a', { restrictions: [restr('a', 'milk', { type: 'intolerance', strictness: 'avoid' })] });
    const plan = buildPlan(input([m, member('b')], 'medium', { foods: foods.map((f) => ((f.category === 'dairy-alt' || f.category === 'beverage') && f.id !== 'shelf-milk' ? { ...f, active: false } : f)) }));
    expect(plan.excluded.some((e) => e.foodId === 'shelf-milk')).toBe(false);
    // With no other drink available it is used, but flagged.
    const milk = plan.items.find((i) => i.foodId === 'shelf-milk');
    expect(milk?.flags.join()).toContain('avoid when possible');
  });

  it('unknown ratings are left out of acceptance rather than scored zero', () => {
    const s1 = scoreFood(food('crackers'), [member('a', { ratings: { crackers: 5 } }), member('b')], 'short', 3);
    const s2 = scoreFood(food('crackers'), [member('a', { ratings: { crackers: 5 } }), member('b', { ratings: { crackers: 'unknown' } })], 'short', 3);
    expect(s1.factors.acceptance).toBe(1);
    expect(s2.factors.acceptance).toBe(1);
    expect(s2.counts.unknown).toBe(1);
  });
});

describe('planner: quantities, water and needs', () => {
  it.each([3, 14, 30, 90, 365])('rounds to whole packages and shows leftovers for %i days', (days) => {
    const tier: Tier = days <= 3 ? 'short' : days <= 30 ? 'medium' : 'long';
    const plan = buildPlan(input([member('a'), member('b'), member('c')], tier, { days }));
    expect(plan.targetCalories).toBe(3 * DEFAULT_PLANNING.defaultDailyCalories * days);
    expect(plan.plannedCalories).toBeGreaterThanOrEqual(plan.targetCalories * 0.95);
    for (const i of plan.items) {
      expect(Number.isInteger(i.packages)).toBe(true);
      expect(i.packages * i.servingsPerPackage).toBeGreaterThanOrEqual(i.servings);
      expect(i.leftoverServings).toBeCloseTo(i.packages * i.servingsPerPackage - i.servings, 1);
      expect(Math.abs(i.prepWaterGallons - (i.servings * food(i.foodId).prep.waterCupsPerServing) / 16)).toBeLessThanOrEqual(0.051);
    }
    expect(plan.water.drinkingDays).toBe(Math.min(days, DEFAULT_PLANNING.waterReserveDays));
    expect(plan.water.drinkingGallons).toBeCloseTo(3 * plan.water.drinkingDays, 5);
    if (days > plan.water.drinkingDays) expect(plan.warnings.join()).toContain('Drinking water covers');
  });

  it('reserves fast-acting carbs for the person who needs them, safely', () => {
    const z = member('sam', { needs: [{ id: 'n1', memberId: 'sam', domain: 'food', kind: 'rapid-carbs', params: { servingsPerDay: 3 }, confirmed: false, active: true, createdAt: '', updatedAt: '' }] });
    const plan = buildPlan(input([z, member('b')], 'short'));
    const r = plan.reserved[0];
    expect(r).toMatchObject({ memberId: 'sam', foodId: 'glucose-tabs', servings: 9, packages: 1 });
    expect(r.warnings.join()).toContain('placeholder');
    // Treatments aren't used as group snacks.
    expect(plan.items.some((i) => i.foodId === 'glucose-tabs')).toBe(false);
  });

  it('warns about members without surveys', () => {
    expect(buildPlan(input([member('a', { surveyId: undefined })])).warnings.join()).toContain('No survey yet for a');
  });

  it('keeps variety and realistic amounts of any one food', () => {
    for (const tier of ['short', 'medium', 'long'] as Tier[]) {
      const i = input([member('a'), member('b'), member('c')], tier);
      const plan = buildPlan(i);
      const fish = plan.items.filter((x) => food(x.foodId).tags.includes('fish'));
      expect(fish.length).toBeLessThanOrEqual(1);
      for (const x of plan.items) expect(x.servings).toBeLessThanOrEqual(Math.ceil(3 * i.days * 2));
    }
  });

  it('long-term plans are built mostly on dry staples; short-term on ready-to-eat food', () => {
    const people = [member('a'), member('b'), member('c')];
    const share = (tier: Tier, days: number) => {
      const r = buildPlan(input(people, tier, { days, scenario: tier === 'short' ? 'no-cook' : 'limited-cook' }));
      const dry = r.items.filter((i) => ['dry', 'bulk', 'freeze-dried'].includes(food(i.foodId).form)).reduce((s, i) => s + i.calories, 0);
      return dry / r.plannedCalories;
    };
    expect(share('long', 90)).toBeGreaterThan(0.5);
    expect(share('long', 365)).toBeGreaterThan(0.5);
    expect(share('medium', 14)).toBeLessThan(0.25);
  });

  it('caps fruit/veg servings so low-calorie foods don’t balloon', () => {
    const plan = buildPlan(input([member('a'), member('b'), member('c')], 'long', { days: 365 }));
    const produce = plan.items.filter((i) => i.bucket === 'produce').reduce((s, i) => s + i.servings, 0);
    expect(produce).toBeLessThanOrEqual(Math.ceil(3 * 365 * 2.5) + 4);
  });

  it('is deterministic', () => {
    const i = input([member('a', { ratings: all5(['chili-canned']) }), member('b')]);
    expect(buildPlan(i)).toEqual(buildPlan(i));
  });
});

describe('diffPlans', () => {
  it('lists foods to add, remove, and buy more or fewer of', () => {
    const before = buildPlan(input([member('a')]));
    const after = buildPlan(input([member('a'), member('b', { restrictions: [restr('b', 'fish')] })]));
    const d = diffPlans(before, after);
    expect(d.some((r) => r.kind === 'more')).toBe(true);
    const fish = before.items.filter((i) => food(i.foodId).allergens.contains.includes('fish'));
    for (const f of fish) expect(d).toContainEqual(expect.objectContaining({ foodId: f.foodId, kind: 'remove' }));
    expect(diffPlans(after, after)).toEqual([]);
  });
});

describe('equipment', () => {
  it('lists equipment the chosen foods need, with the foods that need it', () => {
    const onlyWheat = foods.map((f) => (f.category === 'grain' && f.id !== 'wheat-berries' ? { ...f, active: false } : f));
    const plan = buildPlan(input([member('a'), member('b')], 'long', { foods: onlyWheat }));
    expect(plan.items.some((i) => i.foodId === 'wheat-berries')).toBe(true);
    const mill = plan.equipment.find((e) => e.item.startsWith('Grain mill'));
    expect(mill?.foods).toEqual(['Hard wheat berries (whole grain)']);
    expect(plan.equipment.some((e) => e.item.startsWith('Camp stove'))).toBe(true);
    // Fuel: one 10-minute skillet batch per 4 servings of flatbread.
    const wheat = plan.items.find((i) => i.foodId === 'wheat-berries')!;
    expect(plan.fuel.items.find((x) => x.name === wheat.name)?.minutes).toBe(Math.ceil(wheat.servings / 4) * 10);
  });

  it('no-cook plans never need a stove, and pull-tab cans need no opener', () => {
    const plan = buildPlan(input([member('a')], 'short'));
    expect(plan.equipment.some((e) => e.item.startsWith('Camp stove'))).toBe(false);
    const opener = plan.equipment.find((e) => e.item === 'Manual can opener');
    expect(opener?.foods ?? []).not.toContain('Canned chicken (pull-tab)');
  });
});

describe('planner: long-term plans are mostly freeze-dried and dry food', () => {
  const cannedFans = () => ['alice', 'dan', 'sam'].map((id) => member(id, { ratings: all5(foods.filter((f) => f.form === 'canned').map((f) => f.id)) }));
  const share = (plan: ReturnType<typeof buildPlan>, form: string) =>
    plan.items.filter((i) => food(i.foodId).form === form).reduce((t, i) => t + i.calories, 0) / plan.plannedCalories;

  it('keeps canned food to a small share, even when it is well liked', () => {
    const plan = buildPlan(input(cannedFans(), 'long'));
    expect(plan.items.some((i) => food(i.foodId).form === 'canned')).toBe(true);
    expect(share(plan, 'canned')).toBeLessThanOrEqual(0.21);
    expect(share(plan, 'freeze-dried')).toBeGreaterThan(share(plan, 'canned'));
    expect(plan.plannedCalories).toBeGreaterThanOrEqual(3 * 90 * DEFAULT_PLANNING.defaultDailyCalories * 0.95);
  });

  it('follows the household setting (0% = no canned food)', () => {
    const plan = buildPlan(input(cannedFans(), 'long', { defaults: { ...DEFAULT_PLANNING, longTermCannedMaxPercent: 0 } }));
    expect(plan.items.some((i) => food(i.foodId).form === 'canned')).toBe(false);
  });

  it('does not limit canned food in short, medium or no-cook plans', () => {
    for (const plan of [buildPlan(input(cannedFans(), 'short')), buildPlan(input(cannedFans(), 'medium')), buildPlan(input(cannedFans(), 'long', { scenario: 'no-cook' }))])
      expect(share(plan, 'canned')).toBeGreaterThan(0.3);
  });
});
