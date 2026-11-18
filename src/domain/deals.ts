// Weekly sales for the shopping list. Flipp gathers local store flyers by zip code; this
// turns our foods into flyer searches, keeps the results that match, and tidies the prices.
// Pure (no fetching), so it's easy to test.

/** A flyer item, as Flipp returns it (only the fields we use). */
export interface FlyerItem {
  id: number;
  name: string;
  merchant_name: string;
  current_price?: number | null;
  pre_price_text?: string | null;
  post_price_text?: string | null;
  sale_story?: string | null;
  valid_from?: string;
  valid_to?: string;
  clean_image_url?: string;
  /** Flipp's top-level category, e.g. "Food, Beverages & Tobacco". */
  _L1?: string;
  /** Subcategory, e.g. "Emergency Preparedness" (where food buckets are filed). */
  _L2?: string;
}

export interface Sale {
  id: number;
  store: string;
  product: string;
  price: string;
  note?: string;
  /** Last day of the sale (local date, YYYY-MM-DD). */
  through?: string;
  /** First day, when the sale hasn't started yet. */
  starts?: string;
  image?: string;
  /** Price for one (a "2 for $5" deal is $2.50 each). Missing when the flyer has no price. */
  each?: number;
  /** Price per ounce or per count, when the flyer gives one size (approx when it's a range). */
  perUnit?: { value: number; unit: 'oz' | 'ct'; approx: boolean };
}

/** The family's stores. Sales from other nearby stores can be shown too. */
export const MY_STORES = ['Meijer', 'Aldi', 'Kroger', 'Walmart', 'Costco', "Sam's Club"];
export const isMyStore = (store: string) => MY_STORES.some((s) => store.toLowerCase().includes(s.toLowerCase()));

/**
 * What flyers call our foods. Empty = not something stores put in weekly flyers.
 * Foods not listed here (custom foods) search by their name.
 */
const FLYER_TERMS: Record<string, string[]> = {
  'beef-jerky': ['jerky'], 'meat-pouch-rte': ['tuna pouch', 'chicken pouch'], 'tofu-shelf': ['tofu'], 'fd-meat': ['freeze dried chicken', 'freeze dried beef'], 'egg-powder': ['powdered eggs'],
  'refried-beans-canned': ['refried beans'], 'lentils-dry': ['lentils'], 'split-peas-dry': ['split peas'], 'pinto-beans-dry': ['pinto beans', 'kidney beans'],
  crackers: ['crackers'], granola: ['granola'], cereal: ['cereal'], 'tortillas-shelf': ['tortillas'], 'rice-pouch-rte': ['ready rice', 'rice pouch'],
  'potato-flakes': ['mashed potatoes', 'instant potatoes'], 'white-rice': ['rice'], 'pasta-dry': ['pasta'], 'oats-instant': ['oatmeal'], 'oats-rolled': ['oats'],
  cornmeal: ['cornmeal'], 'flour-wheat': ['flour'], 'wheat-berries': [], pretzels: ['pretzels'], 'applesauce-pouch': ['applesauce'], 'fd-fruit': ['freeze dried fruit', 'freeze dried strawberries'],
  'tomato-sauce': ['tomato sauce', 'diced tomatoes'], 'fd-veg': ['freeze dried vegetables'], 'ravioli-canned': ['ravioli', 'chef boyardee'], 'curry-pouch': ['curry'],
  'meal-pouch-rte': ['mre'], 'fd-entree': ['mountain house', 'emergency food', 'freeze dried meal'], 'fd-meal': ['mountain house', 'emergency food', 'freeze dried meal'], 'fd-breakfast': ['mountain house breakfast', 'freeze dried breakfast'], 'soup-mix-dry': ['soup mix'], 'mac-cheese-cup': ['mac cheese', 'macaroni'],
  'peanut-butter': ['peanut butter'], 'almond-butter': ['almond butter'], 'mixed-nuts': ['nuts'], 'trail-mix': ['trail mix'],
  'cooking-oil': ['vegetable oil', 'canola oil'], 'hard-candy': ['hard candy'], 'glucose-tabs': ['glucose'], 'glucose-gel': ['glucose'],
  'shelf-milk': ['shelf stable milk'], 'shelf-plant-milk': ['almond milk', 'oat milk'], 'powdered-milk': ['dry milk', 'powdered milk'],
  'juice-boxes': ['juice boxes', 'capri sun'], 'electrolyte-mix': ['electrolyte'], 'coffee-tea': ['instant coffee', 'tea bags'], 'cocoa-mix': ['hot cocoa'],
  'canned-fish': ['tuna', 'salmon', 'sardines'], 'canned-meat': ['spam', 'canned chicken', 'vienna sausage'],
  'canned-fruit': ['fruit cups', 'canned fruit'], 'canned-veg': ['canned vegetables', 'green beans'], 'canned-soup': ['soup'], 'canned-chili': ['chili'],
  'canned-beans': ['canned beans', 'black beans', 'baked beans'], bars: ['granola bars', 'protein bars'], ramen: ['ramen'], nutella: ['nutella'],
  'butter-powder': [], 'chocolate-chips': ['chocolate chips', 'baking chips'], 'cocoa-powder': ['baking cocoa', 'cocoa powder'], 'cake-mix': ['cake mix'],
  frosting: ['frosting'], salt: ['salt'], 'black-pepper': ['black pepper'], sugar: ['sugar'], bouillon: ['bouillon'], honey: ['honey'],
  'garlic-powder': ['garlic powder'], 'onion-powder': ['onion powder'], 'chili-powder': ['chili powder'], cumin: ['cumin'], 'italian-seasoning': ['italian seasoning'],
  cinnamon: ['cinnamon'], 'soy-sauce': ['soy sauce'], ketchup: ['ketchup'], mustard: ['mustard'], 'mayo-packets': ['mayonnaise'], jelly: ['jelly', 'jam'],
  syrup: ['syrup'], 'bbq-sauce': ['bbq sauce', 'barbecue sauce'], 'salad-dressing': ['dressing'], salsa: ['salsa'], 'hot-sauce': ['hot sauce'],
  relish: ['relish'], vinegar: ['vinegar'], 'baking-powder': ['baking powder'], 'baking-soda': ['baking soda'], yeast: ['yeast'], cornstarch: ['cornstarch'],
  vanilla: ['vanilla extract'],
};

export const WATER_TERMS = ['water'];

/** Never a match: our foods are shelf-stable, and these are freezer, deli or fresh-counter items (or gifts). */
const EXCLUDE_ALWAYS = ['frozen', 'fresh', 'fillet', 'portion', 'deli', 'refrigerated', 'gift', 'kit', 'cleaning'];

/** Look-alikes for particular foods (e.g. tortilla chips aren't tortillas). */
const EXCLUDE: Record<string, string[]> = {
  'tortillas-shelf': ['chip'], 'white-rice': ['taco', 'krispies', 'cake', 'ready rice'], granola: ['bar'],
  'mixed-nuts': ['baby', 'cereal', 'cheerios', 'butter', 'crunch', 'honey nut'], 'canned-chili': ['crisp', 'powder', 'seasoning', 'sauce'],
  honey: ['nut', 'roasted', 'mustard', 'graham', 'dip', 'cereal', 'crunch', 'cheerios', 'oreo', 'maid', 'bbq', 'ham'],
  cinnamon: ['cereal', 'crunch', 'cake', 'roll', 'graham', 'toast', 'wheats', 'bread', 'apple'],
  jelly: ['belly', 'blox', 'bean', 'cellars', 'wine'], 'oats-instant': ['milk', 'oatmilk'], 'oats-rolled': ['milk', 'oatmilk'], relish: ['cranberry'], mustard: ['greens', 'collard', 'turnip'], syrup: ['coffee'],
  'canned-fish': ['smoked', 'steak'], 'canned-veg': ['fries'], salt: ['spray', 'scrub', 'water', 'caramel'], sugar: ['free', 'cookie', 'cereal'],
  'coffee-tea': ['bottle', 'btl', 'frappuccino'],
  'fd-entree': ['breakfast'], 'fd-meal': ['breakfast'], 'fd-fruit': ['treat', 'cat', 'dog'], 'fd-meat': ['treat', 'cat', 'dog'],
};

/** Stores that aren't food retailers (their flyers sometimes share a word with a food). */
const NON_FOOD_STORES = ['dunham', 'ace hardware', 'menards', 'home depot', "lowe's", 'harbor freight', "dick's", 'cabela', 'kohl', 'jcpenney', 'belk', 'old navy', 'tj maxx', 'marshalls', 'petsmart', 'ulta', 'bath & body', 'gamestop', 'hobby lobby', 'michaels', 'office depot', 'ikea'];
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function flyerTerms(foodId: string, foodName: string): string[] {
  if (foodId in FLYER_TERMS) return FLYER_TERMS[foodId];
  const plain = foodName.replace(/\s*\([^)]*\)/g, '').split(/[/,]/)[0].trim().toLowerCase();
  return plain ? [plain] : [];
}

const words = (q: string) => q.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 && w !== 'and');

/** Flyer search is fuzzy; keep items whose name has every word of the search (plurals allowed). */
export function matches(query: string, itemName: string, exclude: string[] = []): boolean {
  const name = itemName.toLowerCase();
  const has = (w: string) => new RegExp(`\\b${escapeRe(w)}`).test(name);
  return words(query).every((w) => has(w.replace(/s$/, ''))) && ![...EXCLUDE_ALWAYS, ...exclude].some(has);
}

/** Food (or emergency food, like buckets) sold by a food retailer (Flipp's category, when it has one). */
export const isGrocery = (i: Pick<FlyerItem, '_L1' | '_L2' | 'merchant_name'>) =>
  (!i._L1 || i._L1 === 'Food, Beverages & Tobacco' || i._L2 === 'Emergency Preparedness') && !NON_FOOD_STORES.some((s) => i.merchant_name.toLowerCase().includes(s));

const money = (n: number) => `$${n.toFixed(2).replace(/\.00$/, '')}`;
const clean = (s?: string | null) => (s ?? '').replace(/\bNone\b/g, '').replace(/\s+/g, ' ').trim();

/** "2/" + 5 → "2 for $5"; "sale" + 5.99 → "$5.99"; "SALE 2 for" + 8 → "2 for $8". */
export function priceText(i: Pick<FlyerItem, 'current_price' | 'pre_price_text' | 'post_price_text'>): string {
  const pre = clean(i.pre_price_text).replace(/^(sale!?\s*)?(price)?\s*/i, '');
  const post = clean(i.post_price_text);
  if (i.current_price == null) return [pre, post].filter(Boolean).join(' ') || 'See flyer';
  const multi = pre.match(/(?:^|\s)(\d+)\s*(?:\/|for)$/i);
  const lead = multi ? `${multi[1]} for ` : pre ? `${pre} ` : '';
  return `${lead}${money(i.current_price)}${post ? ` ${post}` : ''}`;
}

/** Local calendar date (YYYY-MM-DD) of an instant. Flyer end times are just before midnight local. */
const localDate = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** How many the flyer price buys: "2/", "SALE 2 for", "price 3/" → 2, 2, 3; otherwise 1. */
function multiBuy(pre?: string | null): number {
  const m = clean(pre).match(/(?:^|\s)(\d+)\s*(?:\/|for)$/i);
  return m ? Math.max(1, Number(m[1])) : 1;
}

/**
 * The package size in a flyer name: "14.5 oz" → 14.5 oz; "12-14 oz." → 12–14 oz; "2 lb" → 32 oz;
 * "24 ct" → 24 ct. Undefined when there's none, or when a combined ad lists different sizes.
 */
export function parseSize(name: string): { min: number; max: number; unit: 'oz' | 'ct' } | undefined {
  const found: { min: number; max: number; unit: 'oz' | 'ct' }[] = [];
  const re = /(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*(fl\.?\s*oz|oz|lbs?|ct|count)\b/gi;
  for (const m of name.matchAll(re)) {
    const u = m[3].toLowerCase();
    const k = u.startsWith('lb') ? 16 : 1;
    const a = Number(m[1]) * k;
    const b = (m[2] ? Number(m[2]) : Number(m[1])) * k;
    found.push({ min: Math.min(a, b), max: Math.max(a, b), unit: u === 'ct' || u === 'count' ? 'ct' : 'oz' });
  }
  const oz = found.filter((f) => f.unit === 'oz');
  const pick = oz.length ? oz : found;
  if (!pick.length) return undefined;
  const same = pick.every((f) => f.min === pick[0].min && f.max === pick[0].max);
  return same ? pick[0] : undefined;
}

export function toSale(i: FlyerItem, now = Date.now()): Sale | undefined {
  if (i.valid_to && Date.parse(i.valid_to) < now) return undefined;
  return {
    id: i.id,
    store: i.merchant_name.trim(),
    product: clean(i.name).replace(/[®™]/g, '').replace(/�/g, ''),
    price: priceText(i),
    note: clean(i.sale_story) || undefined,
    through: i.valid_to ? localDate(Date.parse(i.valid_to) - 1000) : undefined,
    starts: i.valid_from && Date.parse(i.valid_from) > now ? localDate(Date.parse(i.valid_from)) : undefined,
    image: i.clean_image_url,
    ...unitPrices(i),
  };
}

function unitPrices(i: FlyerItem): Pick<Sale, 'each' | 'perUnit'> {
  if (i.current_price == null || !(i.current_price > 0)) return {};
  const each = i.current_price / multiBuy(i.pre_price_text);
  const size = parseSize(i.name);
  if (!size || !(size.max > 0)) return { each };
  const mid = (size.min + size.max) / 2;
  return { each, perUnit: { value: each / mid, unit: size.unit, approx: size.min !== size.max } };
}

/**
 * The best deal among one food's sales. "unit": cheapest per ounce (or per count), when at
 * least two sales give a size in the same unit. "lowest": cheapest each, when sizes can't be
 * compared (so it says to check sizes). Undefined with fewer than two priced sales.
 */
/** Sold only on the store's website (Costco's "Online Price" features), not on the shelf. */
export const onlineOnly = (s: Sale) => /^online price\b/i.test(s.price);

export function bestSale(sales: Sale[]): { id: number; basis: 'unit' | 'lowest' } | undefined {
  const priced = sales.filter((s) => s.each !== undefined);
  if (priced.length < 2) return undefined;
  for (const unit of ['oz', 'ct'] as const) {
    const sized = priced.filter((s) => s.perUnit?.unit === unit);
    if (sized.length >= 2) {
      const best = sized.reduce((a, b) => (b.perUnit!.value < a.perUnit!.value ? b : a));
      return { id: best.id, basis: 'unit' };
    }
  }
  const best = priced.reduce((a, b) => (b.each! < a.each! ? b : a));
  return { id: best.id, basis: 'lowest' };
}

/** "$0.17/oz" (with "~" for a size range). */
export const unitText = (u: NonNullable<Sale['perUnit']>) => `${u.approx ? '~' : ''}$${u.value.toFixed(2)}/${u.unit}`;

/**
 * Results of several searches for one food: food items that match and are still on, with
 * repeats removed (a store often runs the same item in two flyers), your stores first.
 */
export function salesFor(results: { query: string; items: FlyerItem[] }[], opts: { foodId?: string; now?: number } = {}): Sale[] {
  const exclude = (opts.foodId && EXCLUDE[opts.foodId]) || [];
  const seen = new Set<string>();
  const out: Sale[] = [];
  for (const { query, items } of results) {
    for (const i of items) {
      if (typeof i?.name !== 'string' || typeof i.merchant_name !== 'string' || !isGrocery(i) || !matches(query, i.name, exclude)) continue;
      const s = toSale(i, opts.now);
      if (!s) continue;
      const key = `${s.store}|${s.product}|${s.price}`.toLowerCase();
      if (!seen.has(key)) { seen.add(key); out.push(s); }
    }
  }
  return out.sort((a, b) => Number(isMyStore(b.store)) - Number(isMyStore(a.store)) || a.store.localeCompare(b.store) || a.product.localeCompare(b.product));
}

export const validZip = (z: string) => /^\d{5}$/.test(z.trim());

// ---- Online brand stores (freeze-dried and emergency food) ----

export interface OnlineStore { id: string; name: string; base: string }

/** Brand stores whose public product list includes sale prices. Mountain House first (the family's go-to). */
export const ONLINE_STORES: OnlineStore[] = [
  { id: 'mountain-house', name: 'Mountain House', base: 'https://www.mountainhouse.com' },
  { id: 'readywise', name: 'ReadyWise', base: 'https://readywise.com' },
  { id: 'valley', name: 'Valley Food Storage', base: 'https://www.valleyfoodstorage.com' },
  { id: 'augason', name: 'Augason Farms', base: 'https://www.augasonfarms.com' },
  { id: 'legacy', name: 'Legacy Food Storage', base: 'https://legacyfoodstorage.com' },
];

/** A product from a store's public product list (only the fields we use). */
export interface StoreProduct {
  title: string;
  handle: string;
  product_type?: string;
  images?: { src: string }[];
  variants: { id: number; title: string; price: string; compare_at_price?: string | null; available?: boolean }[];
}

export interface OnlineSale {
  key: string;
  product: string;
  /** Size or pack ("Default Title" dropped). */
  option?: string;
  price: number;
  was: number;
  pctOff: number;
  url: string;
  image?: string;
}

/** Not food: gear and merch that brand stores also sell. */
const NOT_FOOD = /\b(gift card|shirt|hat|mug|sticker|stove|spork|utensil|cup|bowl|blanket|backpack|apparel|merch|water filter)\b/i;

/** Marked-down, in-stock variants (at least `minPct` off), biggest discount first. */
export function onlineSales(products: StoreProduct[], base: string, minPct = 5): OnlineSale[] {
  const out: OnlineSale[] = [];
  for (const p of products) {
    if (!p?.title || !Array.isArray(p.variants) || NOT_FOOD.test(`${p.title} ${p.product_type ?? ''}`)) continue;
    for (const v of p.variants) {
      const price = Number(v.price);
      const was = Number(v.compare_at_price);
      if (v.available === false || !(price > 0) || !(was > price)) continue;
      const pctOff = Math.round((1 - price / was) * 100);
      if (pctOff < minPct) continue;
      out.push({
        key: `${p.handle}-${v.id}`,
        product: p.title.trim(),
        option: v.title && v.title !== 'Default Title' ? v.title : undefined,
        price, was, pctOff,
        url: `${base}/products/${p.handle}?variant=${v.id}`,
        image: p.images?.[0]?.src,
      });
    }
  }
  return out.sort((a, b) => b.pctOff - a.pctOff || a.product.localeCompare(b.product));
}
