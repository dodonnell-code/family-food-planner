import { describe, expect, it } from 'vitest';
import { buildSeedCatalog } from '../data/seedCatalog';
import { DEFAULT_PLANNING } from '../data/repo';
import { buildNestedPlan, buildPlan, diffPlans, scoreFood, type PlanInput, type PlanMember } from './planner';
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
    const fans = ['a', 'b', 'c'].map((id) => member(id, { ratings: all5(['peanut-butter', 'mixed-nuts']) }));
    const alice = member('alice', { restrictions: [restr('alice', 'peanut')] });
    const plan = buildPlan(input([...fans, alice]));
    expect(plan.items.map((i) => i.foodId)).not.toContain('peanut-butter');
    const ex = plan.excluded.find((e) => e.foodId === 'peanut-butter')!;
    expect(ex.reasons).toEqual([{ memberId: 'alice', reasons: ['Contains Peanut'] }]);
    // "May contain" is also kept out for an allergy.
    expect(plan.excluded.some((e) => e.foodId === 'mixed-nuts')).toBe(true);
    // A generic food stays when some kinds are safe; the unsafe kinds are listed to skip.
    const bars = buildPlan(input([...fans, alice], 'medium', { include: ['bars'] })).items.find((i) => i.foodId === 'bars')!;
    expect(bars.kinds!.find((k) => k.id === 'peanut-butter')!.notFor[0]).toMatch(/^alice/);
    expect(bars.kinds!.find((k) => k.id === 'fruit-grain')!.notFor).toEqual([]);
  });

  it('honours "can’t eat it" survey answers', () => {
    const plan = buildPlan(input([member('a', { ratings: { 'canned-chili': 'blocked' } }), member('b', { ratings: all5(['canned-chili']) })]));
    expect(plan.items.some((i) => i.foodId === 'canned-chili')).toBe(false);
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
    const fans = ['a', 'b', 'c'].map((id) => member(id, { ratings: all5(['peanut-butter', 'canned-meat']) }));
    const picky = member('d', { ratings: { 'canned-meat': 4 }, restrictions: [restr('d', 'food:peanut', { type: 'dislike' })] });
    const pb = scoreFood(food('peanut-butter'), [...fans, picky], 'medium', 14).score;
    const meat = scoreFood(food('canned-meat'), [...fans, picky], 'medium', 14).score;
    expect(meat).toBeGreaterThan(pb);
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
    if (days > plan.water.drinkingDays) expect(plan.warnings.join()).toContain('Stored water covers the first');
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
      expect(fish.length).toBeLessThanOrEqual(2);
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
    // Medium is mostly ready-to-eat, with rice and potatoes as staples.
    expect(share('medium', 14)).toBeLessThan(0.4);
  });

  it('caps fruit/veg servings so low-calorie foods don’t balloon', () => {
    const plan = buildPlan(input([member('a'), member('b'), member('c')], 'long', { days: 365 }));
    const produce = plan.items.filter((i) => i.bucket === 'produce').reduce((s, i) => s + i.servings, 0);
    expect(produce).toBeLessThanOrEqual(Math.ceil(3 * 365 * 2.5) + 4);
  });

  it('is deterministic', () => {
    const i = input([member('a', { ratings: all5(['canned-chili']) }), member('b')]);
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

describe('planner: admin additions', () => {
  it('adds a food the planner left out, with at least one package', () => {
    const plain = buildPlan(input([member('alice'), member('dan')], 'long'));
    const extra = foods.find((f) => f.active && f.nutrition.caloriesPerServing > 0 && !plain.items.some((i) => i.foodId === f.id) && !plain.excluded.some((e) => e.foodId === f.id))!;
    const plan = buildPlan(input([member('alice'), member('dan')], 'long', { include: [extra.id] }));
    const item = plan.items.find((i) => i.foodId === extra.id)!;
    expect(item.packages).toBeGreaterThanOrEqual(1);
    expect(item.why[0]).toBe('Added by admin');
    expect(plan.overrides).toEqual([{ foodId: extra.id, name: extra.name, unsafeFor: [] }]);
  });

  it('can add an allergy-excluded food back, flagged loudly and never counted as that person’s meal', () => {
    const alice = member('alice', { restrictions: [restr('alice', 'peanut')] });
    const plan = buildPlan(input([alice, member('dan')], 'medium', { include: ['peanut-butter'] }));
    const item = plan.items.find((i) => i.foodId === 'peanut-butter')!;
    expect(item).toBeDefined();
    expect(plan.excluded.some((e) => e.foodId === 'peanut-butter')).toBe(false);
    expect(item.flags.some((f) => f.startsWith('Not safe for alice'))).toBe(true);
    expect(item.verdicts.find((v) => v.memberId === 'alice')!.status).toBe('unsafe');
    expect(plan.warnings.some((w) => w.includes('aren’t safe for someone'))).toBe(true);
    expect(plan.coverage.find((c) => c.memberId === 'alice')!.mealOptionNames).not.toContain(item.name);
  });

  it('can add cooking oil, which the planner never picks on its own', () => {
    const plan = buildPlan(input([member('a')], 'long', { include: ['cooking-oil'] }));
    expect(plan.items.some((i) => i.foodId === 'cooking-oil')).toBe(true);
  });
});

describe('planner: nested supplies', () => {
  const fam = () => ['alice', 'dan', 'sam'].map((id) => member(id));
  const chain = { days: { short: 3, medium: 14, long: 90 } };
  const nested = (tier: Tier) => buildNestedPlan(input(fam(), tier, { scenario: 'limited-cook' }), chain);

  it('the short-term supply is part of the medium-term one, and both are part of the long-term one', () => {
    const [s, m, l] = [nested('short'), nested('medium'), nested('long')];
    for (const [small, big] of [[s, m], [m, l]] as const) {
      for (const i of small.items) {
        const j = big.items.find((x) => x.foodId === i.foodId);
        expect(j, `${i.name} carried into ${big.tier}`).toBeDefined();
        expect(j!.packages).toBeGreaterThanOrEqual(i.packages);
      }
    }
    expect(m.base).toMatchObject({ tier: 'short', days: 3 });
    expect(l.base).toMatchObject({ tier: 'medium', days: 14 });
    expect(m.items.find((x) => x.foodId === s.items[0].foodId)!.why[0]).toMatch(/^Includes the 3-day supply/);
  });

  it('adds only what is still needed (calories are not counted twice)', () => {
    for (const tier of ['medium', 'long'] as Tier[]) {
      const p = nested(tier);
      expect(p.plannedCalories).toBeGreaterThanOrEqual(p.targetCalories * 0.95);
      expect(p.plannedCalories).toBeLessThan(p.targetCalories * 1.2);
    }
  });

  it('long-term still keeps canned food down, counting the canned food carried in', () => {
    const l = nested('long');
    const canned = l.items.filter((i) => food(i.foodId).form === 'canned').reduce((t, i) => t + i.calories, 0);
    const carried = l.items.filter((i) => food(i.foodId).form === 'canned' && i.fromBase).length;
    const newCanned = l.items.filter((i) => food(i.foodId).form === 'canned' && !i.fromBase).length;
    expect(carried).toBeGreaterThan(0);
    expect(newCanned).toBeLessThanOrEqual(1);
    expect(canned / l.plannedCalories).toBeLessThan(0.3);
  });
});

describe('planner: admin swaps', () => {
  const fam = () => ['alice', 'dan', 'sam'].map((id) => member(id));
  it('replaces a food with the admin’s choice in every plan, and can leave one out', () => {
    const chain = { days: { short: 3, medium: 14, long: 90 } };
    const before = buildNestedPlan(input(fam(), 'long'), chain);
    const target = before.items.find((i) => i.foodId === 'almond-butter') ?? before.items.find((i) => i.bucket === 'snacks')!;
    const replacement = foods.find((f) => f.active && f.category === 'fat-snack' && !before.items.some((i) => i.foodId === f.id) && f.nutrition.caloriesPerServing > 0 && f.allergens.contains.length === 0)!;
    const subs = { [target.foodId]: replacement.id, 'canned-fruit': '' };
    for (const tier of ['short', 'medium', 'long'] as Tier[]) {
      const p = buildNestedPlan(input(fam(), tier, { substitutions: subs }), chain);
      expect(p.items.some((i) => i.foodId === target.foodId)).toBe(false);
      expect(p.items.some((i) => i.foodId === 'canned-fruit')).toBe(false);
      expect(p.excluded.find((e) => e.foodId === target.foodId)?.scenarioOnly).toMatch(/admin/);
      if (tier === 'long') {
        const r = p.items.find((i) => i.foodId === replacement.id)!;
        expect(r.why).toContain(`Admin swap for ${target.name}`);
        expect(p.overrides?.find((o) => o.foodId === replacement.id)?.replaces).toEqual([{ foodId: target.foodId, name: target.name }]);
      }
    }
  });

  it('lists allergens to check on each item, and the generic freeze-dried entrées say to check every can', () => {
    const p = buildPlan(input(fam(), 'long'));
    const fd = p.items.find((i) => i.foodId === 'fd-entree')!;
    expect(fd).toBeDefined();
    expect(fd.allergens).toEqual({ contains: ['wheat', 'milk', 'soy'], mayContain: ['egg'] });
    expect(fd.safetyNotes).toMatch(/Check every can/);
  });
});

describe('planner: preparedness staples', () => {
  const fam = () => ['alice', 'dan', 'sam'].map((id) => member(id));
  it('14- and 90-day plans with cooking include rice, beans and instant mashed potatoes', () => {
    for (const tier of ['medium', 'long'] as Tier[]) {
      const p = buildPlan(input(fam(), tier));
      const ids = p.items.map((i) => i.foodId);
      expect(ids, tier).toContain('white-rice');
      expect(ids, tier).toContain('potato-flakes');
      expect(ids.some((id) => ['canned-beans', 'pinto-beans-dry', 'refried-beans-canned'].includes(id)), tier).toBe(true);
      expect(p.items.find((i) => i.foodId === 'white-rice')!.why[0]).toBe('Preparedness staple');
    }
  });

  it('skips a staple that is unsafe for someone, that the family won’t eat, or that the admin swapped out', () => {
    const noRice = buildPlan(input([member('a', { ratings: { 'white-rice': 1 } }), member('b', { ratings: { 'white-rice': 1 } })], 'medium'));
    expect(noRice.items.find((i) => i.foodId === 'white-rice')?.why[0]).not.toBe('Preparedness staple');
    const allergic = buildPlan(input([member('a', { restrictions: [restr('a', 'milk')] })], 'medium'));
    expect(allergic.items.some((i) => i.foodId === 'potato-flakes')).toBe(false);
    const swapped = buildPlan(input(fam(), 'medium', { substitutions: { 'potato-flakes': '' } }));
    expect(swapped.items.some((i) => i.foodId === 'potato-flakes')).toBe(false);
  });

  it('no-cook plans don’t force staples that need cooking', () => {
    const p = buildPlan(input(fam(), 'medium', { scenario: 'no-cook' }));
    expect(p.items.some((i) => i.foodId === 'white-rice' || i.foodId === 'potato-flakes')).toBe(false);
  });
});

describe('planner: water after the stored days', () => {
  const fam = () => ['alice', 'dan', 'sam'].map((id) => member(id));
  it('stores water for the reserve days, then plans to make the rest safe with a filter and bleach', () => {
    const p = buildPlan(input(fam(), 'long', { defaults: { ...DEFAULT_PLANNING, waterReserveDays: 14 } }));
    expect(p.water.drinkingDays).toBe(14);
    expect(p.water.drinkingGallons).toBe(42);
    const t = p.water.treatment!;
    expect(t).toMatchObject({ fromDay: 15, days: 76 });
    expect(t.gallons).toBeGreaterThanOrEqual(76 * 3);
    expect(t.bleachOz).toBeGreaterThan(0);
    expect(p.equipment.some((e) => e.item.startsWith('Gravity water filter'))).toBe(true);
    expect(p.equipment.some((e) => e.item.startsWith('Backup portable water filter'))).toBe(true);
    expect(p.equipment.find((e) => e.item.startsWith('Unscented household bleach'))!.item).toMatch(/last resort/);
    expect(t.boilHours).toBeGreaterThan(0);
  });

  it('needs no treatment when stored water covers the whole plan', () => {
    const p = buildPlan(input(fam(), 'medium', { defaults: { ...DEFAULT_PLANNING, waterReserveDays: 14 } }));
    expect(p.water.treatment).toBeUndefined();
    expect(p.equipment.some((e) => e.item.startsWith('Gravity water filter'))).toBe(false);
  });

  it('stores 1 gallon per person per day of drinking water: 5 people × 14 days = 70 gallons', () => {
    const five = ['a', 'b', 'c', 'd', 'e'].map((id) => member(id));
    const p = buildPlan(input(five, 'medium', { defaults: { ...DEFAULT_PLANNING, waterReserveDays: 14 } }));
    expect(p.water.drinkingGallons).toBe(70);
    expect(p.water.totalGallons).toBe(Math.round((70 + p.water.prepGallons) * 10) / 10);
  });
});

describe('planner: variety, favorites and a balanced diet', () => {
  const five = (ratings: Record<string, RatingCode> = {}) => ['a', 'b', 'c', 'd', 'e'].map((id) => member(id, { ratings }));
  const okWithEverything = (fav: string[]) => Object.fromEntries(foods.map((f) => [f.id, (fav.includes(f.id) ? 5 : 3) as RatingCode]));

  it('puts family favorites in every plan, including the 3-day one', () => {
    const fam = five(okWithEverything(['mac-cheese-cup', 'canned-fruit', 'canned-fish']));
    for (const tier of ['short', 'medium', 'long'] as Tier[]) {
      const p = buildPlan(input(fam, tier, { scenario: 'limited-cook' }));
      for (const id of ['mac-cheese-cup', 'canned-fruit']) {
        const item = p.items.find((i) => i.foodId === id);
        expect(item, `${id} in ${tier}`).toBeDefined();
        expect(item!.why[0]).toBe('Family favorite');
      }
    }
  });

  it('a food someone dislikes is not treated as a favorite', () => {
    const r = okWithEverything(['mac-cheese-cup']);
    const fam = [...five(r).slice(0, 4), member('e', { ratings: { ...r, 'mac-cheese-cup': 2 } })];
    const p = buildPlan(input(fam, 'short', { scenario: 'limited-cook' }));
    expect(p.items.find((i) => i.foodId === 'mac-cheese-cup')?.why[0]).not.toBe('Family favorite');
  });

  it('has more variety in longer plans, with both fruit and vegetables', () => {
    const counts = (['short', 'medium', 'long'] as Tier[]).map((t) => buildPlan(input(five(), t, { scenario: 'limited-cook' })).diet!);
    expect(counts[1].distinct.total).toBeGreaterThan(counts[0].distinct.total);
    expect(counts[1].distinct.mains).toBeGreaterThanOrEqual(8);
    for (const d of counts) {
      expect(d.distinct.fruits).toBeGreaterThanOrEqual(1);
      expect(d.distinct.vegetables).toBeGreaterThanOrEqual(1);
    }
  });

  it('meets basic diet targets: enough protein and fruit/vegetables', () => {
    for (const tier of ['short', 'medium', 'long'] as Tier[]) {
      const p = buildPlan(input(five(), tier, { scenario: 'limited-cook' }));
      expect(p.diet!.proteinPct, tier).toBeGreaterThanOrEqual(10);
      expect(p.diet!.produceServingsPerPersonDay, tier).toBeGreaterThanOrEqual(2);
      expect(p.warnings.some((w) => w.startsWith('Protein is low') || w.startsWith('Only'))).toBe(false);
    }
  });
});

describe('planner: baking supplies & seasonings', () => {
  const fam = () => ['alice', 'dan', 'sam'].map((id) => member(id));
  const pantry = (p: ReturnType<typeof buildPlan>) => p.items.filter((i) => i.bucket === 'pantry').map((i) => i.foodId);

  it('basics in every plan, seasonings from 14 days, baking supplies at 90 days', () => {
    const s = pantry(buildPlan(input(fam(), 'short', { scenario: 'limited-cook' })));
    const m = pantry(buildPlan(input(fam(), 'medium')));
    const l = pantry(buildPlan(input(fam(), 'long')));
    expect(s).toEqual(expect.arrayContaining(['salt', 'black-pepper', 'cooking-oil', 'sugar', 'bouillon']));
    expect(s).not.toContain('cumin');
    expect(m).toEqual(expect.arrayContaining(['salt', 'garlic-powder', 'chili-powder', 'soy-sauce']));
    expect(m).not.toContain('yeast');
    expect(l).toEqual(expect.arrayContaining(['salt', 'baking-powder', 'yeast', 'baking-soda', 'cinnamon']));
  });

  it('sizes by use per person per day, at least one container', () => {
    const l = buildPlan(input(fam(), 'long'));
    const salt = l.items.find((i) => i.foodId === 'salt')!;
    expect(salt.servings).toBe(Math.ceil(0.75 * 3 * 90));
    expect(salt.packages).toBe(Math.ceil(salt.servings / 120));
    expect(l.items.find((i) => i.foodId === 'vanilla')!.packages).toBeGreaterThanOrEqual(1);
    expect(l.diet!.distinct.total).toBe(l.items.filter((i) => i.bucket !== 'pantry').length);
  });

  it('allergy rules still apply (soy sauce left out for a soy allergy)', () => {
    const p = buildPlan(input([member('alice', { restrictions: [restr('alice', 'soy')] }), member('dan')], 'medium'));
    expect(pantry(p)).not.toContain('soy-sauce');
    expect(pantry(p)).toContain('salt');
  });

  it('carries into the bigger plans', () => {
    const chain = { days: { short: 3, medium: 14, long: 90 } };
    const m = buildNestedPlan(input(fam(), 'medium'), chain);
    const salt = m.items.find((i) => i.foodId === 'salt')!;
    expect(salt.fromBase).toBeDefined();
    expect(salt.servings).toBe(Math.ceil(0.75 * 3 * 14));
  });
});

describe('planner: calorie goal and foods not chosen', () => {
  const fam = () => ['alice', 'dan', 'sam'].map((id) => member(id));

  it('reaches the calorie goal by increasing the foods it has, without adding new ones', () => {
    const few = ['white-rice', 'pinto-beans-dry', 'peanut-butter'].map(food).filter(Boolean);
    const p = buildPlan(input(fam(), 'medium', { foods: few }));
    expect(p.plannedCalories).toBeGreaterThanOrEqual(p.targetCalories);
    expect(p.topUp!.shortCalories).toBe(0);
    expect(p.topUp!.increased.length).toBeGreaterThan(0);
  });

  it('reports the gap when there is nothing safe to fill it', () => {
    const p = buildPlan(input([member('alice', { restrictions: [restr('alice', 'peanut')] })], 'medium', { foods: [food('peanut-butter')] }));
    expect(p.topUp!.shortCalories).toBe(p.targetCalories);
  });

  it('lists every safe food that was not picked, with a reason', () => {
    const p = buildPlan(input(fam(), 'medium'));
    const inPlan = new Set(p.items.map((i) => i.foodId));
    const excluded = new Set(p.excluded.map((e) => e.foodId));
    expect(p.notChosen!.length).toBeGreaterThan(0);
    for (const n of p.notChosen!) {
      expect(inPlan.has(n.foodId)).toBe(false);
      expect(excluded.has(n.foodId)).toBe(false);
      expect(n.reason.length).toBeGreaterThan(5);
    }
  });

  it('gives "not liked" as the reason when someone refuses a food', () => {
    const p = buildPlan(input(fam().map((m) => ({ ...m, ratings: { 'canned-fish': 1 as RatingCode } })), 'medium'));
    expect(p.items.some((i) => i.foodId === 'canned-fish')).toBe(false);
    expect(p.notChosen!.find((x) => x.foodId === 'canned-fish')?.reason).toMatch(/like it|rated it low/);
  });
});

describe('planner: admin control', () => {
  const fam = () => ['alice', 'dan', 'sam'].map((id) => member(id));

  it('taking a food out adds no new foods; suggestions are offered instead', () => {
    const before = buildPlan(input(fam(), 'medium'));
    const out = before.items.find((i) => i.bucket === 'mains')!.foodId;
    const after = buildPlan(input(fam(), 'medium', { substitutions: { [out]: '' } }));
    const was = new Set(before.items.map((i) => i.foodId));
    expect(after.items.map((i) => i.foodId).filter((id) => !was.has(id))).toEqual([]);
    expect(after.items.some((i) => i.foodId === out)).toBe(false);
    expect(after.items.length).toBe(before.items.length - 1);
    expect(after.plannedCalories).toBeGreaterThanOrEqual(after.targetCalories);
  });

  it('adding a food does not push other foods out', () => {
    const before = buildPlan(input(fam(), 'medium'));
    const extra = before.notChosen!.find((n) => n.bucket === 'mains')!.foodId;
    const after = buildPlan(input(fam(), 'medium', { include: [extra] }));
    const ids = new Set(after.items.map((i) => i.foodId));
    for (const i of before.items) expect(ids.has(i.foodId), i.name).toBe(true);
    expect(ids.has(extra)).toBe(true);
  });

  it('keeps an amount the admin sets, and does not grow it', () => {
    const p0 = buildPlan(input(fam(), 'medium'));
    const it0 = p0.items.find((i) => i.bucket === 'starches')!;
    const p = buildPlan(input(fam(), 'medium', { quantities: { [it0.foodId]: 1 } }));
    const it = p.items.find((i) => i.foodId === it0.foodId)!;
    expect(it.packages).toBe(1);
    expect(it.why[0]).toBe('Amount set by admin');
    expect(p.plannedCalories).toBeGreaterThanOrEqual(p.targetCalories);
  });

  it('hand-picked plans hold only the picks, sized for everyone, and flag a shortfall', () => {
    const p = buildPlan(input(fam(), 'short', { scenario: 'limited-cook', handPick: true, include: ['white-rice', 'peanut-butter', 'salt'] }));
    expect(p.items.map((i) => i.foodId).sort()).toEqual(['peanut-butter', 'salt', 'white-rice']);
    expect(p.plannedCalories).toBeGreaterThanOrEqual(p.targetCalories);
    expect(p.plannerPicks!.length).toBeGreaterThan(5);
    const empty = buildPlan(input(fam(), 'short', { handPick: true, include: [] }));
    expect(empty.items).toEqual([]);
    expect(empty.topUp!.shortCalories).toBe(empty.targetCalories);
    expect(empty.topUp!.suggestions.length).toBeGreaterThan(0);
  });
});

describe('planner: always stocked', () => {
  it('peanut butter is in every planner-built plan, even rated low, unless someone is allergic', () => {
    for (const tier of ['short', 'medium', 'long'] as Tier[])
      for (const scenario of ['no-cook', 'limited-cook'] as const) {
        const p = buildPlan(input([member('alice', { ratings: { 'peanut-butter': 2 as RatingCode } }), member('dan')], tier, { scenario }));
        const pb = p.items.find((i) => i.foodId === 'peanut-butter');
        expect(pb, `${tier} ${scenario}`).toBeDefined();
        expect(pb!.why[0]).toBe('Always stocked');
      }
    const allergic = buildPlan(input([member('alice', { restrictions: [restr('alice', 'peanut')] })], 'medium'));
    expect(allergic.items.some((i) => i.foodId === 'peanut-butter')).toBe(false);
  });
});
