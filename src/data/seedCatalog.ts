// Seed catalog — scope §6. Generic entries only; every entry has verifyLabel=true because
// a generic name never proves allergen-free status (catalog quality rule). Shelf-life
// values are guidance with assumptions, not guarantees. Prefer the actual package label.
import type { Allergen, FoodCategory, FoodForm, FoodItem, PrepMethod, Tier } from '../domain/types';

// v2: adds approximate carbs per serving and rapid-carb tags.
// v3: per-food equipment; whole wheat berries split from flour (different storage and tools).
// v4: servings per batch for realistic fuel estimates.
// v5: more freeze-dried entries (long-term plans can skip canned food).
// v11: sunflower seed butter retired; almond butter added.
// v10: ramen, chocolate hazelnut spread, butter powder, chocolate chips, cocoa powder, cake mix, frosting.
// v9: full nutrition facts (fat, saturated fat, fiber, sugar, sodium) with their source.
// v8: baking supplies & seasonings (new 'pantry' group, incl. salt; cooking oil moves there).
// v7: boxed mac & cheese replaces the cup (same id keeps survey ratings).
// v6: specific freeze-dried meals replaced by generic assorted #10 cans (cheaper, more variety),
//     plus assorted single pouches for the short and medium supplies; instant mashed potatoes.
export const CATALOG_VERSION = 11;

/** Seed entries no longer offered. Untouched copies are retired on upgrade; admin-edited ones stay. */
export const RETIRED_SEED_IDS = ['fd-meal-veg', 'fd-chili', 'fd-chicken-rice', 'sunbutter'];

/** Approximate total carbohydrate grams per listed serving (typical generic values; verify the label). */
const CARBS_G: Record<string, number> = {
  'chicken-canned': 0, 'tuna-canned': 0, 'tuna-pouch': 0, 'salmon-canned': 0, 'sardines-canned': 0, 'beef-jerky': 6,
  'spam-canned': 1, 'meat-pouch-rte': 0, 'tofu-shelf': 2, 'fd-meat': 0, 'egg-powder': 1,
  'black-beans-canned': 20, 'chickpeas-canned': 20, 'kidney-beans-canned': 19, 'refried-beans-canned': 18,
  'lentils-canned': 18, 'lentils-dry': 30, 'split-peas-dry': 30, 'pinto-beans-dry': 29,
  crackers: 10, granola: 35, cereal: 26, 'tortillas-shelf': 24, 'rice-pouch-rte': 46, 'white-rice': 36, 'pasta-dry': 42,
  'oats-instant': 32, 'oats-rolled': 27, cornmeal: 23, 'flour-wheat': 23, 'wheat-berries': 34, pretzels: 23,
  'fruit-cups': 18, 'applesauce-pouch': 12, 'canned-peaches': 15, raisins: 31, 'fd-fruit': 12, 'canned-pineapple': 18,
  'green-beans-canned': 4, 'corn-canned': 13, 'carrots-canned': 7, 'tomato-sauce': 8, 'veg-pouch': 8, 'fd-veg': 6,
  'chili-canned': 25, 'veg-chili-canned': 30, 'beef-stew-canned': 18, 'soup-rte': 18, 'ravioli-canned': 33,
  'curry-pouch': 25, 'meal-pouch-rte': 35, 'fd-entree': 40, 'potato-flakes': 17, ramen: 52, nutella: 22, 'butter-powder': 3, 'chocolate-chips': 9, 'cocoa-powder': 3, 'cake-mix': 35, frosting: 21, salt: 0, 'black-pepper': 0, sugar: 12.5, bouillon: 1, honey: 17, 'garlic-powder': 1, 'onion-powder': 1, 'chili-powder': 1, cumin: 0, 'italian-seasoning': 0, cinnamon: 1, 'soy-sauce': 1, 'hot-sauce': 0, vinegar: 0, 'baking-powder': 1, 'baking-soda': 0, yeast: 2, cornstarch: 7, vanilla: 0.5, 'fd-meal': 40, 'fd-breakfast': 15, 'fd-corn-peas': 15, 'soup-mix-dry': 25, 'mac-cheese-cup': 30,
  'peanut-butter': 7, 'pb-packets': 7, 'almond-butter': 6, 'mixed-nuts': 6, 'trail-mix': 15, 'granola-bars': 29,
  'protein-bars': 22, 'cooking-oil': 0, 'hard-candy': 15, 'glucose-tabs': 16, 'glucose-gel': 15,
  'shelf-milk': 12, 'shelf-plant-milk': 8, 'powdered-milk': 12, 'juice-boxes': 22, 'electrolyte-mix': 10,
  'coffee-tea': 0, 'cocoa-mix': 22,
};
const SEED_DATE = '2026-11-14';

const SRC = {
  cannedHighAcid: { min: 12, max: 18, source: 'USDA FSIS [R4]', sourceDate: '2024-09-18', storage: 'Cool, dry, dark; unopened', assumptions: 'High-acid canned food, best quality window under proper storage' },
  cannedLowAcid: { min: 24, max: 60, source: 'USDA FSIS [R4]', sourceDate: '2024-09-18', storage: 'Cool, dry, dark; unopened', assumptions: 'Low-acid canned food, best quality window under proper storage' },
  pouch: { min: 12, max: 24, source: 'Package label (typical)', storage: 'Room temperature; unopened', assumptions: 'Retort pouch; varies widely by product' },
  shortDry: { min: 6, max: 12, source: 'UGA Extension [R10]', sourceDate: '2024-10-02', storage: 'Cool, dry; airtight after opening', assumptions: 'Short-term pantry item' },
  highFat: { min: 6, max: 12, source: 'UGA Extension [R5]', sourceDate: '2024-10-02', storage: 'Cool, dark; rotate', assumptions: 'High-fat foods go rancid sooner' },
  longDry: { min: 60, max: 360, source: 'UGA Extension [R5]', sourceDate: '2024-10-02', storage: 'Food-safe bulk packaging (mylar/O2 absorber or sealed bucket), cool & dry', assumptions: 'Only when properly packaged for long-term storage; otherwise ~12 months' },
  freezeDried: { min: 120, max: 360, source: 'Manufacturer label (typical)', storage: 'Sealed #10 can or pouch, cool & dry', assumptions: 'Commercially packed; check manufacturer date' },
  drink: { min: 6, max: 12, source: 'Package label (typical)', storage: 'Room temperature; unopened', assumptions: 'Shelf-stable beverage' },
} satisfies Record<string, SL>;

interface SL {
  min: number;
  max: number;
  source: string;
  sourceDate?: string;
  storage: string;
  assumptions: string;
}

interface Seed {
  id: string;
  name: string;
  category: FoodCategory;
  form: FoodForm;
  examples?: string;
  tags?: string[];
  contains?: Allergen[];
  mayContain?: Allergen[];
  prep: PrepMethod;
  cookMin?: number;
  /** Servings per cooking batch (fuel estimate); default 4. */
  batch?: number;
  water?: number; // cups prep water per serving
  sl: SL;
  serving: string;
  kcal: number;
  protein?: number;
  pkg: string;
  servings: number;
  volL?: number;
  cost?: 1 | 2 | 3;
  rot?: 1 | 2 | 3;
  dur?: 1 | 2 | 3;
  role: FoodItem['mealRole'];
  notes?: string;
  /** Extra equipment beyond what the prep method implies. */
  equip?: string[];
  /** Pantry items: servings used per person per day, and the smallest plan that includes it. */
  use?: number;
  from?: Tier;
}

const S: Seed[] = [
  // ---- Proteins ----
  { id: 'chicken-canned', name: 'Canned chicken (pull-tab)', category: 'protein', form: 'canned', examples: 'Chunk white chicken', tags: ['high-protein', 'poultry'], prep: 'ready-to-eat', sl: SRC.cannedLowAcid, serving: '2 oz', kcal: 70, protein: 13, pkg: '12.5 oz can', servings: 6, volL: 0.4, cost: 2, role: 'main' },
  { id: 'tuna-canned', name: 'Canned tuna (pull-tab)', category: 'protein', form: 'canned', tags: ['high-protein', 'fish'], contains: ['fish'], prep: 'ready-to-eat', sl: SRC.cannedLowAcid, serving: '2 oz', kcal: 60, protein: 13, pkg: '5 oz can', servings: 2, volL: 0.18, cost: 1, role: 'main' },
  { id: 'tuna-pouch', name: 'Tuna pouch', category: 'protein', form: 'pouch', tags: ['high-protein', 'fish'], contains: ['fish'], prep: 'ready-to-eat', sl: SRC.pouch, serving: '2.5 oz', kcal: 80, protein: 17, pkg: '2.5 oz pouch', servings: 1, volL: 0.1, cost: 2, role: 'main' },
  { id: 'salmon-canned', name: 'Canned salmon', category: 'protein', form: 'canned', tags: ['high-protein', 'fish'], contains: ['fish'], prep: 'ready-to-eat', sl: SRC.cannedLowAcid, serving: '2 oz', kcal: 90, protein: 12, pkg: '14.75 oz can', servings: 7, volL: 0.45, cost: 2, role: 'main' },
  { id: 'sardines-canned', name: 'Canned sardines', category: 'protein', form: 'canned', tags: ['high-protein', 'fish'], contains: ['fish'], prep: 'ready-to-eat', sl: SRC.cannedLowAcid, serving: '1 can', kcal: 190, protein: 22, pkg: '3.75 oz tin', servings: 1, volL: 0.12, cost: 1, role: 'main' },
  { id: 'beef-jerky', name: 'Beef jerky', category: 'protein', form: 'pouch', tags: ['high-protein', 'beef', 'kid-friendly'], contains: ['soy'], prep: 'ready-to-eat', sl: SRC.shortDry, serving: '1 oz', kcal: 80, protein: 11, pkg: '3 oz bag', servings: 3, volL: 0.3, cost: 3, rot: 3, role: 'snack', notes: 'Often contains soy sauce/wheat — verify label' },
  { id: 'spam-canned', name: 'Canned luncheon meat', category: 'protein', form: 'canned', tags: ['pork', 'high-protein'], prep: 'ready-to-eat', sl: SRC.cannedLowAcid, serving: '2 oz', kcal: 180, protein: 7, pkg: '12 oz can', servings: 6, volL: 0.35, cost: 2, role: 'main' },
  { id: 'meat-pouch-rte', name: 'Ready-to-eat shelf-stable meat pouch', category: 'protein', form: 'pouch', tags: ['high-protein'], prep: 'ready-to-eat', sl: SRC.pouch, serving: '1 pouch', kcal: 110, protein: 15, pkg: '2.6 oz pouch', servings: 1, volL: 0.1, cost: 2, role: 'main' },
  { id: 'tofu-shelf', name: 'Shelf-stable silken tofu', category: 'protein', form: 'box', tags: ['vegan', 'vegetarian', 'high-protein'], contains: ['soy'], prep: 'ready-to-eat', sl: SRC.pouch, serving: '3 oz', kcal: 50, protein: 5, pkg: '12 oz aseptic box', servings: 4, volL: 0.4, cost: 1, role: 'main', notes: 'Only if labeled shelf-stable; many tofu products need refrigeration' },
  { id: 'fd-meat', name: 'Freeze-dried diced chicken/beef', category: 'protein', form: 'freeze-dried', tags: ['high-protein'], prep: 'add-hot-water', cookMin: 10, batch: 8, water: 0.5, sl: SRC.freezeDried, serving: '1/2 cup', kcal: 90, protein: 16, pkg: '#10 can', servings: 28, volL: 3.5, cost: 3, rot: 1, role: 'main' },
  { id: 'egg-powder', name: 'Powdered whole egg', category: 'protein', form: 'dry', tags: ['vegetarian'], contains: ['egg'], prep: 'heat', cookMin: 5, batch: 4, water: 0.25, sl: SRC.freezeDried, serving: '2 tbsp (1 egg)', kcal: 80, protein: 6, pkg: '#10 can', servings: 72, volL: 3.5, cost: 2, role: 'staple' , equip: ['Skillet', 'Whisk or fork'] },

  // ---- Legumes ----
  { id: 'black-beans-canned', name: 'Canned black beans', category: 'legume', form: 'canned', tags: ['vegan', 'vegetarian', 'high-protein'], prep: 'ready-to-eat', sl: SRC.cannedLowAcid, serving: '1/2 cup', kcal: 110, protein: 7, pkg: '15 oz can', servings: 3.5, volL: 0.45, cost: 1, role: 'side' },
  { id: 'chickpeas-canned', name: 'Canned chickpeas', category: 'legume', form: 'canned', tags: ['vegan', 'vegetarian', 'high-protein'], prep: 'ready-to-eat', sl: SRC.cannedLowAcid, serving: '1/2 cup', kcal: 120, protein: 6, pkg: '15 oz can', servings: 3.5, volL: 0.45, cost: 1, role: 'side' },
  { id: 'kidney-beans-canned', name: 'Canned kidney beans', category: 'legume', form: 'canned', tags: ['vegan', 'vegetarian'], prep: 'ready-to-eat', sl: SRC.cannedLowAcid, serving: '1/2 cup', kcal: 110, protein: 7, pkg: '15 oz can', servings: 3.5, volL: 0.45, cost: 1, role: 'side' },
  { id: 'refried-beans-canned', name: 'Canned refried beans', category: 'legume', form: 'canned', tags: ['vegetarian', 'kid-friendly'], prep: 'ready-to-eat', sl: SRC.cannedLowAcid, serving: '1/2 cup', kcal: 120, protein: 6, pkg: '16 oz can', servings: 3.5, volL: 0.45, cost: 1, role: 'side', notes: 'Some contain lard — check if vegetarian needed' },
  { id: 'lentils-canned', name: 'Canned lentils', category: 'legume', form: 'canned', tags: ['vegan', 'vegetarian', 'high-protein'], prep: 'ready-to-eat', sl: SRC.cannedLowAcid, serving: '1/2 cup', kcal: 110, protein: 8, pkg: '15 oz can', servings: 3.5, volL: 0.45, cost: 1, role: 'side' },
  { id: 'lentils-dry', name: 'Dry lentils', category: 'legume', form: 'dry', tags: ['vegan', 'vegetarian', 'high-protein'], prep: 'simmer', cookMin: 25, batch: 8, water: 1, sl: SRC.longDry, serving: '1/4 cup dry', kcal: 170, protein: 12, pkg: '2 lb bag', servings: 20, volL: 1.2, cost: 1, role: 'staple' },
  { id: 'split-peas-dry', name: 'Dry split peas', category: 'legume', form: 'dry', tags: ['vegan', 'vegetarian', 'high-protein'], prep: 'simmer', cookMin: 40, batch: 8, water: 1, sl: SRC.longDry, serving: '1/4 cup dry', kcal: 170, protein: 12, pkg: '2 lb bag', servings: 20, volL: 1.2, cost: 1, role: 'staple' , equip: ['Large pot'] },
  { id: 'pinto-beans-dry', name: 'Dry pinto/kidney beans', category: 'legume', form: 'dry', tags: ['vegan', 'vegetarian', 'high-protein'], prep: 'boil', cookMin: 90, batch: 12, water: 1.5, sl: SRC.longDry, serving: '1/4 cup dry', kcal: 160, protein: 10, pkg: '4 lb bag', servings: 40, volL: 2.4, cost: 1, role: 'staple', notes: 'Requires soaking and long boil — high fuel and water burden. Dry kidney beans must be fully boiled (toxic if undercooked).' , equip: ['Large pot for soaking and cooking', 'Pressure cooker (optional; saves a lot of fuel)'] },

  // ---- Grains / starches ----
  { id: 'crackers', name: 'Crackers', category: 'grain', form: 'box', tags: ['vegetarian', 'kid-friendly'], contains: ['wheat', 'gluten'], prep: 'ready-to-eat', sl: SRC.shortDry, serving: '5 crackers', kcal: 80, pkg: '13 oz box', servings: 12, volL: 1.2, cost: 1, rot: 3, role: 'side' },
  { id: 'granola', name: 'Granola', category: 'grain', form: 'pouch', tags: ['vegetarian', 'kid-friendly'], contains: ['wheat', 'gluten'], mayContain: ['tree-nut', 'peanut'], prep: 'ready-to-eat', sl: SRC.shortDry, serving: '1/2 cup', kcal: 230, protein: 5, pkg: '12 oz bag', servings: 6, volL: 0.8, cost: 2, rot: 3, role: 'main' },
  { id: 'cereal', name: 'Breakfast cereal', category: 'grain', form: 'box', tags: ['vegetarian', 'kid-friendly'], contains: ['wheat', 'gluten'], prep: 'ready-to-eat', sl: SRC.shortDry, serving: '1 cup', kcal: 130, protein: 3, pkg: '12 oz box', servings: 10, volL: 2.5, cost: 2, rot: 3, role: 'main', notes: 'Pairs with shelf-stable milk' },
  { id: 'tortillas-shelf', name: 'Shelf-stable tortillas', category: 'grain', form: 'pouch', tags: ['vegetarian', 'kid-friendly'], contains: ['wheat', 'gluten'], prep: 'ready-to-eat', sl: { ...SRC.shortDry, min: 3, max: 6 }, serving: '1 tortilla', kcal: 140, protein: 4, pkg: '10-count pack', servings: 10, volL: 0.8, cost: 1, rot: 3, role: 'side' },
  { id: 'rice-pouch-rte', name: 'Ready-to-eat rice pouch', category: 'grain', form: 'pouch', tags: ['vegan', 'vegetarian', 'gluten-free'], prep: 'ready-to-eat', sl: SRC.pouch, serving: '1 cup', kcal: 220, protein: 4, pkg: '8.8 oz pouch', servings: 2, volL: 0.3, cost: 2, role: 'side', notes: 'Only if label says safe to eat without heating' },
  { id: 'potato-flakes', name: 'Instant mashed potatoes (flakes)', category: 'grain', form: 'dry', tags: ['vegetarian', 'gluten-free', 'kid-friendly'], mayContain: ['milk'], prep: 'add-hot-water', cookMin: 5, batch: 8, water: 0.5, sl: { ...SRC.longDry, min: 60, max: 300 }, serving: '1/2 cup prepared', kcal: 80, protein: 2, pkg: '#10 can', servings: 45, volL: 3.5, cost: 1, rot: 1, role: 'staple', notes: 'Plain flakes are usually just potato; flavored ones often contain milk or butter. Stir in powdered milk and a little oil or butter for richer potatoes.' },
  { id: 'white-rice', name: 'White rice', category: 'grain', form: 'dry', tags: ['vegan', 'vegetarian', 'gluten-free'], prep: 'simmer', cookMin: 20, batch: 8, water: 0.5, sl: SRC.longDry, serving: '1/4 cup dry', kcal: 160, protein: 3, pkg: '10 lb bag', servings: 100, volL: 6, cost: 1, role: 'staple' },
  { id: 'pasta-dry', name: 'Dry pasta', category: 'grain', form: 'dry', tags: ['vegan', 'vegetarian', 'kid-friendly'], contains: ['wheat', 'gluten'], prep: 'boil', cookMin: 12, batch: 8, water: 2, sl: { ...SRC.longDry, min: 24, max: 360 }, serving: '2 oz dry', kcal: 200, protein: 7, pkg: '1 lb box', servings: 8, volL: 1, cost: 1, role: 'staple' , equip: ['Colander or slotted spoon'] },
  { id: 'oats-instant', name: 'Instant oats', category: 'grain', form: 'packet', tags: ['vegan', 'vegetarian', 'kid-friendly'], mayContain: ['wheat', 'gluten'], prep: 'add-hot-water', cookMin: 5, batch: 6, water: 0.75, sl: SRC.shortDry, serving: '1 packet', kcal: 160, protein: 4, pkg: '10-packet box', servings: 10, volL: 1, cost: 1, role: 'main', notes: 'Can be soaked in cold water if no heat' },
  { id: 'oats-rolled', name: 'Rolled oats (bulk)', category: 'grain', form: 'dry', tags: ['vegan', 'vegetarian'], mayContain: ['wheat', 'gluten'], prep: 'simmer', cookMin: 5, batch: 6, water: 1, sl: SRC.longDry, serving: '1/2 cup dry', kcal: 150, protein: 5, pkg: '42 oz canister', servings: 30, volL: 3, cost: 1, role: 'staple' },
  { id: 'cornmeal', name: 'Cornmeal', category: 'grain', form: 'dry', tags: ['vegan', 'vegetarian', 'gluten-free'], contains: ['corn'], prep: 'simmer', cookMin: 20, batch: 6, water: 1, sl: { ...SRC.longDry, min: 12, max: 120 }, serving: '1/4 cup', kcal: 110, protein: 2, pkg: '2 lb bag', servings: 25, volL: 1.5, cost: 1, role: 'staple' },
  { id: 'flour-wheat', name: 'Wheat flour', category: 'grain', form: 'bulk', tags: ['vegan', 'vegetarian'], contains: ['wheat', 'gluten'], prep: 'heat', cookMin: 10, batch: 4, water: 0.25, sl: { ...SRC.shortDry, min: 6, max: 12, assumptions: 'White flour in an airtight container; whole-wheat flour goes rancid sooner' }, serving: '1/4 cup', kcal: 110, protein: 3, pkg: '25 lb bag', servings: 200, volL: 18, cost: 1, role: 'staple', notes: 'For flatbread, pancakes or bread; needs fuel', equip: ['Mixing bowl', 'Skillet or Dutch oven for flatbread or bread'] },
  { id: 'wheat-berries', name: 'Hard wheat berries (whole grain)', category: 'grain', form: 'bulk', tags: ['vegan', 'vegetarian'], contains: ['wheat', 'gluten'], prep: 'heat', cookMin: 10, batch: 4, water: 0.25, sl: { ...SRC.longDry, min: 120, max: 360 }, serving: '1/4 cup (ground into flour)', kcal: 160, protein: 6, pkg: '25 lb bucket', servings: 220, volL: 22, cost: 1, dur: 3, role: 'staple', notes: 'Must be ground into flour or cooked whole as a hot cereal', equip: ['Grain mill (a hand-crank mill works without power)', 'Mixing bowl', 'Skillet or Dutch oven for flatbread or bread'] },
  { id: 'pretzels', name: 'Pretzels', category: 'grain', form: 'pouch', tags: ['vegetarian', 'kid-friendly'], contains: ['wheat', 'gluten'], prep: 'ready-to-eat', sl: SRC.shortDry, serving: '1 oz', kcal: 110, protein: 3, pkg: '16 oz bag', servings: 16, volL: 2, cost: 1, rot: 3, role: 'snack' },

  // ---- Fruit ----
  { id: 'fruit-cups', name: 'Fruit cups', category: 'fruit', form: 'canned', tags: ['vegan', 'vegetarian', 'kid-friendly'], prep: 'ready-to-eat', sl: SRC.cannedHighAcid, serving: '1 cup', kcal: 70, pkg: '4-pack', servings: 4, volL: 0.5, cost: 1, rot: 2, role: 'side' },
  { id: 'applesauce-pouch', name: 'Applesauce pouches', category: 'fruit', form: 'pouch', tags: ['vegan', 'vegetarian', 'kid-friendly', 'soft-texture'], prep: 'ready-to-eat', sl: SRC.cannedHighAcid, serving: '1 pouch', kcal: 50, pkg: '12-pack', servings: 12, volL: 1.2, cost: 1, rot: 2, role: 'side' },
  { id: 'canned-peaches', name: 'Canned peaches/pears', category: 'fruit', form: 'canned', tags: ['vegan', 'vegetarian', 'kid-friendly'], prep: 'ready-to-eat', sl: SRC.cannedHighAcid, serving: '1/2 cup', kcal: 60, pkg: '15 oz can', servings: 3.5, volL: 0.45, cost: 1, rot: 2, role: 'side' },
  { id: 'raisins', name: 'Raisins / dried fruit', category: 'fruit', form: 'pouch', tags: ['vegan', 'vegetarian', 'kid-friendly'], prep: 'ready-to-eat', sl: SRC.shortDry, serving: '1/4 cup', kcal: 120, pkg: '20 oz canister', servings: 18, volL: 0.9, cost: 1, role: 'snack' },
  { id: 'fd-fruit', name: 'Freeze-dried fruit', category: 'fruit', form: 'freeze-dried', tags: ['vegan', 'vegetarian', 'kid-friendly'], prep: 'ready-to-eat', sl: SRC.freezeDried, serving: '1/2 cup', kcal: 50, pkg: '#10 can', servings: 30, volL: 3.5, cost: 3, rot: 1, role: 'snack' },
  { id: 'canned-pineapple', name: 'Canned pineapple', category: 'fruit', form: 'canned', tags: ['vegan', 'vegetarian'], prep: 'ready-to-eat', sl: SRC.cannedHighAcid, serving: '1/2 cup', kcal: 70, pkg: '20 oz can', servings: 4.5, volL: 0.55, cost: 1, rot: 2, role: 'side' },

  // ---- Vegetables ----
  { id: 'green-beans-canned', name: 'Canned green beans', category: 'vegetable', form: 'canned', tags: ['vegan', 'vegetarian'], prep: 'ready-to-eat', sl: SRC.cannedLowAcid, serving: '1/2 cup', kcal: 20, pkg: '14.5 oz can', servings: 3.5, volL: 0.45, cost: 1, role: 'side' },
  { id: 'corn-canned', name: 'Canned corn', category: 'vegetable', form: 'canned', tags: ['vegan', 'vegetarian', 'kid-friendly'], contains: ['corn'], prep: 'ready-to-eat', sl: SRC.cannedLowAcid, serving: '1/2 cup', kcal: 60, pkg: '15 oz can', servings: 3.5, volL: 0.45, cost: 1, role: 'side' },
  { id: 'carrots-canned', name: 'Canned carrots / mixed vegetables', category: 'vegetable', form: 'canned', tags: ['vegan', 'vegetarian'], prep: 'ready-to-eat', sl: SRC.cannedLowAcid, serving: '1/2 cup', kcal: 35, pkg: '15 oz can', servings: 3.5, volL: 0.45, cost: 1, role: 'side' },
  { id: 'tomato-sauce', name: 'Tomato sauce / diced tomatoes', category: 'vegetable', form: 'canned', tags: ['vegan', 'vegetarian'], prep: 'ready-to-eat', sl: SRC.cannedHighAcid, serving: '1/2 cup', kcal: 40, pkg: '15 oz can', servings: 3.5, volL: 0.45, cost: 1, rot: 2, role: 'side' },
  { id: 'veg-pouch', name: 'Shelf-stable vegetable pouch', category: 'vegetable', form: 'pouch', tags: ['vegan', 'vegetarian'], prep: 'ready-to-eat', sl: SRC.pouch, serving: '1/2 cup', kcal: 40, pkg: '10 oz pouch', servings: 2.5, volL: 0.3, cost: 2, role: 'side' },
  { id: 'fd-corn-peas', name: 'Freeze-dried corn / peas', category: 'vegetable', form: 'freeze-dried', tags: ['vegan', 'vegetarian', 'kid-friendly'], contains: ['corn'], prep: 'ready-to-eat', sl: SRC.freezeDried, serving: '1/2 cup', kcal: 70, protein: 3, pkg: '#10 can', servings: 30, volL: 3.5, cost: 3, rot: 1, role: 'side', notes: 'Crunchy as a snack, or soak in water for a few minutes' },
  { id: 'fd-veg', name: 'Freeze-dried / dehydrated vegetables', category: 'vegetable', form: 'freeze-dried', tags: ['vegan', 'vegetarian'], prep: 'add-hot-water', cookMin: 10, batch: 8, water: 0.5, sl: SRC.freezeDried, serving: '1/2 cup', kcal: 30, pkg: '#10 can', servings: 40, volL: 3.5, cost: 3, rot: 1, role: 'side' },

  // ---- Complete meals ----
  { id: 'chili-canned', name: 'Canned chili', category: 'meal', form: 'canned', tags: ['beef', 'high-protein'], prep: 'ready-to-eat', sl: SRC.cannedLowAcid, serving: '1 cup', kcal: 260, protein: 15, pkg: '15 oz can', servings: 2, volL: 0.45, cost: 2, role: 'main', notes: 'Edible cold; better warmed' },
  { id: 'veg-chili-canned', name: 'Canned vegetarian chili', category: 'meal', form: 'canned', tags: ['vegetarian', 'vegan', 'high-protein'], prep: 'ready-to-eat', sl: SRC.cannedLowAcid, serving: '1 cup', kcal: 210, protein: 11, pkg: '15 oz can', servings: 2, volL: 0.45, cost: 2, role: 'main' },
  { id: 'beef-stew-canned', name: 'Canned beef stew', category: 'meal', form: 'canned', tags: ['beef'], contains: ['wheat'], prep: 'ready-to-eat', sl: SRC.cannedLowAcid, serving: '1 cup', kcal: 220, protein: 11, pkg: '20 oz can', servings: 2.5, volL: 0.6, cost: 2, role: 'main' },
  { id: 'soup-rte', name: 'Ready-to-eat canned soup', category: 'meal', form: 'canned', tags: ['kid-friendly'], contains: ['wheat', 'milk'], prep: 'ready-to-eat', sl: SRC.cannedLowAcid, serving: '1 cup', kcal: 120, protein: 6, pkg: '18.6 oz can', servings: 2, volL: 0.55, cost: 1, role: 'main', notes: 'Choose "ready to serve" not condensed for no-water scenarios' },
  { id: 'ravioli-canned', name: 'Canned ravioli / pasta meals', category: 'meal', form: 'canned', tags: ['kid-friendly', 'beef'], contains: ['wheat', 'gluten', 'milk', 'egg'], prep: 'ready-to-eat', sl: SRC.cannedLowAcid, serving: '1 cup', kcal: 230, protein: 8, pkg: '15 oz can', servings: 2, volL: 0.45, cost: 1, role: 'main' },
  { id: 'curry-pouch', name: 'Shelf-stable curry / bean dish pouch', category: 'meal', form: 'pouch', tags: ['vegetarian', 'vegan'], prep: 'ready-to-eat', sl: SRC.pouch, serving: '1 pouch', kcal: 200, protein: 7, pkg: '10 oz pouch', servings: 1, volL: 0.3, cost: 2, role: 'main', notes: 'Many Indian-style pouches are edible cold — check label; may contain dairy' },
  { id: 'meal-pouch-rte', name: 'Ready-to-eat meal pouch (MRE-style)', category: 'meal', form: 'pouch', tags: ['high-protein'], contains: ['wheat', 'milk', 'soy'], prep: 'ready-to-eat', sl: { ...SRC.pouch, min: 36, max: 60 }, serving: '1 entree', kcal: 300, protein: 15, pkg: '1 entree', servings: 1, volL: 0.35, cost: 3, role: 'main' },
  { id: 'fd-entree', name: 'Freeze-dried entrées, assorted (#10 cans)', category: 'meal', form: 'freeze-dried', examples: 'Any mix of flavors, e.g. chili mac, beef stroganoff, teriyaki chicken & rice, pasta primavera, rice & beans', tags: [], contains: ['wheat', 'milk', 'soy'], mayContain: ['egg'], prep: 'add-hot-water', cookMin: 10, batch: 4, water: 1, sl: SRC.freezeDried, serving: '1 cup', kcal: 260, protein: 13, pkg: '#10 can', servings: 10, volL: 3.5, cost: 2, rot: 1, role: 'main', notes: 'Buy a variety of flavors. Most contain wheat, milk and soy; some also contain egg, fish, shellfish, peanut, tree nuts or sesame. Check every can against your family’s allergies and restrictions, and look for vegetarian flavors if anyone needs them.' },
  { id: 'fd-meal', name: 'Freeze-dried meal pouches, assorted', category: 'meal', form: 'freeze-dried', examples: 'Any mix of flavors in single pouches, e.g. chili mac, beef stroganoff, chicken & rice, breakfast skillet', tags: [], contains: ['wheat', 'milk', 'soy'], mayContain: ['egg'], prep: 'add-cold-water', water: 1, sl: SRC.freezeDried, serving: '1 cup', kcal: 270, protein: 13, pkg: '2-serving pouch', servings: 2, volL: 0.6, cost: 3, rot: 1, role: 'main', notes: 'Hot water is best (about 10 minutes); cold water works too in about 20–30 minutes, so they suit no-cook days. Eat from the pouch, no dishes. Most contain wheat, milk and soy; some also contain egg, fish, shellfish, peanut, tree nuts or sesame. Check every pouch against your family’s allergies and restrictions.' },
  { id: 'fd-breakfast', name: 'Freeze-dried breakfasts, assorted (#10 cans)', category: 'meal', form: 'freeze-dried', examples: 'Any mix, e.g. scrambled eggs, breakfast skillet, granola with milk, oatmeal', tags: ['vegetarian'], contains: ['egg', 'milk'], mayContain: ['wheat', 'soy'], prep: 'add-hot-water', cookMin: 5, batch: 4, water: 0.75, sl: SRC.freezeDried, serving: '1 cup', kcal: 230, protein: 12, pkg: '#10 can', servings: 10, volL: 3.5, cost: 2, rot: 1, role: 'main', notes: 'Buy a variety. Egg dishes contain egg and usually milk; granola and oatmeal kinds may contain wheat, nuts or soy instead. Check every can against your family’s allergies and restrictions; some breakfast skillets include meat.' },
  { id: 'soup-mix-dry', name: 'Dry soup mix', category: 'meal', form: 'dry', tags: ['vegetarian'], contains: ['wheat'], prep: 'simmer', cookMin: 20, batch: 8, water: 1.5, sl: SRC.longDry, serving: '1 cup prepared', kcal: 150, protein: 6, pkg: '1 lb bag', servings: 8, volL: 0.8, cost: 1, role: 'main' },
  { id: 'mac-cheese-cup', name: 'Boxed macaroni & cheese', category: 'meal', form: 'box', examples: 'Any brand of boxed mac & cheese', tags: ['vegetarian', 'kid-friendly', 'comfort'], contains: ['wheat', 'gluten', 'milk'], prep: 'boil', cookMin: 12, batch: 6, water: 1.5, sl: { ...SRC.shortDry, min: 12, max: 24 }, serving: '1 cup prepared', kcal: 260, protein: 9, pkg: '7.25 oz box', servings: 3, volL: 0.6, cost: 1, rot: 2, role: 'main', notes: 'Without fresh milk and butter, use powdered milk and a spoon of oil. Boiling water can be saved for washing up.', equip: ['Cooking pot with lid', 'Colander or strainer'] },

  // ---- Fats / snacks ----
  { id: 'peanut-butter', name: 'Peanut butter', category: 'fat-snack', form: 'jar', tags: ['vegan', 'vegetarian', 'high-protein', 'kid-friendly'], contains: ['peanut'], prep: 'ready-to-eat', sl: SRC.highFat, serving: '2 tbsp', kcal: 190, protein: 7, pkg: '16 oz jar', servings: 14, volL: 0.5, cost: 1, rot: 2, role: 'side' },
  { id: 'pb-packets', name: 'Nut/seed butter single-serve packets', category: 'fat-snack', form: 'packet', tags: ['vegan', 'vegetarian', 'kid-friendly'], contains: ['peanut'], mayContain: ['tree-nut'], prep: 'ready-to-eat', sl: SRC.highFat, serving: '1 packet', kcal: 190, protein: 7, pkg: '10-pack', servings: 10, volL: 0.3, cost: 2, rot: 2, role: 'side' },
  { id: 'almond-butter', name: 'Almond butter', category: 'fat-snack', form: 'jar', examples: 'No-stir almond butter keeps best at room temperature', tags: ['vegan', 'vegetarian'], contains: ['tree-nut'], prep: 'ready-to-eat', sl: { ...SRC.highFat, assumptions: 'Unopened, no refrigeration needed. Once opened, a few months in a cool pantry; natural (oil-on-top) brands keep longer in the fridge' }, serving: '2 tbsp', kcal: 190, protein: 7, pkg: '16 oz jar', servings: 14, volL: 0.5, cost: 3, rot: 2, role: 'snack', notes: 'Tree nut: not for anyone with a tree-nut allergy. Rotate; nut butters go stale (rancid) faster than most pantry food.' },
  { id: 'mixed-nuts', name: 'Mixed nuts', category: 'fat-snack', form: 'jar', tags: ['vegan', 'vegetarian', 'high-protein'], contains: ['tree-nut'], mayContain: ['peanut'], prep: 'ready-to-eat', sl: SRC.highFat, serving: '1 oz', kcal: 170, protein: 5, pkg: '16 oz can', servings: 16, volL: 0.6, cost: 2, rot: 2, role: 'snack' },
  { id: 'trail-mix', name: 'Trail mix', category: 'fat-snack', form: 'pouch', tags: ['vegetarian', 'kid-friendly'], contains: ['peanut', 'tree-nut'], mayContain: ['milk', 'soy'], prep: 'ready-to-eat', sl: SRC.highFat, serving: '1/4 cup', kcal: 170, protein: 5, pkg: '26 oz bag', servings: 20, volL: 1, cost: 2, rot: 2, role: 'snack' },
  { id: 'granola-bars', name: 'Granola / cereal bars', category: 'fat-snack', form: 'box', tags: ['vegetarian', 'kid-friendly'], contains: ['wheat', 'gluten'], mayContain: ['peanut', 'tree-nut'], prep: 'ready-to-eat', sl: SRC.shortDry, serving: '1 bar', kcal: 190, protein: 4, pkg: '12-count box', servings: 12, volL: 0.6, cost: 1, rot: 2, role: 'snack' },
  { id: 'protein-bars', name: 'Protein bars', category: 'fat-snack', form: 'box', tags: ['high-protein'], contains: ['milk', 'soy'], mayContain: ['peanut', 'tree-nut'], prep: 'ready-to-eat', sl: SRC.shortDry, serving: '1 bar', kcal: 220, protein: 20, pkg: '12-count box', servings: 12, volL: 0.6, cost: 3, rot: 2, role: 'snack' },
  { id: 'cooking-oil', name: 'Cooking oil', category: 'pantry', form: 'bottle', tags: ['vegan', 'vegetarian'], prep: 'heat', sl: SRC.highFat, serving: '1 tbsp', kcal: 120, pkg: '48 oz bottle', servings: 96, volL: 1.5, cost: 1, rot: 3, role: 'staple', use: 0.5, from: 'short', notes: 'Rotate — oils go rancid; needed for long-term calorie density' },
  { id: 'hard-candy', name: 'Hard candy', category: 'fat-snack', form: 'pouch', tags: ['vegan', 'rapid-carb'], prep: 'ready-to-eat', sl: { ...SRC.shortDry, min: 12, max: 24 }, serving: '4 pieces', kcal: 60, pkg: '1 lb bag', servings: 25, volL: 0.6, cost: 1, role: 'snack', notes: 'Fast-acting carb source; carb content varies by brand' },
  { id: 'glucose-tabs', name: 'Glucose tablets', category: 'fat-snack', form: 'box', tags: ['vegan', 'rapid-carb', 'gluten-free'], prep: 'ready-to-eat', sl: { ...SRC.shortDry, min: 12, max: 24 }, serving: '4 tablets', kcal: 60, pkg: '50-count bottle', servings: 12, volL: 0.2, cost: 2, role: 'snack', notes: 'Labeled grams of carbs per tablet — use the package label for exact amounts' },
  { id: 'glucose-gel', name: 'Glucose gel pouches', category: 'fat-snack', form: 'pouch', tags: ['vegan', 'rapid-carb', 'gluten-free'], prep: 'ready-to-eat', sl: { ...SRC.shortDry, min: 12, max: 24 }, serving: '1 pouch', kcal: 60, pkg: '10-pack', servings: 10, volL: 0.2, cost: 3, role: 'snack', notes: 'Labeled grams of carbs per pouch — use the package label' },

  // ---- Beverages / dairy-alt ----
  { id: 'shelf-milk', name: 'Shelf-stable milk (UHT boxes)', category: 'dairy-alt', form: 'box', tags: ['vegetarian', 'kid-friendly'], contains: ['milk'], prep: 'ready-to-eat', sl: SRC.drink, serving: '1 cup', kcal: 150, protein: 8, pkg: '8 oz box 12-pack', servings: 12, volL: 3.2, cost: 2, rot: 3, role: 'drink' },
  { id: 'shelf-plant-milk', name: 'Shelf-stable plant milk', category: 'dairy-alt', form: 'box', tags: ['vegan', 'vegetarian', 'dairy-free'], mayContain: ['soy', 'tree-nut'], prep: 'ready-to-eat', sl: SRC.drink, serving: '1 cup', kcal: 100, protein: 4, pkg: '32 oz box', servings: 4, volL: 1, cost: 2, rot: 3, role: 'drink', notes: 'Oat/soy/almond vary in allergens' },
  { id: 'powdered-milk', name: 'Powdered milk', category: 'dairy-alt', form: 'dry', tags: ['vegetarian'], contains: ['milk'], prep: 'add-cold-water', water: 1, sl: { ...SRC.longDry, min: 18, max: 240 }, serving: '1 cup prepared', kcal: 80, protein: 8, pkg: '#10 can', servings: 64, volL: 3.5, cost: 2, role: 'drink' },
  { id: 'juice-boxes', name: 'Juice boxes', category: 'beverage', form: 'box', tags: ['vegan', 'vegetarian', 'kid-friendly', 'rapid-carb'], prep: 'ready-to-eat', sl: SRC.drink, serving: '1 box', kcal: 90, pkg: '8-pack', servings: 8, volL: 1.8, cost: 1, rot: 3, role: 'drink' },
  { id: 'electrolyte-mix', name: 'Electrolyte drink mix', category: 'beverage', form: 'packet', tags: ['vegan'], prep: 'add-cold-water', water: 2, sl: { ...SRC.shortDry, min: 18, max: 36 }, serving: '1 packet', kcal: 40, pkg: '16-count', servings: 16, volL: 0.2, cost: 2, role: 'drink' },
  { id: 'coffee-tea', name: 'Instant coffee / tea', category: 'beverage', form: 'jar', tags: ['vegan', 'comfort'], prep: 'add-hot-water', cookMin: 5, batch: 8, water: 1, sl: { ...SRC.shortDry, min: 18, max: 36 }, serving: '1 cup', kcal: 0, pkg: '8 oz jar', servings: 120, volL: 0.4, cost: 2, role: 'drink' },
  { id: 'cocoa-mix', name: 'Hot cocoa mix', category: 'beverage', form: 'packet', tags: ['vegetarian', 'kid-friendly', 'comfort'], contains: ['milk'], mayContain: ['soy'], prep: 'add-hot-water', cookMin: 5, batch: 8, water: 0.75, sl: SRC.shortDry, serving: '1 packet', kcal: 120, pkg: '10-pack', servings: 10, volL: 0.4, cost: 1, rot: 2, role: 'drink' },
  // ---- Added on request (v10) ----
  { id: 'ramen', name: 'Instant ramen noodles', category: 'grain', form: 'packet', examples: 'Any brand of packaged instant ramen', tags: ['kid-friendly', 'comfort'], contains: ['wheat', 'gluten', 'soy'], mayContain: ['milk', 'egg', 'fish', 'shellfish', 'sesame'], prep: 'add-hot-water', cookMin: 3, batch: 4, water: 2, sl: { min: 8, max: 12, source: 'Package label (typical)', storage: 'Cool, dry', assumptions: 'Fried noodles; the oil slowly goes stale' }, serving: '1 packet (3 oz)', kcal: 380, protein: 9, pkg: '24-pack', servings: 24, volL: 6, cost: 1, rot: 3, role: 'main', notes: 'Very salty (about 1,600 mg sodium per packet with the flavor packet); use half the packet to cut it. Add freeze-dried vegetables, egg or meat to make a meal. Flavor packets vary: shrimp/seafood flavors contain shellfish.' },
  { id: 'nutella', name: 'Chocolate hazelnut spread (Nutella-style)', category: 'fat-snack', form: 'jar', examples: 'Nutella or store brand', tags: ['vegetarian', 'kid-friendly', 'comfort'], contains: ['tree-nut', 'milk', 'soy'], prep: 'ready-to-eat', sl: { min: 12, max: 12, source: 'Package label (typical)', storage: 'Cool, dry; no need to refrigerate', assumptions: 'Unopened; oils separate and go stale over time' }, serving: '2 tbsp', kcal: 200, protein: 2, pkg: '26.5 oz jar', servings: 20, volL: 0.8, cost: 2, rot: 2, role: 'snack', notes: 'Contains hazelnuts (tree nut) and milk. Great on tortillas, crackers and pancakes for morale.' },
  { id: 'butter-powder', name: 'Butter powder (shelf-stable butter)', category: 'pantry', form: 'freeze-dried', examples: 'Butter powder in #10 cans; or ghee / canned butter', tags: ['vegetarian'], contains: ['milk'], prep: 'ready-to-eat', sl: { min: 36, max: 120, source: 'Manufacturer claims (typical)', storage: 'Cool, dry; sealed', assumptions: 'Unopened #10 can; about 1 year once opened' }, serving: '1 tbsp powder', kcal: 60, protein: 1, pkg: '#10 can (about 2 lb)', servings: 100, volL: 3.5, cost: 3, rot: 1, role: 'staple', use: 0.3, from: 'medium', notes: 'Mix with a little water for a spread, or add dry to baking, mashed potatoes and pasta. Alternatives: ghee (clarified butter in a jar, keeps about 1–2 years unopened) or canned butter.' },
  { id: 'chocolate-chips', name: 'Chocolate chips', category: 'pantry', form: 'pouch', tags: ['vegetarian', 'kid-friendly', 'comfort'], contains: ['milk', 'soy'], mayContain: ['peanut', 'tree-nut', 'wheat'], prep: 'ready-to-eat', sl: { min: 12, max: 24, source: 'Package label (typical)', storage: 'Cool, dark, below about 75°F; airtight', assumptions: 'May turn white (“bloom”) in heat; still safe to eat' }, serving: '1 tbsp', kcal: 70, protein: 1, pkg: '12 oz bag', servings: 22, volL: 0.5, cost: 2, rot: 2, role: 'staple', use: 0.1, from: 'medium', notes: 'For baking, pancakes, oatmeal and trail mix. Dark chocolate (no milk) is an option if anyone avoids dairy.' },
  { id: 'cocoa-powder', name: 'Cocoa powder (unsweetened)', category: 'pantry', form: 'jar', tags: ['vegan', 'vegetarian'], mayContain: ['milk'], prep: 'ready-to-eat', sl: { min: 24, max: 36, source: 'Package label (typical)', storage: 'Cool, dry; airtight', assumptions: 'Loses flavor slowly; stays safe' }, serving: '1 tbsp', kcal: 10, protein: 1, pkg: '8 oz canister', servings: 45, volL: 0.4, cost: 2, rot: 1, role: 'staple', use: 0.05, from: 'long', notes: 'For baking, frosting and hot chocolate (with powdered milk and sugar).' },
  { id: 'cake-mix', name: 'Cake mix', category: 'pantry', form: 'box', examples: 'Any boxed cake or brownie mix', tags: ['vegetarian', 'kid-friendly', 'comfort'], contains: ['wheat', 'gluten'], mayContain: ['milk', 'egg', 'soy'], prep: 'heat', cookMin: 35, sl: { min: 9, max: 18, source: 'Package label (typical)', storage: 'Cool, dry; keep bugs out', assumptions: 'Best-by date; leavening weakens after it' }, serving: '1/10 box (1 slice)', kcal: 170, protein: 2, pkg: '15.25 oz box', servings: 10, volL: 0.9, cost: 1, rot: 3, role: 'staple', use: 0.15, from: 'medium', notes: 'Usually needs eggs and oil: use powdered egg and cooking oil from the plan, or buy “just add water” mixes. Bake in a Dutch oven or camp oven, or make skillet/mug cakes. Planned at about one cake every two weeks for a family of five.', equip: ['Dutch oven or camp oven', 'Mixing bowl'] },
  { id: 'frosting', name: 'Frosting (ready-to-spread tub)', category: 'pantry', form: 'jar', examples: 'Any ready-to-spread frosting', tags: ['vegetarian', 'kid-friendly', 'comfort'], mayContain: ['milk', 'soy', 'egg'], prep: 'ready-to-eat', sl: { min: 12, max: 18, source: 'Package label (typical)', storage: 'Cool; refrigerate once opened if you can', assumptions: 'Unopened tub' }, serving: '2 tbsp', kcal: 140, protein: 0, pkg: '16 oz tub', servings: 12, volL: 0.5, cost: 1, rot: 3, role: 'staple', use: 0.15, from: 'medium', notes: 'About one tub per cake. Can also be made from powdered sugar, butter powder and cocoa.' },
  // ---- Baking supplies & seasonings (sized by use, not calories) ----
  { id: 'salt', name: 'Salt (iodized)', category: 'pantry', form: 'box', tags: ['vegan', 'vegetarian'], prep: 'ready-to-eat', sl: { min: 60, max: 600, source: 'Package label (typical)', storage: 'Cool, dry; airtight', assumptions: 'Keeps indefinitely if kept dry and sealed' }, serving: '1 tsp', kcal: 0, pkg: '26 oz canister', servings: 120, volL: 0.8, cost: 1, rot: 1, role: 'staple', use: 0.75, from: 'short', notes: 'For cooking, baking and preserving. Keeps indefinitely if kept dry.' },
  { id: 'black-pepper', name: 'Black pepper', category: 'pantry', form: 'jar', tags: ['vegan', 'vegetarian'], prep: 'ready-to-eat', sl: { min: 24, max: 48, source: 'Package label (typical)', storage: 'Cool, dry, dark; airtight', assumptions: 'Loses flavor over time but stays safe' }, serving: '1/4 tsp', kcal: 0, pkg: '4 oz tin', servings: 180, volL: 0.2, cost: 1, rot: 2, role: 'staple', use: 0.25, from: 'short' },
  { id: 'sugar', name: 'Sugar (white)', category: 'pantry', form: 'dry', tags: ['vegan', 'vegetarian'], prep: 'ready-to-eat', sl: { min: 60, max: 600, source: 'Package label (typical)', storage: 'Cool, dry; airtight', assumptions: 'Keeps indefinitely if kept dry and sealed' }, serving: '1 tbsp', kcal: 48, pkg: '4 lb bag', servings: 145, volL: 2.2, cost: 1, rot: 1, role: 'staple', use: 0.5, from: 'short', notes: 'For baking, oatmeal and drinks. Store in an airtight bucket to keep bugs and moisture out.' },
  { id: 'bouillon', name: 'Bouillon (chicken or beef)', category: 'pantry', form: 'jar', tags: [], mayContain: ['wheat', 'soy', 'milk'], prep: 'add-hot-water', water: 1, sl: { min: 18, max: 36, source: 'Package label (typical)', storage: 'Cool, dry; airtight', assumptions: 'Granules or cubes' }, serving: '1 tsp (1 cup broth)', kcal: 10, pkg: '12 oz jar', servings: 100, volL: 0.4, cost: 1, rot: 2, role: 'staple', use: 0.25, from: 'short', notes: 'Flavors rice, beans, soups and gravy. Many contain wheat, soy or milk; check the label.' },
  { id: 'honey', name: 'Honey', category: 'pantry', form: 'jar', tags: ['vegetarian'], prep: 'ready-to-eat', sl: { min: 60, max: 600, source: 'Package label (typical)', storage: 'Cool, dry; airtight', assumptions: 'Keeps indefinitely if kept dry and sealed' }, serving: '1 tbsp', kcal: 64, pkg: '32 oz jar', servings: 43, volL: 0.7, cost: 2, rot: 1, role: 'staple', use: 0.15, from: 'medium', notes: 'Never give honey to babies under 1 year. Crystallizes over time; warm gently to soften.' },
  { id: 'garlic-powder', name: 'Garlic powder', category: 'pantry', form: 'jar', tags: ['vegan', 'vegetarian'], prep: 'ready-to-eat', sl: { min: 24, max: 48, source: 'Package label (typical)', storage: 'Cool, dry, dark; airtight', assumptions: 'Loses flavor over time but stays safe' }, serving: '1/4 tsp', kcal: 0, pkg: '3 oz jar', servings: 120, volL: 0.2, cost: 1, rot: 2, role: 'staple', use: 0.15, from: 'medium' },
  { id: 'onion-powder', name: 'Onion powder', category: 'pantry', form: 'jar', tags: ['vegan', 'vegetarian'], prep: 'ready-to-eat', sl: { min: 24, max: 48, source: 'Package label (typical)', storage: 'Cool, dry, dark; airtight', assumptions: 'Loses flavor over time but stays safe' }, serving: '1/4 tsp', kcal: 0, pkg: '3 oz jar', servings: 120, volL: 0.2, cost: 1, rot: 2, role: 'staple', use: 0.15, from: 'medium' },
  { id: 'chili-powder', name: 'Chili powder', category: 'pantry', form: 'jar', tags: ['vegan', 'vegetarian'], prep: 'ready-to-eat', sl: { min: 24, max: 48, source: 'Package label (typical)', storage: 'Cool, dry, dark; airtight', assumptions: 'Loses flavor over time but stays safe' }, serving: '1/2 tsp', kcal: 0, pkg: '3 oz jar', servings: 60, volL: 0.2, cost: 1, rot: 2, role: 'staple', use: 0.1, from: 'medium', notes: 'For beans, chili and rice.' },
  { id: 'cumin', name: 'Ground cumin', category: 'pantry', form: 'jar', tags: ['vegan', 'vegetarian'], prep: 'ready-to-eat', sl: { min: 24, max: 48, source: 'Package label (typical)', storage: 'Cool, dry, dark; airtight', assumptions: 'Loses flavor over time but stays safe' }, serving: '1/2 tsp', kcal: 0, pkg: '2 oz jar', servings: 40, volL: 0.15, cost: 1, rot: 2, role: 'staple', use: 0.05, from: 'medium' },
  { id: 'italian-seasoning', name: 'Italian seasoning', category: 'pantry', form: 'jar', tags: ['vegan', 'vegetarian'], prep: 'ready-to-eat', sl: { min: 24, max: 48, source: 'Package label (typical)', storage: 'Cool, dry, dark; airtight', assumptions: 'Loses flavor over time but stays safe' }, serving: '1/2 tsp', kcal: 0, pkg: '1 oz jar', servings: 40, volL: 0.15, cost: 1, rot: 2, role: 'staple', use: 0.05, from: 'medium', notes: 'For pasta, soups and flatbread.' },
  { id: 'cinnamon', name: 'Ground cinnamon', category: 'pantry', form: 'jar', tags: ['vegan', 'vegetarian'], prep: 'ready-to-eat', sl: { min: 24, max: 48, source: 'Package label (typical)', storage: 'Cool, dry, dark; airtight', assumptions: 'Loses flavor over time but stays safe' }, serving: '1/2 tsp', kcal: 0, pkg: '2 oz jar', servings: 40, volL: 0.15, cost: 1, rot: 2, role: 'staple', use: 0.05, from: 'medium', notes: 'For oatmeal, pancakes and baking.' },
  { id: 'soy-sauce', name: 'Soy sauce', category: 'pantry', form: 'bottle', tags: ['vegan', 'vegetarian'], contains: ['soy', 'wheat'], prep: 'ready-to-eat', sl: { min: 24, max: 36, source: 'Package label (typical)', storage: 'Cool, dark; unopened', assumptions: 'Unopened' }, serving: '1 tbsp', kcal: 10, pkg: '15 oz bottle', servings: 30, volL: 0.5, cost: 1, rot: 2, role: 'staple', use: 0.05, from: 'medium', notes: 'Gluten-free tamari is an option if anyone avoids wheat.' },
  { id: 'hot-sauce', name: 'Hot sauce', category: 'pantry', form: 'bottle', tags: ['vegan', 'vegetarian'], prep: 'ready-to-eat', sl: { min: 24, max: 60, source: 'Package label (typical)', storage: 'Cool, dark; unopened', assumptions: 'Unopened' }, serving: '1 tsp', kcal: 0, pkg: '5 oz bottle', servings: 30, volL: 0.2, cost: 1, rot: 2, role: 'staple', use: 0.05, from: 'medium' },
  { id: 'vinegar', name: 'Vinegar (white or cider)', category: 'pantry', form: 'bottle', tags: ['vegan', 'vegetarian'], prep: 'ready-to-eat', sl: { min: 60, max: 600, source: 'Package label (typical)', storage: 'Cool, dry; airtight', assumptions: 'Keeps indefinitely if kept dry and sealed' }, serving: '1 tbsp', kcal: 0, pkg: '32 oz bottle', servings: 64, volL: 1, cost: 1, rot: 1, role: 'staple', use: 0.05, from: 'medium', notes: 'For cooking and dressings; also useful for cleaning.' },
  { id: 'baking-powder', name: 'Baking powder', category: 'pantry', form: 'box', tags: ['vegan', 'vegetarian'], prep: 'ready-to-eat', sl: { min: 12, max: 24, source: 'Package label (typical)', storage: 'Cool, dry; airtight', assumptions: 'Unopened' }, serving: '1 tsp', kcal: 2, pkg: '8 oz can', servings: 48, volL: 0.3, cost: 1, rot: 3, role: 'staple', use: 0.2, from: 'long', notes: 'For pancakes, biscuits and quick breads. Test it: a spoonful in hot water should fizz. Rotate yearly.' },
  { id: 'baking-soda', name: 'Baking soda', category: 'pantry', form: 'box', tags: ['vegan', 'vegetarian'], prep: 'ready-to-eat', sl: { min: 24, max: 36, source: 'Package label (typical)', storage: 'Cool, dry; airtight', assumptions: 'Unopened' }, serving: '1 tsp', kcal: 0, pkg: '1 lb box', servings: 90, volL: 0.5, cost: 1, rot: 2, role: 'staple', use: 0.05, from: 'long', notes: 'For baking; also useful for cleaning and odors.' },
  { id: 'yeast', name: 'Instant or active dry yeast', category: 'pantry', form: 'jar', tags: ['vegan', 'vegetarian'], prep: 'ready-to-eat', sl: { min: 12, max: 24, source: 'Package label (typical)', storage: 'Unopened, cool and dry; keeps much longer in the freezer', assumptions: 'Unopened' }, serving: '2 1/4 tsp (1 packet)', kcal: 20, pkg: '4 oz jar', servings: 16, volL: 0.2, cost: 2, rot: 3, role: 'staple', use: 0.05, from: 'long', notes: 'For bread and pizza dough from your flour or ground wheat. Store in the freezer if you can; rotate yearly.' },
  { id: 'cornstarch', name: 'Cornstarch', category: 'pantry', form: 'box', tags: ['vegan', 'vegetarian', 'gluten-free'], contains: ['corn'], prep: 'ready-to-eat', sl: { min: 60, max: 600, source: 'Package label (typical)', storage: 'Cool, dry; airtight', assumptions: 'Keeps indefinitely if kept dry and sealed' }, serving: '1 tbsp', kcal: 30, pkg: '16 oz box', servings: 56, volL: 0.5, cost: 1, rot: 1, role: 'staple', use: 0.03, from: 'long', notes: 'Thickens gravy, soups and sauces.' },
  { id: 'vanilla', name: 'Vanilla extract', category: 'pantry', form: 'bottle', tags: ['vegan', 'vegetarian'], prep: 'ready-to-eat', sl: { min: 60, max: 600, source: 'Package label (typical)', storage: 'Cool, dry; airtight', assumptions: 'Keeps indefinitely if kept dry and sealed' }, serving: '1 tsp', kcal: 12, pkg: '2 oz bottle', servings: 12, volL: 0.1, cost: 3, rot: 1, role: 'staple', use: 0.02, from: 'long' },
];

/**
 * Typical nutrition per serving beyond calories/protein/carbs: [fat g, saturated fat g, fiber g,
 * sugar g, sodium mg, protein g (only where the seed has none)]. Generic values for this kind of
 * food, from USDA FoodData Central and common labels. Brands differ: check your label.
 */
const NUTRITION: Record<string, number[]> = {
  ramen: [14, 7, 2, 1, 1600],
  nutella: [11, 4, 1, 21, 15],
  'butter-powder': [5, 3, 0, 0, 40],
  'chocolate-chips': [4, 2.5, 1, 8, 0],
  'cocoa-powder': [0.5, 0.3, 2, 0, 0],
  'cake-mix': [3, 1.5, 0, 19, 300],
  frosting: [6, 2, 0, 20, 70],
  'chicken-canned': [2, 0.5, 0, 0, 200],
  'tuna-canned': [0.5, 0, 0, 0, 180],
  'tuna-pouch': [1, 0, 0, 0, 300],
  'salmon-canned': [4, 1, 0, 0, 220],
  'sardines-canned': [10, 1.5, 0, 0, 300],
  'beef-jerky': [1, 0.5, 0, 5, 500],
  'spam-canned': [16, 6, 0, 1, 790],
  'meat-pouch-rte': [3, 1, 0, 0, 400],
  'tofu-shelf': [2.5, 0.5, 0, 1, 10],
  'fd-meat': [2, 0.5, 0, 0, 250],
  'egg-powder': [5.5, 1.5, 0, 0, 70],
  'black-beans-canned': [0.5, 0, 7, 0, 400],
  'chickpeas-canned': [2, 0, 5, 1, 300],
  'kidney-beans-canned': [0.5, 0, 6, 1, 350],
  'refried-beans-canned': [1.5, 0.5, 6, 1, 500],
  'lentils-canned': [0.5, 0, 6, 1, 350],
  'lentils-dry': [0.5, 0, 5, 1, 5],
  'split-peas-dry': [0.5, 0, 12, 4, 7],
  'pinto-beans-dry': [0.5, 0, 7, 1, 5],
  'crackers': [3, 0.5, 0.5, 1, 140, 1],
  'granola': [9, 2, 4, 12, 50],
  'cereal': [1, 0, 3, 5, 170],
  'tortillas-shelf': [3.5, 1.5, 1, 1, 350],
  'rice-pouch-rte': [4, 0.5, 1, 0, 400],
  'potato-flakes': [0, 0, 1, 1, 25],
  'white-rice': [0, 0, 0.5, 0, 0],
  'pasta-dry': [1, 0, 2, 1, 0],
  'oats-instant': [2, 0.5, 3, 12, 200],
  'oats-rolled': [2.5, 0.5, 4, 1, 0],
  'cornmeal': [1, 0, 2, 0, 0],
  'flour-wheat': [0.5, 0, 1, 0, 0],
  'wheat-berries': [1, 0, 6, 0, 0],
  'pretzels': [1, 0, 1, 1, 450],
  'fruit-cups': [0, 0, 1.5, 16, 10, 0.5],
  'applesauce-pouch': [0, 0, 1, 11, 0, 0],
  'canned-peaches': [0, 0, 1.5, 13, 5, 0.5],
  'raisins': [0, 0, 2, 26, 10, 1],
  'fd-fruit': [0, 0, 2, 9, 0, 0.5],
  'canned-pineapple': [0, 0, 1, 16, 0, 0.5],
  'green-beans-canned': [0, 0, 2, 1, 350, 1],
  'corn-canned': [1, 0, 2, 4, 250, 2],
  'carrots-canned': [0, 0, 2, 3, 300, 1],
  'tomato-sauce': [0, 0, 2, 5, 500, 1.5],
  'veg-pouch': [1, 0, 2, 3, 300, 2],
  'fd-corn-peas': [1, 0, 4, 5, 10],
  'fd-veg': [0, 0, 2, 3, 40, 1.5],
  'chili-canned': [11, 4, 7, 3, 1000],
  'veg-chili-canned': [1, 0, 10, 6, 800],
  'beef-stew-canned': [11, 4.5, 3, 2, 900],
  'soup-rte': [3, 1, 2, 3, 800],
  'ravioli-canned': [7, 3, 3, 9, 900],
  'curry-pouch': [8, 3, 6, 5, 600],
  'meal-pouch-rte': [11, 4, 4, 4, 900],
  'fd-entree': [6, 2, 3, 4, 800],
  'fd-meal': [7, 2.5, 3, 4, 850],
  'fd-breakfast': [13, 5, 1, 2, 600],
  'soup-mix-dry': [3, 1, 2, 3, 800],
  'mac-cheese-cup': [11, 4, 1, 6, 600],
  'peanut-butter': [16, 3, 2, 3, 140],
  'pb-packets': [16, 3, 2, 3, 140],
  'almond-butter': [17, 1.5, 3, 1, 40],
  'mixed-nuts': [15, 2, 2, 1, 90],
  'trail-mix': [10, 2.5, 2, 11, 40],
  'granola-bars': [7, 1, 2, 12, 150],
  'protein-bars': [7, 3, 4, 6, 200],
  'cooking-oil': [14, 2, 0, 0, 0, 0],
  'hard-candy': [0, 0, 0, 10, 5, 0],
  'glucose-tabs': [0, 0, 0, 14, 0, 0],
  'glucose-gel': [0, 0, 0, 15, 30, 0],
  'shelf-milk': [8, 5, 0, 12, 105],
  'shelf-plant-milk': [4.5, 0.5, 1, 7, 150],
  'powdered-milk': [0, 0, 0, 12, 125],
  'juice-boxes': [0, 0, 0, 20, 15, 0],
  'electrolyte-mix': [0, 0, 0, 9, 250, 0],
  'coffee-tea': [0, 0, 0, 0, 5, 0],
  'cocoa-mix': [3, 2, 1, 17, 180, 2],
  'salt': [0, 0, 0, 0, 2300, 0],
  'black-pepper': [0, 0, 0.2, 0, 0, 0],
  'sugar': [0, 0, 0, 12.5, 0, 0],
  'bouillon': [0.5, 0, 0, 0, 900, 0.5],
  'honey': [0, 0, 0, 17, 1, 0],
  'garlic-powder': [0, 0, 0, 0, 0, 0],
  'onion-powder': [0, 0, 0, 0, 0, 0],
  'chili-powder': [0.2, 0, 0.5, 0, 40, 0],
  'cumin': [0.2, 0, 0, 0, 2, 0],
  'italian-seasoning': [0, 0, 0, 0, 0, 0],
  'cinnamon': [0, 0, 0.5, 0, 0, 0],
  'soy-sauce': [0, 0, 0, 0, 900, 1],
  'hot-sauce': [0, 0, 0, 0, 100, 0],
  'vinegar': [0, 0, 0, 0, 0, 0],
  'baking-powder': [0, 0, 0, 0, 480, 0],
  'baking-soda': [0, 0, 0, 0, 1260, 0],
  'yeast': [0.5, 0, 2, 0, 4, 3],
  'cornstarch': [0, 0, 0, 0, 1, 0],
  'vanilla': [0, 0, 0, 0.5, 0, 0],
};
/** Foods whose values vary a lot between brands or flavors (assorted meals, bars, cereals). */
const ROUGH_NUTRITION = new Set(['ramen', 'cake-mix', 'butter-powder', 'cereal', 'curry-pouch', 'fd-breakfast', 'fd-entree', 'fd-meal', 'granola', 'granola-bars', 'meal-pouch-rte', 'protein-bars', 'soup-mix-dry', 'soup-rte', 'trail-mix']);
const NUTRITION_SOURCE = 'Typical values for this kind of food (USDA FoodData Central and common labels). Brands differ; check your label.';
const ROUGH_SOURCE = 'Rough average across brands and flavors; varies a lot. Enter your product’s label values for accuracy.';

function nutritionFor(s: Seed): FoodItem['nutrition'] {
  const n = NUTRITION[s.id];
  const base: FoodItem['nutrition'] = { servingDesc: s.serving, caloriesPerServing: s.kcal, proteinG: s.protein, carbsG: CARBS_G[s.id] };
  if (!n) return base;
  const [fatG, satFatG, fiberG, sugarG, sodiumMg, protein] = n;
  return { ...base, proteinG: s.protein ?? protein, fatG, satFatG, fiberG, sugarG, sodiumMg, source: ROUGH_NUTRITION.has(s.id) ? ROUGH_SOURCE : NUTRITION_SOURCE };
}

export function buildSeedCatalog(): FoodItem[] {
  return S.map((s) => {
    const noHeat = s.prep === 'ready-to-eat' || s.prep === 'add-cold-water';
    return {
      id: s.id,
      name: s.name,
      category: s.category,
      form: s.form,
      examples: s.examples,
      tags: s.tags ?? [],
      allergens: { contains: s.contains ?? [], mayContain: s.mayContain, verifyLabel: true },
      prep: {
        method: s.prep,
        edibleWithoutHeat: noHeat,
        cookMinutes: s.cookMin ?? 0,
        batchServings: s.batch,
        waterCupsPerServing: s.water ?? 0,
        needsFuel: !noHeat,
      },
      shelfLife: {
        unopenedMonthsMin: s.sl.min,
        unopenedMonthsMax: s.sl.max,
        storage: s.sl.storage,
        source: s.sl.source,
        sourceDate: s.sl.sourceDate,
        assumptions: s.sl.assumptions,
      },
      nutrition: nutritionFor(s),
      package: { description: s.pkg, servingsPerPackage: s.servings, volumeL: s.volL },
      relativeCost: s.cost ?? 2,
      rotationPriority: s.rot ?? (s.sl.max <= 18 ? 3 : s.sl.max <= 60 ? 2 : 1),
      packagingDurability: s.dur ?? (s.form === 'canned' || s.form === 'freeze-dried' ? 3 : s.form === 'box' || s.form === 'pouch' ? 1 : 2),
      safetyNotes: s.notes,
      equipment: s.equip,
      pantry: s.use !== undefined ? { perPersonDay: s.use, fromTier: s.from ?? 'short' } : undefined,
      mealRole: s.role,
      active: true,
      needsReview: false,
      revision: 1,
      updatedAt: SEED_DATE,
    } satisfies FoodItem;
  });
}
