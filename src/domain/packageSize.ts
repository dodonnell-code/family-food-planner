// Package sizes: lets inventory take what was actually bought (e.g. one 160 oz box from Costco)
// and count it in the plan's packages (e.g. 42 oz canisters → 3.8).
//
// The plan's package size comes from the food's package description ("42 oz canister",
// "#10 can (about 2 lb)", "box of 50 packets", "8 oz box 12-pack"). Servings always work as a
// fallback, since every food knows its servings per package.

export type SizeUnit = 'oz' | 'lb' | 'g' | 'kg' | 'floz' | 'ml' | 'l' | 'gal' | 'count' | 'servings';

export const SIZE_UNITS: { value: SizeUnit; label: string }[] = [
  { value: 'oz', label: 'oz' },
  { value: 'lb', label: 'lb' },
  { value: 'g', label: 'g' },
  { value: 'kg', label: 'kg' },
  { value: 'floz', label: 'fl oz' },
  { value: 'ml', label: 'ml' },
  { value: 'l', label: 'liters' },
  { value: 'gal', label: 'gallons' },
  { value: 'count', label: 'items (packets, bars, cans…)' },
  { value: 'servings', label: 'servings (from the label)' },
];

export const unitLabel = (u: SizeUnit) => (u === 'floz' ? 'fl oz' : u === 'l' ? 'L' : u === 'count' ? 'items' : u);

const GRAMS: Partial<Record<SizeUnit, number>> = { oz: 28.3495, lb: 453.592, g: 1, kg: 1000 };
const ML: Partial<Record<SizeUnit, number>> = { floz: 29.5735, ml: 1, l: 1000, gal: 3785.41 };

export interface Size { amount: number; unit: SizeUnit }

const UNIT_WORDS: [RegExp, SizeUnit][] = [
  [/^fl\.?\s*oz$/i, 'floz'], [/^(oz|ounces?)$/i, 'oz'], [/^(lbs?|pounds?)$/i, 'lb'], [/^(kg|kilograms?)$/i, 'kg'],
  [/^(g|grams?)$/i, 'g'], [/^(ml|milliliters?)$/i, 'ml'], [/^(l|liters?|litres?)$/i, 'l'], [/^(gal|gallons?)$/i, 'gal'],
];

/** Total size of one plan package, from its description; undefined if it doesn't say. */
export function parsePackageSize(description: string): Size | undefined {
  const d = description.toLowerCase();
  const m = d.match(/(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|ounces?|oz|lbs?|pounds?|kg|kilograms?|grams?|g|ml|milliliters?|liters?|litres?|l|gallons?|gal)\b/i);
  const count = d.match(/(?<!#)\b(\d+)\s*-?\s*(?:pack|count|ct|packets?|bars?|pouches?|entrees?|bags?|boxes?|cans?)\b/) ?? d.match(/\bof\s+(\d+)\b/);
  const n = count ? Number(count[1]) : undefined;
  if (m) {
    const unit = UNIT_WORDS.find(([re]) => re.test(m[2].trim()))?.[1];
    if (unit) {
      // "8 oz box 12-pack": the size is per item, so the package is 12 × 8 oz.
      const each = Number(m[1]);
      const multi = n && count && count.index !== undefined && m.index !== undefined && count.index > m.index ? n : 1;
      return { amount: each * multi, unit };
    }
  }
  if (n) return { amount: n, unit: 'count' };
  return undefined;
}

/**
 * How many plan packages one item of `bought` size equals, or an error explaining why it can't be
 * converted. `pkgDescription`/`servingsPerPackage` describe the plan's package.
 */
export function packagesPer(bought: Size, pkgDescription: string, servingsPerPackage: number): { packages: number } | { error: string } {
  if (!(bought.amount > 0)) return { error: 'Enter a size more than 0.' };
  if (bought.unit === 'servings') {
    return servingsPerPackage > 0 ? { packages: bought.amount / servingsPerPackage } : { error: 'This food has no servings per package set. Edit it in Catalog.' };
  }
  const pkg = parsePackageSize(pkgDescription);
  if (!pkg) return { error: `The plan’s package (“${pkgDescription}”) doesn’t list a size, so enter the number of servings on the label instead.` };
  if (bought.unit === 'count' || pkg.unit === 'count') {
    return bought.unit === pkg.unit ? { packages: bought.amount / pkg.amount } : { error: `The plan counts this as “${pkgDescription}”. Enter the number of items, or the servings on the label.` };
  }
  const a = toCommon(bought), b = toCommon(pkg);
  if (a.kind === b.kind) return { packages: a.value / b.value };
  // Weight ↔ volume only via ounces ↔ fluid ounces (labels mix them for liquids like oil or syrup).
  if (isOunceLike(bought.unit) || isOunceLike(pkg.unit)) return { packages: asFlOz(bought) / asFlOz(pkg) };
  return { error: `Can’t compare ${unitLabel(bought.unit)} with ${unitLabel(pkg.unit)} (weight vs. volume). Enter the servings on the label instead.` };
}

function toCommon(s: Size): { kind: 'mass' | 'volume'; value: number } {
  if (GRAMS[s.unit]) return { kind: 'mass', value: s.amount * GRAMS[s.unit]! };
  return { kind: 'volume', value: s.amount * ML[s.unit]! };
}
const isOunceLike = (u: SizeUnit) => u === 'oz' || u === 'floz';
/** Ounces of weight treated as fluid ounces (close enough for liquids). */
function asFlOz(s: Size): number {
  if (GRAMS[s.unit]) return (s.amount * GRAMS[s.unit]!) / GRAMS.oz!;
  return (s.amount * ML[s.unit]!) / ML.floz!;
}
