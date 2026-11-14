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
    expect(checkFood(food('granola-bars'), [r('peanut')]).blocked).toEqual(['May contain Peanut']);
    expect(checkFood(food('sunbutter'), [r('peanut')]).blocked).toEqual([]);
  });
  it('treats gluten as covering wheat', () => {
    expect(checkFood(food('pasta-dry'), [r('gluten', { type: 'intolerance' })]).blocked.length).toBeGreaterThan(0);
    expect(checkFood(food('white-rice'), [r('gluten')]).blocked).toEqual([]);
  });
  it('applies diets and exclusions', () => {
    expect(checkFood(food('chicken-canned'), [r('diet:vegetarian', { type: 'special-diet' })]).blocked).toEqual(['Not vegetarian']);
    expect(checkFood(food('spam-canned'), [r('no:pork', { type: 'religious-ethical' })]).blocked).toEqual(['Contains pork']);
    expect(checkFood(food('tuna-canned'), [r('no:fish', { type: 'religious-ethical' })]).blocked).toEqual(['Contains fish']);
  });
  it('matches specific foods by name', () => {
    expect(checkFood(food('tuna-pouch'), [r('food:tuna', { type: 'cannot-eat' })]).blocked.length).toBe(1);
  });
  it('ignores inactive restrictions', () => {
    expect(checkFood(food('peanut-butter'), [r('peanut', { active: false })]).blocked).toEqual([]);
  });
});
