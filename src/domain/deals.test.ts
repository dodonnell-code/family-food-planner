import { describe, expect, it } from 'vitest';
import { couponerSearch, flyerSearch, kindTerm, searchTerms, STORES, validZip } from './deals';
import type { KindNote } from './planner';

const k = (name: string, likedBy: string[] = [], notFor: string[] = []): KindNote => ({ id: name, name, likedBy, notFor });

describe('deal links', () => {
  it('builds store and flyer searches, with the zip where supported', () => {
    expect(STORES.map((s) => s.name)).toEqual(['Meijer', 'Aldi', 'Kroger', 'Walmart']);
    expect(STORES.find((s) => s.id === 'walmart')!.search('peanut butter')).toBe('https://www.walmart.com/search?q=peanut%20butter');
    expect(flyerSearch('peanut butter', '49503')).toBe('https://flipp.com/search/peanut%20butter?postal_code=49503');
    expect(flyerSearch('peanut butter')).toBe('https://flipp.com/search/peanut%20butter');
    expect(couponerSearch('canned tuna')).toBe('https://hip2save.com/?s=canned+tuna');
    expect(STORES.every((s) => s.couponers.length > 0)).toBe(true);
  });
  it('checks zip codes', () => {
    expect(validZip('49503')).toBe(true);
    expect(validZip(' 49503 ')).toBe(true);
    expect(validZip('4950')).toBe(false);
    expect(validZip('49503-1234')).toBe(false);
  });
});

describe('searchTerms', () => {
  it('turns kinds into natural searches', () => {
    expect(kindTerm('Canned fish', 'Tuna')).toBe('canned tuna');
    expect(kindTerm('Canned meats', 'Luncheon meat (Spam-style)')).toBe('canned luncheon meat');
    expect(kindTerm('Jelly', 'Grape')).toBe('grape jelly');
    expect(kindTerm('Salsa', 'Salsa verde')).toBe('salsa verde');
  });
  it('uses liked kinds (most liked first), skips unsafe ones, and falls back to all safe kinds', () => {
    const kinds = [k('Tuna', ['Sam']), k('Salmon', ['Sam', 'Alice']), k('Sardines', ['Dan'], ['Alice'])];
    expect(searchTerms('Canned fish', kinds)).toEqual({ main: 'canned fish', kinds: ['canned salmon', 'canned tuna'] });
    expect(searchTerms('Jelly', [k('Grape'), k('Strawberry')]).kinds).toEqual(['grape jelly', 'strawberry jelly']);
    expect(searchTerms('Peanut butter')).toEqual({ main: 'peanut butter', kinds: [] });
  });
});
