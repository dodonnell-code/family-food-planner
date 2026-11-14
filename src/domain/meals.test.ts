import { describe, expect, it } from 'vitest';
import { buildSeedCatalog } from '../data/seedCatalog';
import { amountFor, buildMealIdeas, fmtQty, MEAL_RECIPES } from './meals';

const foods = buildSeedCatalog();
const avail = (ids: string[], servings = 1000) => new Map(ids.map((id) => [id, servings]));

describe('meal ideas', () => {
  it('every recipe only uses foods that exist in the catalog', () => {
    const ids = new Set(foods.map((f) => f.id));
    for (const r of MEAL_RECIPES) for (const s of r.slots) for (const [id] of s.options) expect(ids, `${r.id}: ${id}`).toContain(id);
  });

  it('formats amounts in kitchen units', () => {
    expect(fmtQty(1.5)).toBe('1½');
    expect(fmtQty(0.26)).toBe('¼');
    expect(amountFor('1/4 cup dry', 6)).toBe('1½ cups dry');
    expect(amountFor('2 tbsp', 1)).toBe('2 tbsp');
    expect(amountFor('2 tbsp (1 egg)', 4)).toBe('½ cup (1 egg)');
    expect(amountFor('1 tortilla', 5.2)).toBe('6 tortillas');
    expect(amountFor('1 pouch', 3)).toBe('3 pouches');
  });

  it('scales one sitting to the household’s calories', () => {
    const { ideas } = buildMealIdeas({ available: avail(['white-rice', 'fd-meat', 'fd-veg']), foods, dailyCalories: [2000, 2000, 2000, 1500], mealsPerDay: 3 });
    const skillet = ideas.find((i) => i.recipe.id === 'chicken-rice')!;
    expect(skillet.people).toBe(4);
    // 7,500 kcal / 3 meals = 2,500 for the sitting.
    expect(skillet.caloriesTotal).toBeGreaterThan(2000);
    expect(skillet.caloriesTotal).toBeLessThan(3000);
    expect(skillet.lines.find((l) => l.foodId === 'white-rice')!.amount).toMatch(/cups dry/);
    expect(skillet.waterCups).toBeGreaterThan(0);
  });

  it('optional and fresh ingredients are never required', () => {
    const { ideas, missing } = buildMealIdeas({ available: avail(['oats-rolled']), foods, dailyCalories: [2000], mealsPerDay: 3 });
    expect(ideas.map((i) => i.recipe.id)).toContain('oatmeal');
    expect(missing.find((m) => m.recipe.id === 'pasta')!.needs).toEqual(['pasta', 'tomato sauce']);
  });

  it('counts sittings from the scarcest required food, and hides heated meals when not cooking', () => {
    const available = new Map([['peanut-butter', 30], ['tortillas-shelf', 1000], ['fd-fruit', 1000]]);
    const { ideas } = buildMealIdeas({ available, foods, dailyCalories: [2000, 2000], mealsPerDay: 3, noCook: true });
    const pb = ideas.find((i) => i.recipe.id === 'pb-wraps')!;
    const pbServings = pb.lines.find((l) => l.foodId === 'peanut-butter')!.servings;
    expect(pb.sittings).toBe(Math.floor(30 / pbServings));
    expect(ideas.every((i) => !i.recipe.heat)).toBe(true);
  });
});

it('describes small parts of big packages as fractions', () => {
  const { ideas } = buildMealIdeas({ available: new Map([['soup-mix-dry', 999], ['wheat-berries', 999]]), foods, dailyCalories: [2000, 2000, 2000], mealsPerDay: 3 });
  const note = ideas.find((i) => i.recipe.id === 'soup-flatbread')!.lines.find((l) => l.foodId === 'wheat-berries')!.packageNote!;
  expect(note).toMatch(/^about 1\/\d+ of a 25 lb bucket$/);
});
