import { describe, expect, it } from 'vitest';
import { flyerTerms, isMyStore, matches, priceText, salesFor, toSale, validZip, type FlyerItem } from './deals';

const NOW = Date.parse('2026-11-17T15:00:00Z');
let n = 0;
const item = (x: Partial<FlyerItem>): FlyerItem => ({ id: n++, name: 'Jif Peanut Butter', merchant_name: 'Meijer', current_price: 5.99, pre_price_text: 'sale', valid_from: '2026-11-15T05:00:00+00:00', valid_to: '2026-11-22T04:59:59+00:00', ...x });

describe('flyer search terms', () => {
  it('uses flyer words for catalog foods, skips freeze-dried, and falls back to the name', () => {
    expect(flyerTerms('canned-fish', 'Canned fish')).toEqual(['tuna', 'salmon', 'sardines']);
    expect(flyerTerms('fd-entree', 'Freeze-dried entrées, assorted (#10 cans)')).toEqual([]);
    expect(flyerTerms('custom-1', 'Fig bars (soft) / cookies')).toEqual(['fig bars']);
  });
  it('keeps items that contain every search word, plurals allowed', () => {
    expect(matches('peanut butter', 'Jif Peanut Butter or Natural Peanut Butter')).toBe(true);
    expect(matches('peanut butter', 'Peanut M&Ms')).toBe(false);
    expect(matches('pretzels', 'Snyder’s Pretzel Rods')).toBe(true);
    expect(matches('mac cheese', 'Kraft Mac & Cheese Dinner')).toBe(true);
    expect(matches('salt', 'Lay’s Potato Chips')).toBe(false);
  });
});

describe('prices and dates', () => {
  it('reads flyer price wording', () => {
    expect(priceText({ current_price: 5, pre_price_text: '2/', post_price_text: null })).toBe('2 for $5');
    expect(priceText({ current_price: 8, pre_price_text: 'SALE 2 for', post_price_text: null })).toBe('2 for $8');
    expect(priceText({ current_price: 5.99, pre_price_text: 'sale', post_price_text: null })).toBe('$5.99');
    expect(priceText({ current_price: 5.79, pre_price_text: null, post_price_text: 'with card' })).toBe('$5.79 with card');
    expect(priceText({ current_price: null, pre_price_text: '10% off', post_price_text: 'None' })).toBe('10% off');
  });
  it('drops ended sales and gives the last day', () => {
    expect(toSale(item({ valid_to: '2026-11-16T04:59:59+00:00' }), NOW)).toBeUndefined();
    expect(toSale(item({}), NOW)?.through).toMatch(/^2026-11-2[12]$/);
    expect(toSale(item({ valid_from: '2026-11-19T05:00:00+00:00' }), NOW)?.starts).toMatch(/^2026-11-(18|19)$/);
  });
});

describe('salesFor', () => {
  it('merges searches, removes repeats and non-matches, and lists your stores first', () => {
    const a = item({ merchant_name: 'Family Fare', name: 'Peter Pan Peanut Butter' });
    const b = item({ merchant_name: 'Meijer' });
    const junk = item({ name: 'Reese’s Cups' });
    const again = item({ merchant_name: 'Meijer' }); // same item in a second flyer
    const sales = salesFor([{ query: 'peanut butter', items: [a, b, junk] }, { query: 'peanut butter', items: [b, again] }], { now: NOW });
    expect(sales.map((s) => s.store)).toEqual(['Meijer', 'Family Fare']);
    expect(isMyStore('ALDI')).toBe(true);
    expect(isMyStore('Family Fare')).toBe(false);
  });
  it('keeps food from food stores, and drops freezer/fresh items and look-alikes', () => {
    const tortillas = [item({ name: 'Mission Tortilla Wraps' }), item({ name: 'On The Border Tortilla Chips' })];
    expect(salesFor([{ query: 'tortillas', items: tortillas }], { foodId: 'tortillas-shelf', now: NOW }).map((s) => s.product)).toEqual(['Mission Tortilla Wraps']);
    const fish = [item({ name: 'Fresh Atlantic Salmon Fillets' }), item({ name: 'StarKist Chunk Light Tuna' }), item({ name: 'Curry 3Z shoe', merchant_name: "Dunham's Sports" })];
    expect(salesFor([{ query: 'tuna', items: fish }, { query: 'salmon', items: fish }], { foodId: 'canned-fish', now: NOW }).map((s) => s.product)).toEqual(['StarKist Chunk Light Tuna']);
    expect(salesFor([{ query: 'glucose', items: [item({ name: 'Blood Glucose Meter', _L1: 'Health & Beauty' })] }], { now: NOW })).toEqual([]);
  });
  it('checks zip codes', () => {
    expect(validZip('49503')).toBe(true);
    expect(validZip('4950')).toBe(false);
  });
});
