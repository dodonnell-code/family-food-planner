import { describe, expect, it } from 'vitest';
import { packagesPer, parsePackageSize } from './packageSize';
import { buildSeedCatalog } from '../data/seedCatalog';

const pk = (bought: Parameters<typeof packagesPer>[0], desc: string, servings = 10) => {
  const r = packagesPer(bought, desc, servings);
  if ('error' in r) throw new Error(r.error);
  return Math.round(r.packages * 100) / 100;
};

describe('package sizes', () => {
  it('reads sizes from package descriptions', () => {
    expect(parsePackageSize('42 oz canister')).toEqual({ amount: 42, unit: 'oz' });
    expect(parsePackageSize('#10 can (about 2 lb)')).toEqual({ amount: 2, unit: 'lb' });
    expect(parsePackageSize('#10 can')).toBeUndefined();
    expect(parsePackageSize('box of 50 packets')).toEqual({ amount: 50, unit: 'count' });
    expect(parsePackageSize('10-packet box')).toEqual({ amount: 10, unit: 'count' });
    expect(parsePackageSize('50-count bottle')).toEqual({ amount: 50, unit: 'count' });
    expect(parsePackageSize('8 oz box 12-pack')).toEqual({ amount: 96, unit: 'oz' });
    expect(parsePackageSize('25 lb bucket')).toEqual({ amount: 25, unit: 'lb' });
    expect(parsePackageSize('18.6 oz can (ready to serve)')).toEqual({ amount: 18.6, unit: 'oz' });
    expect(parsePackageSize('1 entree')).toEqual({ amount: 1, unit: 'count' });
  });

  it('converts what was bought into plan packages', () => {
    // The Costco case: one 160 oz box of rolled oats vs. 42 oz canisters.
    expect(pk({ amount: 160, unit: 'oz' }, '42 oz canister')).toBe(3.81);
    expect(pk({ amount: 10, unit: 'lb' }, '42 oz canister')).toBe(3.81);
    expect(pk({ amount: 4.5, unit: 'kg' }, '25 lb bag')).toBe(0.4);
    expect(pk({ amount: 1, unit: 'gal' }, '48 oz bottle')).toBe(2.67); // oil: fl oz ≈ oz
    expect(pk({ amount: 100, unit: 'count' }, 'box of 50 packets')).toBe(2);
    expect(pk({ amount: 45, unit: 'servings' }, '42 oz canister', 30)).toBe(1.5);
  });

  it('explains when it can’t convert', () => {
    expect(packagesPer({ amount: 2, unit: 'lb' }, '#10 can', 10)).toHaveProperty('error');
    expect(packagesPer({ amount: 2, unit: 'l' }, '2 lb bag', 10)).toHaveProperty('error');
    expect(packagesPer({ amount: 3, unit: 'count' }, '42 oz canister', 10)).toHaveProperty('error');
    expect(packagesPer({ amount: 0, unit: 'oz' }, '42 oz canister', 10)).toHaveProperty('error');
  });

  it('every seed food either has a readable size or can use servings', () => {
    const unreadable = buildSeedCatalog().filter((f) => !parsePackageSize(f.package.description)).map((f) => f.package.description);
    // These still work through servings; listed so a new unreadable format gets noticed.
    expect(new Set(unreadable)).toEqual(new Set(['#10 can', '2-serving pouch']));
  });
});
