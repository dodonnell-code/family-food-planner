import { describe, expect, it } from 'vitest';
import { bestSale, flyerTerms, isMyStore, matches, onlineSales, parseSize, priceText, salesFor, toSale, validZip, type FlyerItem } from './deals';

const NOW = Date.parse('2026-11-17T15:00:00Z');
let n = 0;
const item = (x: Partial<FlyerItem>): FlyerItem => ({ id: n++, name: 'Jif Peanut Butter', merchant_name: 'Meijer', current_price: 5.99, pre_price_text: 'sale', valid_from: '2026-11-15T05:00:00+00:00', valid_to: '2026-11-22T04:59:59+00:00', ...x });

describe('flyer search terms', () => {
  it('uses flyer words for catalog foods, skips freeze-dried, and falls back to the name', () => {
    expect(flyerTerms('canned-fish', 'Canned fish')).toEqual(['tuna', 'salmon', 'sardines']);
    expect(flyerTerms('wheat-berries', 'Hard wheat berries (whole grain)')).toEqual([]);
    expect(flyerTerms('fd-meal', 'Freeze-dried meal pouches, assorted')).toContain('mountain house');
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
    expect(priceText({ current_price: 7, pre_price_text: 'price 2/', post_price_text: null })).toBe('2 for $7');
    expect(priceText({ current_price: 5.99, pre_price_text: 'sale price', post_price_text: null })).toBe('$5.99');
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
    expect(isMyStore('Costco ')).toBe(true);
    expect(isMyStore("Sam's Club")).toBe(true);
    expect(isMyStore('Family Fare')).toBe(false);
  });
  it('keeps food from food stores, and drops freezer/fresh items and look-alikes', () => {
    const tortillas = [item({ name: 'Mission Tortilla Wraps' }), item({ name: 'On The Border Tortilla Chips' })];
    expect(salesFor([{ query: 'tortillas', items: tortillas }], { foodId: 'tortillas-shelf', now: NOW }).map((s) => s.product)).toEqual(['Mission Tortilla Wraps']);
    const fish = [item({ name: 'Fresh Atlantic Salmon Fillets' }), item({ name: 'StarKist Chunk Light Tuna' }), item({ name: 'Curry 3Z shoe', merchant_name: "Dunham's Sports" })];
    expect(salesFor([{ query: 'tuna', items: fish }, { query: 'salmon', items: fish }], { foodId: 'canned-fish', now: NOW }).map((s) => s.product)).toEqual(['StarKist Chunk Light Tuna']);
    expect(salesFor([{ query: 'glucose', items: [item({ name: 'Blood Glucose Meter', _L1: 'Health & Beauty' })] }], { now: NOW })).toEqual([]);
    const bucket = item({ merchant_name: 'Costco ', name: 'Mountain House Family Faves Emergency Food Bucket, 16 Pouches', _L1: 'Home & Garden', _L2: 'Emergency Preparedness' });
    expect(salesFor([{ query: 'mountain house', items: [bucket] }], { foodId: 'fd-meal', now: NOW }).map((s) => s.store)).toEqual(['Costco']);
    expect(salesFor([{ query: 'tuna', items: [item({ name: 'Ahi Tuna Vacuum Packed Portion' })] }], { foodId: 'canned-fish', now: NOW })).toEqual([]);
  });
  it('checks zip codes', () => {
    expect(validZip('49503')).toBe(true);
    expect(validZip('4950')).toBe(false);
  });
});

describe('onlineSales', () => {
  const p = (title: string, variants: { price: string; compare_at_price?: string | null; available?: boolean; title?: string }[], product_type = 'Food') =>
    ({ title, handle: title.toLowerCase().replace(/\W+/g, '-'), product_type, variants: variants.map((v, i) => ({ id: i + 1, title: 'Default Title', ...v })) });
  it('lists in-stock markdowns of at least 5%, biggest first, with a product link', () => {
    const sales = onlineSales([
      p('Beef Stew', [{ price: '12.99', compare_at_price: '12.99' }]),
      p('Classic Bucket', [{ price: '89.99', compare_at_price: '119.99' }]),
      p('Protein Pack Sampler', [{ price: '559.99', compare_at_price: '565.94' }]),
      p('Breakfast Skillet', [{ price: '9.99', compare_at_price: '12.99', title: '2-Pack' }, { price: '9.99', compare_at_price: '12.99', available: false }]),
      p('Camp Stove', [{ price: '20', compare_at_price: '40' }], 'Gear'),
    ], 'https://www.mountainhouse.com');
    expect(sales.map((s) => [s.product, s.option, s.pctOff])).toEqual([['Classic Bucket', undefined, 25], ['Breakfast Skillet', '2-Pack', 23]]);
    expect(sales[0].url).toBe('https://www.mountainhouse.com/products/classic-bucket?variant=1');
  });
});

describe('best price', () => {
  it('reads package sizes from flyer names', () => {
    expect(parseSize('Del Monte Green Beans 14.5 oz.')).toEqual({ min: 14.5, max: 14.5, unit: 'oz' });
    expect(parseSize('Minute Rice 12-14 oz. or Success Rice')).toEqual({ min: 12, max: 14, unit: 'oz' });
    expect(parseSize('Kroger Sugar 4 lb')).toEqual({ min: 64, max: 64, unit: 'oz' });
    expect(parseSize('Clif Zbar Bars 6 ct./7.6 oz.')).toEqual({ min: 7.6, max: 7.6, unit: 'oz' });
    expect(parseSize('Chex Cereal 12 oz. or Snyder’s Pretzels 8 oz.')).toBeUndefined();
    expect(parseSize('Barilla Pasta')).toBeUndefined();
  });
  it('works out the price each and per ounce', () => {
    const s = toSale(item({ name: 'Campbell’s Soup 10.5 oz', current_price: 5, pre_price_text: '3/' }), NOW)!;
    expect(s.each).toBeCloseTo(1.6667, 3);
    expect(s.perUnit!.value).toBeCloseTo(0.1587, 3);
  });
  it('picks the cheapest per ounce when sizes compare, otherwise the lowest price (check sizes)', () => {
    const big = toSale(item({ name: 'Aldi Mashed Potatoes 13.75 oz', current_price: 1.85, pre_price_text: null }), NOW)!;
    const small = toSale(item({ name: 'Idahoan Mashed Potatoes 4 oz', current_price: 0.99, pre_price_text: null }), NOW)!;
    expect(bestSale([small, big])).toEqual({ id: big.id, basis: 'unit' });
    const a = toSale(item({ name: 'Barilla Pasta', current_price: 4, pre_price_text: '3/' }), NOW)!;
    const b = toSale(item({ name: 'Kroger Pasta', current_price: 0.99, pre_price_text: null }), NOW)!;
    expect(bestSale([a, b])).toEqual({ id: b.id, basis: 'lowest' });
    expect(bestSale([a])).toBeUndefined();
  });
});
