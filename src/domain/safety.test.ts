import { describe, expect, it } from 'vitest';
import { buildSeedCatalog } from '../data/seedCatalog';
import { checkFood } from './safety';
import type { MemberRestriction } from './types';

const cat = new Map(buildSeedCatalog().map((f) => [f.id, f]));
const food = (id: string) => cat.get(id)!;
const r = (subject: string, extra: Partial<MemberRestriction> = {}): MemberRestriction =>
  ({ id: subject, memberId: 'm', type: 'allergy', subject, active: true, createdAt: '', ...extra });

describe('checkFood', () => {
  it('blocks direct allergens and "may contain" for allergies', () => {
    expect(checkFood(food('peanut-butter'), [r('peanut')]).blocked).toEqual(['Contains Peanut']);
    expect(checkFood(food('granola'), [r('peanut')]).blocked).toEqual(['May contain Peanut']);
    // Generic foods: safe when some kind is; the warning names the kinds to skip.
    const bars = checkFood(food('bars'), [r('peanut')]);
    expect(bars.blocked).toEqual([]);
    expect(bars.warnings.join()).toMatch(/Only some kinds are safe.*Peanut butter bars/);
    expect(checkFood(food('canned-chili'), [r('diet:vegetarian', { type: 'religious-ethical' })]).blocked).toEqual([]);
    // Fish allergy: smoked oysters/clams are still fine; with shellfish too, nothing is.
    expect(checkFood(food('canned-fish'), [r('fish')]).blocked).toEqual([]);
    expect(checkFood(food('canned-fish'), [r('fish')]).warnings.join()).toMatch(/skip: Tuna, chunk light/);
    expect(checkFood(food('canned-fish'), [r('fish'), r('shellfish')]).blocked.length).toBeGreaterThan(0);
    expect(checkFood(food('almond-butter'), [r('peanut')]).blocked).toEqual([]);
    expect(checkFood(food('almond-butter'), [r('tree-nut')]).blocked.length).toBeGreaterThan(0);
  });
  it('treats gluten as covering wheat', () => {
    expect(checkFood(food('pasta-dry'), [r('gluten', { type: 'intolerance' })]).blocked.length).toBeGreaterThan(0);
    expect(checkFood(food('white-rice'), [r('gluten')]).blocked).toEqual([]);
  });
  it('applies diets and exclusions', () => {
    expect(checkFood(food('canned-meat'), [r('diet:vegetarian', { type: 'special-diet' })]).blocked).toEqual(['Not vegetarian']);
    const pork = checkFood(food('canned-meat'), [r('no:pork', { type: 'religious-ethical' })]);
    expect(pork.blocked).toEqual([]);
    expect(pork.warnings.join()).toMatch(/skip: Luncheon meat \(Spam-style\), Vienna sausages, Ham/);
    expect(checkFood(food('canned-fish'), [r('no:fish', { type: 'religious-ethical' })]).blocked).toEqual(['Contains fish']);
  });
  it('matches specific foods by name', () => {
    expect(checkFood(food('peanut-butter'), [r('food:peanut butter', { type: 'cannot-eat' })]).blocked.length).toBe(1);
    // For a generic food, only the matching kinds are ruled out.
    const fish = checkFood(food('canned-fish'), [r('food:tuna', { type: 'cannot-eat' })]);
    expect(fish.blocked).toEqual([]);
    expect(fish.warnings.join()).toMatch(/skip: Tuna, chunk light, Tuna, albacore \(white\), Flavored tuna pouches\)/);
  });
  it('ignores inactive restrictions', () => {
    expect(checkFood(food('peanut-butter'), [r('peanut', { active: false })]).blocked).toEqual([]);
  });
});

describe('dislikes', () => {
  it('exclude matching foods for the person without treating them as safety blocks', () => {
    const res = checkFood(food('peanut-butter'), [r('food:peanut', { type: 'dislike' })]);
    expect(res.blocked).toEqual([]);
    expect(res.disliked).toEqual(['Doesn’t like peanut']);
    // Disliking one kind (tuna) doesn't count against canned fish as a whole.
    expect(checkFood(food('canned-fish'), [r('food:tuna', { type: 'dislike' })]).disliked).toEqual([]);
    expect(checkFood(food('canned-meat'), [r('food:tuna', { type: 'dislike' })]).disliked).toEqual([]);
  });
});

describe('intolerance strictness', () => {
  const milk = (strictness?: 'strict' | 'avoid' | 'minor') => r('milk', { type: 'intolerance', strictness });
  it('strict (and unset) behaves like an allergy', () => {
    expect(checkFood(food('shelf-milk'), [milk()]).blocked).toEqual(['Contains Milk / dairy']);
    expect(checkFood(food('shelf-milk'), [milk('strict')]).blocked).toEqual(['Contains Milk / dairy']);
  });
  it('"avoid when possible" and "barely an inconvenience" only count against the food', () => {
    const a = checkFood(food('shelf-milk'), [milk('avoid')]);
    expect(a.blocked).toEqual([]);
    expect(a.avoid).toEqual(['Contains Milk / dairy']);
    const m = checkFood(food('shelf-milk'), [milk('minor')]);
    expect(m.blocked).toEqual([]);
    expect(m.minor).toEqual(['Contains Milk / dairy']);
  });
  it('lenient levels ignore "may contain"', () => {
    const res = checkFood(food('shelf-plant-milk'), [r('soy', { type: 'intolerance', strictness: 'avoid', cautionCrossContact: true })]);
    expect(res).toMatchObject({ blocked: [], avoid: [], minor: [] });
  });
});
