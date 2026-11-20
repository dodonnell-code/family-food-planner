// Turns a USDA FoodData Central "Branded" food (US packaged foods, from the label) into catalog
// fields: package size, servings per package, nutrition per serving, and allergens found in the
// ingredient list. Everything is a starting point for the admin to check against the label.
import type { Allergen } from './types';

/** The parts of an FDC search hit this uses. */
export interface FdcFood {
  fdcId: number;
  description: string;
  brandOwner?: string;
  brandName?: string;
  gtinUpc?: string;
  ingredients?: string;
  packageWeight?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  householdServingFullText?: string;
  foodNutrients?: { nutrientId?: number; nutrientName?: string; unitName?: string; value?: number }[];
}

export interface LookupResult {
  fdcId: number;
  name: string;
  brand?: string;
  upc?: string;
  /** "42 oz", when the package weight is known. */
  packageDesc?: string;
  servingsPerPackage?: number;
  servingDesc?: string;
  /** Per serving, rounded like a label. */
  nutrition: { caloriesPerServing?: number; proteinG?: number; carbsG?: number; fatG?: number; satFatG?: number; fiberG?: number; sugarG?: number; sodiumMg?: number };
  /** Allergens named in the ingredients or "Contains" statement. Never proof that others are absent. */
  contains: Allergen[];
  ingredients?: string;
}

const GRAMS: Record<string, number> = { g: 1, gm: 1, grm: 1, kg: 1000, oz: 28.3495, lb: 453.592, lbs: 453.592, ml: 1, l: 1000, 'fl oz': 29.5735 };

/** "42 oz/1.19 kg" → { desc: "42 oz", grams: 1190.7 }. */
export function parsePackageWeight(text?: string): { desc: string; grams: number } | undefined {
  if (!text) return undefined;
  const first = text.split('/')[0].trim().toLowerCase();
  const m = first.match(/^(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|oz|lbs?|kg|g|gm|grm|ml|l)\b/);
  if (!m) return undefined;
  const unit = m[2].replace(/fl\.?\s*oz/, 'fl oz');
  return { desc: `${Number(m[1])} ${unit}`, grams: Number(m[1]) * GRAMS[unit] };
}

/** Words in ingredient lists that mean an allergen is present. */
const ALLERGEN_WORDS: [Allergen, RegExp][] = [
  ['peanut', /\bpeanuts?\b/],
  ['tree-nut', /\b(almonds?|cashews?|walnuts?|pecans?|pistachios?|hazelnuts?|macadamias?|brazil nuts?|pine nuts?|coconut|tree nuts?)\b/],
  ['milk', /\b(milk|whey|casein(ate)?|butter|cream|cheese|lactose|yogurt|ghee)\b/],
  ['egg', /\b(eggs?|egg whites?|albumen)\b/],
  ['wheat', /\b(wheat|semolina|durum|farina|spelt)\b/],
  ['gluten', /\b(wheat|barley|rye|malt|semolina|durum|spelt|gluten)\b/],
  ['soy', /\b(soy|soya|soybeans?|tofu|edamame)\b/],
  ['fish', /\b(fish|anchov(y|ies)|tuna|salmon|cod|pollock|sardines?|tilapia)\b/],
  ['shellfish', /\b(shrimp|crab|lobster|clams?|oysters?|scallops?|crayfish|prawns?)\b/],
  ['sesame', /\b(sesame|tahini)\b/],
  ['corn', /\b(corn|cornmeal|cornstarch|maize|hominy)\b/],
  ['mustard', /\bmustard\b/],
];

export function allergensIn(ingredients?: string): Allergen[] {
  if (!ingredients) return [];
  // Plant "butters" aren't dairy: cocoa butter → cocoafat, peanut butter → peanut spread.
  const t = ingredients.toLowerCase()
    .replace(/\b(cocoa|shea|mango|kokum) butter\b/g, '$1fat')
    .replace(/\b(peanut|almond|cashew|sunflower|seed|nut|apple|soy) butter\b/g, '$1 spread')
    .replace(/\bbuttermilk\b/g, 'milk');
  return ALLERGEN_WORDS.filter(([, re]) => re.test(t)).map(([a]) => a);
}

/** "OLD FASHIONED OATS, OLD FASHIONED 42 OZ" → name "Old Fashioned Oats" and size "42 oz". */
export function cleanName(description: string): { name: string; size?: string } {
  let d = description.trim();
  let size: string | undefined;
  const m = d.match(/[\s,-]+(\d+(?:\.\d+)?\s*(?:fl\.?\s*oz|oz|lbs?|kg|g|ml|l))\.?$/i);
  if (m) { size = m[1]; d = d.slice(0, m.index).trim(); }
  // Drop a repeated part after a comma ("Oats, Old Fashioned" when the name already says it).
  const parts = d.split(/\s*,\s*/);
  const kept = parts.filter((p, i) => i === 0 || !parts[0].toLowerCase().includes(p.toLowerCase()));
  return { name: title(kept.join(', ')), size };
}

const title = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(And|Or|Of|With|In)\b/g, (w) => w.toLowerCase()).trim();
const r1 = (n: number) => Math.round(n * 10) / 10;

/** "1/2 cup (40 g)", without repeating grams the household text already gives ("1/2 cup dry (40 g)"). */
function servingDescOf(household: string | undefined, grams: number | undefined, unit: string): string | undefined {
  if (!grams) return household || undefined;
  const g = `${r1(grams)} ${unit}`;
  if (!household) return g;
  return new RegExp(`\\b${r1(grams)}\\s*${unit}\\b`, 'i').test(household) ? household : `${household} (${g})`;
}

/** FDC nutrients are per 100 g (or 100 ml); the label serving converts them. */
export function fromFdc(f: FdcFood): LookupResult {
  const per = (id: number, name: RegExp) => f.foodNutrients?.find((n) => n.nutrientId === id || (n.nutrientName && name.test(n.nutrientName)))?.value;
  const servingG = f.servingSize && /^(g|grm|gm|ml|mlt)$/i.test(f.servingSizeUnit ?? '') ? f.servingSize : undefined;
  const scale = servingG ? servingG / 100 : undefined;
  const at = (v?: number, digits = r1) => (v === undefined || scale === undefined ? undefined : digits(v * scale));
  const named = cleanName(f.description);
  const pkg = parsePackageWeight(f.packageWeight) ?? parsePackageWeight(named.size);
  const servings = pkg && servingG ? pkg.grams / servingG : undefined;
  const unit = (f.servingSizeUnit ?? '').toLowerCase().startsWith('m') ? 'ml' : 'g';
  return {
    fdcId: f.fdcId,
    name: named.name,
    brand: [f.brandName, f.brandOwner].find((b) => b && b.trim())?.trim(),
    upc: f.gtinUpc,
    packageDesc: pkg?.desc,
    servingsPerPackage: servings && servings >= 0.5 ? Math.max(1, Math.round(servings * 2) / 2) : undefined,
    servingDesc: servingDescOf(f.householdServingFullText?.trim(), servingG, unit),
    nutrition: {
      caloriesPerServing: at(per(1008, /^Energy$/i), (n) => Math.round(n / 5) * 5),
      proteinG: at(per(1003, /^Protein$/i)),
      carbsG: at(per(1005, /^Carbohydrate/i)),
      fatG: at(per(1004, /^Total lipid/i)),
      satFatG: at(per(1258, /total saturated/i)),
      fiberG: at(per(1079, /^Fiber, total/i)),
      sugarG: at(per(2000, /^(Total )?Sugars/i)),
      sodiumMg: at(per(1093, /^Sodium/i), Math.round),
    },
    contains: allergensIn(f.ingredients),
    ingredients: f.ingredients?.trim() || undefined,
  };
}
