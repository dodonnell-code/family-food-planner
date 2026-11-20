import { describe, expect, it } from 'vitest';
import { allergensIn, cleanName, fromFdc, parsePackageWeight } from './foodLookup';

// A real FoodData Central "Branded" record (trimmed).
const OATS = {
  fdcId: 2126829, description: 'OLD FASHIONED OATS', gtinUpc: '070038610588', brandOwner: 'Associated Wholesale Grocers, Inc.', brandName: 'BEST CHOICE',
  ingredients: '100% WHOLE GRAIN ROLLED OATS.', packageWeight: '42 oz/1.19 kg', servingSizeUnit: 'g', servingSize: 40.0, householdServingFullText: '1/2 cup',
  foodNutrients: [
    { nutrientId: 1003, nutrientName: 'Protein', unitName: 'G', value: 12.5 },
    { nutrientId: 1004, nutrientName: 'Total lipid (fat)', unitName: 'G', value: 7.5 },
    { nutrientId: 1005, nutrientName: 'Carbohydrate, by difference', unitName: 'G', value: 67.5 },
    { nutrientId: 1008, nutrientName: 'Energy', unitName: 'KCAL', value: 375 },
    { nutrientId: 2000, nutrientName: 'Total Sugars', unitName: 'G', value: 2.5 },
    { nutrientId: 1079, nutrientName: 'Fiber, total dietary', unitName: 'G', value: 10.0 },
    { nutrientId: 1093, nutrientName: 'Sodium, Na', unitName: 'MG', value: 0.0 },
    { nutrientId: 1258, nutrientName: 'Fatty acids, total saturated', unitName: 'G', value: 1.25 },
  ],
};

describe('food lookup (USDA FoodData Central)', () => {
  it('fills package, servings and per-serving nutrition from a label record', () => {
    const r = fromFdc(OATS);
    expect(r).toMatchObject({
      name: 'Old Fashioned Oats', brand: 'BEST CHOICE', upc: '070038610588',
      packageDesc: '42 oz', servingsPerPackage: 30, servingDesc: '1/2 cup (40 g)',
      nutrition: { caloriesPerServing: 150, proteinG: 5, carbsG: 27, fatG: 3, satFatG: 0.5, fiberG: 4, sugarG: 1, sodiumMg: 0 },
      contains: [],
    });
  });

  it('takes the size out of names and drops repeated parts', () => {
    expect(cleanName('QUAKER OATS OLD FASHIONED 42 OZ')).toEqual({ name: 'Quaker Oats Old Fashioned', size: '42 OZ' });
    expect(cleanName('Old Fashioned Oats, Old Fashioned')).toEqual({ name: 'Old Fashioned Oats', size: undefined });
    expect(cleanName('CHICKEN NOODLE SOUP, CONDENSED')).toEqual({ name: 'Chicken Noodle Soup, Condensed', size: undefined });
    const r = fromFdc({ ...OATS, description: 'QUAKER OLD FASHIONED OATS 42 OZ', packageWeight: undefined, householdServingFullText: '1/2 cup dry (40 g)' });
    expect(r).toMatchObject({ name: 'Quaker Old Fashioned Oats', packageDesc: '42 oz', servingsPerPackage: 30, servingDesc: '1/2 cup dry (40 g)' });
  });

  it('reads package weights', () => {
    expect(parsePackageWeight('42 oz/1.19 kg')).toEqual({ desc: '42 oz', grams: 42 * 28.3495 });
    expect(parsePackageWeight('15 OZ/425 g')?.desc).toBe('15 oz');
    expect(parsePackageWeight('1.5 lbs')?.desc).toBe('1.5 lbs');
    expect(parsePackageWeight('64 fl oz/1.89 L')?.desc).toBe('64 fl oz');
    expect(parsePackageWeight('')).toBeUndefined();
    expect(parsePackageWeight('1 each')).toBeUndefined();
  });

  it('finds allergens in ingredient lists without false alarms', () => {
    expect(allergensIn('ENRICHED WHEAT FLOUR, SUGAR, WHEY, SOY LECITHIN, PEANUT BUTTER')).toEqual(['peanut', 'milk', 'wheat', 'gluten', 'soy']);
    expect(allergensIn('Cocoa butter, sugar')).toEqual([]);
    expect(allergensIn('peanut butter')).toEqual(['peanut']);
    expect(allergensIn('Barley malt, oats')).toEqual(['gluten']);
    expect(allergensIn(undefined)).toEqual([]);
  });

  it('copes with records missing a serving size', () => {
    const r = fromFdc({ fdcId: 1, description: 'MYSTERY', foodNutrients: [{ nutrientId: 1008, value: 300 }] });
    expect(r.nutrition.caloriesPerServing).toBeUndefined();
    expect(r.servingsPerPackage).toBeUndefined();
  });
});
