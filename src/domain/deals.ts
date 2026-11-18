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
}

/** The family's stores. Sales from other nearby stores can be shown too. */
export const MY_STORES = ['Meijer', 'Aldi', 'Kroger', 'Walmart'];
export const isMyStore = (store: string) => MY_STORES.some((s) => store.toLowerCase().includes(s.toLowerCase()));

/**
 * What flyers call our foods. Empty = not something stores put in weekly flyers.
 * Foods not listed here (custom foods) search by their name.
 */
const FLYER_TERMS: Record<string, string[]> = {
  'beef-jerky': ['jerky'], 'meat-pouch-rte': ['tuna pouch', 'chicken pouch'], 'tofu-shelf': ['tofu'], 'fd-meat': [], 'egg-powder': [],
  'refried-beans-canned': ['refried beans'], 'lentils-dry': ['lentils'], 'split-peas-dry': ['split peas'], 'pinto-beans-dry': ['pinto beans', 'kidney beans'],
  crackers: ['crackers'], granola: ['granola'], cereal: ['cereal'], 'tortillas-shelf': ['tortillas'], 'rice-pouch-rte': ['ready rice', 'rice pouch'],
  'potato-flakes': ['mashed potatoes', 'instant potatoes'], 'white-rice': ['rice'], 'pasta-dry': ['pasta'], 'oats-instant': ['oatmeal'], 'oats-rolled': ['oats'],
  cornmeal: ['cornmeal'], 'flour-wheat': ['flour'], 'wheat-berries': [], pretzels: ['pretzels'], 'applesauce-pouch': ['applesauce'], 'fd-fruit': [],
  'tomato-sauce': ['tomato sauce', 'diced tomatoes'], 'fd-veg': [], 'ravioli-canned': ['ravioli', 'chef boyardee'], 'curry-pouch': ['curry'],
  'meal-pouch-rte': [], 'fd-entree': [], 'fd-meal': [], 'fd-breakfast': [], 'soup-mix-dry': ['soup mix'], 'mac-cheese-cup': ['mac cheese', 'macaroni'],
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
const EXCLUDE_ALWAYS = ['frozen', 'fresh', 'fillet', 'portions', 'deli', 'refrigerated', 'gift', 'kit', 'cleaning'];

/** Look-alikes for particular foods (e.g. tortilla chips aren't tortillas). */
const EXCLUDE: Record<string, string[]> = {
  'tortillas-shelf': ['chip'], 'white-rice': ['taco', 'krispies', 'cake', 'ready rice'], granola: ['bar'],
  'mixed-nuts': ['baby', 'cereal', 'cheerios', 'butter', 'crunch', 'honey nut'], 'canned-chili': ['crisp', 'powder', 'seasoning', 'sauce'],
  honey: ['nut', 'roasted', 'mustard', 'graham', 'dip', 'cereal', 'crunch', 'cheerios', 'oreo', 'maid', 'bbq', 'ham'],
  cinnamon: ['cereal', 'crunch', 'cake', 'roll', 'graham', 'toast', 'wheats', 'bread', 'apple'],
  jelly: ['belly', 'blox', 'bean'], relish: ['cranberry'], mustard: ['greens', 'collard', 'turnip'], syrup: ['coffee'],
  'canned-fish': ['smoked', 'steak'], 'canned-veg': ['fries'], salt: ['spray', 'scrub', 'water', 'caramel'], sugar: ['free', 'cookie', 'cereal'],
  'coffee-tea': ['bottle', 'btl', 'frappuccino'],
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

/** Food sold by a food retailer (Flipp's category, when it has one). */
export const isGrocery = (i: Pick<FlyerItem, '_L1' | 'merchant_name'>) =>
  (!i._L1 || i._L1 === 'Food, Beverages & Tobacco') && !NON_FOOD_STORES.some((s) => i.merchant_name.toLowerCase().includes(s));

const money = (n: number) => `$${n.toFixed(2).replace(/\.00$/, '')}`;
const clean = (s?: string | null) => (s ?? '').replace(/\bNone\b/g, '').replace(/\s+/g, ' ').trim();

/** "2/" + 5 → "2 for $5"; "sale" + 5.99 → "$5.99"; "SALE 2 for" + 8 → "2 for $8". */
export function priceText(i: Pick<FlyerItem, 'current_price' | 'pre_price_text' | 'post_price_text'>): string {
  const pre = clean(i.pre_price_text).replace(/^sale!?\s*/i, '');
  const post = clean(i.post_price_text);
  if (i.current_price == null) return [pre, post].filter(Boolean).join(' ') || 'See flyer';
  const multi = pre.match(/^(\d+)\s*(?:\/|for)$/i);
  const lead = multi ? `${multi[1]} for ` : pre ? `${pre} ` : '';
  return `${lead}${money(i.current_price)}${post ? ` ${post}` : ''}`;
}

/** Local calendar date (YYYY-MM-DD) of an instant. Flyer end times are just before midnight local. */
const localDate = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

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
  };
}

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
