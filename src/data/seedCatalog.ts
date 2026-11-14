// Seed catalog — scope §6. Generic entries only; every entry has verifyLabel=true because
// a generic name never proves allergen-free status (catalog quality rule). Shelf-life
// values are guidance with assumptions, not guarantees. Prefer the actual package label.
import type { Allergen, FoodCategory, FoodForm, FoodItem, PrepMethod } from '../domain/types';

export const CATALOG_VERSION = 1;
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
  { id: 'fd-meat', name: 'Freeze-dried diced chicken/beef', category: 'protein', form: 'freeze-dried', tags: ['high-protein'], prep: 'add-hot-water', cookMin: 10, water: 0.5, sl: SRC.freezeDried, serving: '1/2 cup', kcal: 90, protein: 16, pkg: '#10 can', servings: 28, volL: 3.5, cost: 3, rot: 1, role: 'main' },
  { id: 'egg-powder', name: 'Powdered whole egg', category: 'protein', form: 'dry', tags: ['vegetarian'], contains: ['egg'], prep: 'heat', cookMin: 5, water: 0.25, sl: SRC.freezeDried, serving: '2 tbsp (1 egg)', kcal: 80, protein: 6, pkg: '#10 can', servings: 72, volL: 3.5, cost: 2, role: 'staple' },

  // ---- Legumes ----
  { id: 'black-beans-canned', name: 'Canned black beans', category: 'legume', form: 'canned', tags: ['vegan', 'vegetarian', 'high-protein'], prep: 'ready-to-eat', sl: SRC.cannedLowAcid, serving: '1/2 cup', kcal: 110, protein: 7, pkg: '15 oz can', servings: 3.5, volL: 0.45, cost: 1, role: 'side' },
  { id: 'chickpeas-canned', name: 'Canned chickpeas', category: 'legume', form: 'canned', tags: ['vegan', 'vegetarian', 'high-protein'], prep: 'ready-to-eat', sl: SRC.cannedLowAcid, serving: '1/2 cup', kcal: 120, protein: 6, pkg: '15 oz can', servings: 3.5, volL: 0.45, cost: 1, role: 'side' },
  { id: 'kidney-beans-canned', name: 'Canned kidney beans', category: 'legume', form: 'canned', tags: ['vegan', 'vegetarian'], prep: 'ready-to-eat', sl: SRC.cannedLowAcid, serving: '1/2 cup', kcal: 110, protein: 7, pkg: '15 oz can', servings: 3.5, volL: 0.45, cost: 1, role: 'side' },
  { id: 'refried-beans-canned', name: 'Canned refried beans', category: 'legume', form: 'canned', tags: ['vegetarian', 'kid-friendly'], prep: 'ready-to-eat', sl: SRC.cannedLowAcid, serving: '1/2 cup', kcal: 120, protein: 6, pkg: '16 oz can', servings: 3.5, volL: 0.45, cost: 1, role: 'side', notes: 'Some contain lard — check if vegetarian needed' },
  { id: 'lentils-canned', name: 'Canned lentils', category: 'legume', form: 'canned', tags: ['vegan', 'vegetarian', 'high-protein'], prep: 'ready-to-eat', sl: SRC.cannedLowAcid, serving: '1/2 cup', kcal: 110, protein: 8, pkg: '15 oz can', servings: 3.5, volL: 0.45, cost: 1, role: 'side' },
  { id: 'lentils-dry', name: 'Dry lentils', category: 'legume', form: 'dry', tags: ['vegan', 'vegetarian', 'high-protein'], prep: 'simmer', cookMin: 25, water: 1, sl: SRC.longDry, serving: '1/4 cup dry', kcal: 170, protein: 12, pkg: '2 lb bag', servings: 20, volL: 1.2, cost: 1, role: 'staple' },
  { id: 'split-peas-dry', name: 'Dry split peas', category: 'legume', form: 'dry', tags: ['vegan', 'vegetarian', 'high-protein'], prep: 'simmer', cookMin: 40, water: 1, sl: SRC.longDry, serving: '1/4 cup dry', kcal: 170, protein: 12, pkg: '2 lb bag', servings: 20, volL: 1.2, cost: 1, role: 'staple' },
  { id: 'pinto-beans-dry', name: 'Dry pinto/kidney beans', category: 'legume', form: 'dry', tags: ['vegan', 'vegetarian', 'high-protein'], prep: 'boil', cookMin: 90, water: 1.5, sl: SRC.longDry, serving: '1/4 cup dry', kcal: 160, protein: 10, pkg: '4 lb bag', servings: 40, volL: 2.4, cost: 1, role: 'staple', notes: 'Requires soaking and long boil — high fuel and water burden. Dry kidney beans must be fully boiled (toxic if undercooked).' },

  // ---- Grains / starches ----
  { id: 'crackers', name: 'Crackers', category: 'grain', form: 'box', tags: ['vegetarian', 'kid-friendly'], contains: ['wheat', 'gluten'], prep: 'ready-to-eat', sl: SRC.shortDry, serving: '5 crackers', kcal: 80, pkg: '13 oz box', servings: 12, volL: 1.2, cost: 1, rot: 3, role: 'side' },
  { id: 'granola', name: 'Granola', category: 'grain', form: 'pouch', tags: ['vegetarian', 'kid-friendly'], contains: ['wheat', 'gluten'], mayContain: ['tree-nut', 'peanut'], prep: 'ready-to-eat', sl: SRC.shortDry, serving: '1/2 cup', kcal: 230, protein: 5, pkg: '12 oz bag', servings: 6, volL: 0.8, cost: 2, rot: 3, role: 'main' },
  { id: 'cereal', name: 'Breakfast cereal', category: 'grain', form: 'box', tags: ['vegetarian', 'kid-friendly'], contains: ['wheat', 'gluten'], prep: 'ready-to-eat', sl: SRC.shortDry, serving: '1 cup', kcal: 130, protein: 3, pkg: '12 oz box', servings: 10, volL: 2.5, cost: 2, rot: 3, role: 'main', notes: 'Pairs with shelf-stable milk' },
  { id: 'tortillas-shelf', name: 'Shelf-stable tortillas', category: 'grain', form: 'pouch', tags: ['vegetarian', 'kid-friendly'], contains: ['wheat', 'gluten'], prep: 'ready-to-eat', sl: { ...SRC.shortDry, min: 3, max: 6 }, serving: '1 tortilla', kcal: 140, protein: 4, pkg: '10-count pack', servings: 10, volL: 0.8, cost: 1, rot: 3, role: 'side' },
  { id: 'rice-pouch-rte', name: 'Ready-to-eat rice pouch', category: 'grain', form: 'pouch', tags: ['vegan', 'vegetarian', 'gluten-free'], prep: 'ready-to-eat', sl: SRC.pouch, serving: '1 cup', kcal: 220, protein: 4, pkg: '8.8 oz pouch', servings: 2, volL: 0.3, cost: 2, role: 'side', notes: 'Only if label says safe to eat without heating' },
  { id: 'white-rice', name: 'White rice', category: 'grain', form: 'dry', tags: ['vegan', 'vegetarian', 'gluten-free'], prep: 'simmer', cookMin: 20, water: 0.5, sl: SRC.longDry, serving: '1/4 cup dry', kcal: 160, protein: 3, pkg: '10 lb bag', servings: 100, volL: 6, cost: 1, role: 'staple' },
  { id: 'pasta-dry', name: 'Dry pasta', category: 'grain', form: 'dry', tags: ['vegan', 'vegetarian', 'kid-friendly'], contains: ['wheat', 'gluten'], prep: 'boil', cookMin: 12, water: 2, sl: { ...SRC.longDry, min: 24, max: 360 }, serving: '2 oz dry', kcal: 200, protein: 7, pkg: '1 lb box', servings: 8, volL: 1, cost: 1, role: 'staple' },
  { id: 'oats-instant', name: 'Instant oats', category: 'grain', form: 'packet', tags: ['vegan', 'vegetarian', 'kid-friendly'], mayContain: ['wheat', 'gluten'], prep: 'add-hot-water', cookMin: 2, water: 0.75, sl: SRC.shortDry, serving: '1 packet', kcal: 160, protein: 4, pkg: '10-packet box', servings: 10, volL: 1, cost: 1, role: 'main', notes: 'Can be soaked in cold water if no heat' },
  { id: 'oats-rolled', name: 'Rolled oats (bulk)', category: 'grain', form: 'dry', tags: ['vegan', 'vegetarian'], mayContain: ['wheat', 'gluten'], prep: 'simmer', cookMin: 5, water: 1, sl: SRC.longDry, serving: '1/2 cup dry', kcal: 150, protein: 5, pkg: '42 oz canister', servings: 30, volL: 3, cost: 1, role: 'staple' },
  { id: 'cornmeal', name: 'Cornmeal', category: 'grain', form: 'dry', tags: ['vegan', 'vegetarian', 'gluten-free'], contains: ['corn'], prep: 'simmer', cookMin: 20, water: 1, sl: { ...SRC.longDry, min: 12, max: 120 }, serving: '1/4 cup', kcal: 110, protein: 2, pkg: '2 lb bag', servings: 25, volL: 1.5, cost: 1, role: 'staple' },
  { id: 'flour-wheat', name: 'Wheat flour / hard wheat', category: 'grain', form: 'bulk', tags: ['vegan', 'vegetarian'], contains: ['wheat', 'gluten'], prep: 'heat', cookMin: 30, water: 0.25, sl: SRC.longDry, serving: '1/4 cup', kcal: 110, protein: 3, pkg: '25 lb bag', servings: 200, volL: 18, cost: 1, role: 'staple', notes: 'Requires baking equipment and fuel' },
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
  { id: 'fd-veg', name: 'Freeze-dried / dehydrated vegetables', category: 'vegetable', form: 'freeze-dried', tags: ['vegan', 'vegetarian'], prep: 'add-hot-water', cookMin: 10, water: 0.5, sl: SRC.freezeDried, serving: '1/2 cup', kcal: 30, pkg: '#10 can', servings: 40, volL: 3.5, cost: 3, rot: 1, role: 'side' },

  // ---- Complete meals ----
  { id: 'chili-canned', name: 'Canned chili', category: 'meal', form: 'canned', tags: ['beef', 'high-protein'], prep: 'ready-to-eat', sl: SRC.cannedLowAcid, serving: '1 cup', kcal: 260, protein: 15, pkg: '15 oz can', servings: 2, volL: 0.45, cost: 2, role: 'main', notes: 'Edible cold; better warmed' },
  { id: 'veg-chili-canned', name: 'Canned vegetarian chili', category: 'meal', form: 'canned', tags: ['vegetarian', 'vegan', 'high-protein'], prep: 'ready-to-eat', sl: SRC.cannedLowAcid, serving: '1 cup', kcal: 210, protein: 11, pkg: '15 oz can', servings: 2, volL: 0.45, cost: 2, role: 'main' },
  { id: 'beef-stew-canned', name: 'Canned beef stew', category: 'meal', form: 'canned', tags: ['beef'], contains: ['wheat'], prep: 'ready-to-eat', sl: SRC.cannedLowAcid, serving: '1 cup', kcal: 220, protein: 11, pkg: '20 oz can', servings: 2.5, volL: 0.6, cost: 2, role: 'main' },
  { id: 'soup-rte', name: 'Ready-to-eat canned soup', category: 'meal', form: 'canned', tags: ['kid-friendly'], contains: ['wheat', 'milk'], prep: 'ready-to-eat', sl: SRC.cannedLowAcid, serving: '1 cup', kcal: 120, protein: 6, pkg: '18.6 oz can', servings: 2, volL: 0.55, cost: 1, role: 'main', notes: 'Choose "ready to serve" not condensed for no-water scenarios' },
  { id: 'ravioli-canned', name: 'Canned ravioli / pasta meals', category: 'meal', form: 'canned', tags: ['kid-friendly', 'beef'], contains: ['wheat', 'gluten', 'milk', 'egg'], prep: 'ready-to-eat', sl: SRC.cannedLowAcid, serving: '1 cup', kcal: 230, protein: 8, pkg: '15 oz can', servings: 2, volL: 0.45, cost: 1, role: 'main' },
  { id: 'curry-pouch', name: 'Shelf-stable curry / bean dish pouch', category: 'meal', form: 'pouch', tags: ['vegetarian', 'vegan'], prep: 'ready-to-eat', sl: SRC.pouch, serving: '1 pouch', kcal: 200, protein: 7, pkg: '10 oz pouch', servings: 1, volL: 0.3, cost: 2, role: 'main', notes: 'Many Indian-style pouches are edible cold — check label; may contain dairy' },
  { id: 'meal-pouch-rte', name: 'Ready-to-eat meal pouch (MRE-style)', category: 'meal', form: 'pouch', tags: ['high-protein'], contains: ['wheat', 'milk', 'soy'], prep: 'ready-to-eat', sl: { ...SRC.pouch, min: 36, max: 60 }, serving: '1 entree', kcal: 300, protein: 15, pkg: '1 entree', servings: 1, volL: 0.35, cost: 3, role: 'main' },
  { id: 'fd-meal', name: 'Freeze-dried complete meal', category: 'meal', form: 'freeze-dried', tags: [], contains: ['wheat', 'milk', 'soy'], prep: 'add-hot-water', cookMin: 10, water: 1, sl: SRC.freezeDried, serving: '1 cup', kcal: 270, protein: 12, pkg: '2-serving pouch', servings: 2, volL: 0.6, cost: 3, rot: 1, role: 'main' },
  { id: 'soup-mix-dry', name: 'Dry soup mix', category: 'meal', form: 'dry', tags: ['vegetarian'], contains: ['wheat'], prep: 'simmer', cookMin: 20, water: 1.5, sl: SRC.longDry, serving: '1 cup prepared', kcal: 150, protein: 6, pkg: '1 lb bag', servings: 8, volL: 0.8, cost: 1, role: 'main' },
  { id: 'mac-cheese-cup', name: 'Microwave/add-water mac & cheese cup', category: 'meal', form: 'packet', tags: ['vegetarian', 'kid-friendly'], contains: ['wheat', 'gluten', 'milk'], prep: 'add-hot-water', cookMin: 4, water: 0.33, sl: SRC.shortDry, serving: '1 cup', kcal: 220, protein: 6, pkg: '4-pack', servings: 4, volL: 0.8, cost: 1, rot: 3, role: 'main' },

  // ---- Fats / snacks ----
  { id: 'peanut-butter', name: 'Peanut butter', category: 'fat-snack', form: 'jar', tags: ['vegan', 'vegetarian', 'high-protein', 'kid-friendly'], contains: ['peanut'], prep: 'ready-to-eat', sl: SRC.highFat, serving: '2 tbsp', kcal: 190, protein: 7, pkg: '16 oz jar', servings: 14, volL: 0.5, cost: 1, rot: 2, role: 'side' },
  { id: 'pb-packets', name: 'Nut/seed butter single-serve packets', category: 'fat-snack', form: 'packet', tags: ['vegan', 'vegetarian', 'kid-friendly'], contains: ['peanut'], mayContain: ['tree-nut'], prep: 'ready-to-eat', sl: SRC.highFat, serving: '1 packet', kcal: 190, protein: 7, pkg: '10-pack', servings: 10, volL: 0.3, cost: 2, rot: 2, role: 'side' },
  { id: 'sunbutter', name: 'Sunflower seed butter', category: 'fat-snack', form: 'jar', tags: ['vegan', 'vegetarian', 'kid-friendly', 'nut-free-alt'], prep: 'ready-to-eat', sl: SRC.highFat, serving: '2 tbsp', kcal: 200, protein: 7, pkg: '16 oz jar', servings: 14, volL: 0.5, cost: 2, rot: 2, role: 'side', notes: 'Common peanut-free alternative; verify facility cross-contact' },
  { id: 'mixed-nuts', name: 'Mixed nuts', category: 'fat-snack', form: 'jar', tags: ['vegan', 'vegetarian', 'high-protein'], contains: ['tree-nut'], mayContain: ['peanut'], prep: 'ready-to-eat', sl: SRC.highFat, serving: '1 oz', kcal: 170, protein: 5, pkg: '16 oz can', servings: 16, volL: 0.6, cost: 2, rot: 2, role: 'snack' },
  { id: 'trail-mix', name: 'Trail mix', category: 'fat-snack', form: 'pouch', tags: ['vegetarian', 'kid-friendly'], contains: ['peanut', 'tree-nut'], mayContain: ['milk', 'soy'], prep: 'ready-to-eat', sl: SRC.highFat, serving: '1/4 cup', kcal: 170, protein: 5, pkg: '26 oz bag', servings: 20, volL: 1, cost: 2, rot: 2, role: 'snack' },
  { id: 'granola-bars', name: 'Granola / cereal bars', category: 'fat-snack', form: 'box', tags: ['vegetarian', 'kid-friendly'], contains: ['wheat', 'gluten'], mayContain: ['peanut', 'tree-nut'], prep: 'ready-to-eat', sl: SRC.shortDry, serving: '1 bar', kcal: 190, protein: 4, pkg: '12-count box', servings: 12, volL: 0.6, cost: 1, rot: 2, role: 'snack' },
  { id: 'protein-bars', name: 'Protein bars', category: 'fat-snack', form: 'box', tags: ['high-protein'], contains: ['milk', 'soy'], mayContain: ['peanut', 'tree-nut'], prep: 'ready-to-eat', sl: SRC.shortDry, serving: '1 bar', kcal: 220, protein: 20, pkg: '12-count box', servings: 12, volL: 0.6, cost: 3, rot: 2, role: 'snack' },
  { id: 'cooking-oil', name: 'Cooking oil', category: 'fat-snack', form: 'bottle', tags: ['vegan', 'vegetarian'], prep: 'heat', sl: SRC.highFat, serving: '1 tbsp', kcal: 120, pkg: '48 oz bottle', servings: 96, volL: 1.5, cost: 1, rot: 3, role: 'staple', notes: 'Rotate — oils go rancid; needed for long-term calorie density' },
  { id: 'hard-candy', name: 'Hard candy / glucose tabs', category: 'fat-snack', form: 'pouch', tags: ['vegan', 'rapid-carb'], prep: 'ready-to-eat', sl: { ...SRC.shortDry, min: 12, max: 24 }, serving: '4 pieces', kcal: 60, pkg: '1 lb bag', servings: 25, volL: 0.6, cost: 1, role: 'snack', notes: 'Rapid-carb source for low-blood-sugar flag' },

  // ---- Beverages / dairy-alt ----
  { id: 'shelf-milk', name: 'Shelf-stable milk (UHT boxes)', category: 'dairy-alt', form: 'box', tags: ['vegetarian', 'kid-friendly'], contains: ['milk'], prep: 'ready-to-eat', sl: SRC.drink, serving: '1 cup', kcal: 150, protein: 8, pkg: '8 oz box 12-pack', servings: 12, volL: 3.2, cost: 2, rot: 3, role: 'drink' },
  { id: 'shelf-plant-milk', name: 'Shelf-stable plant milk', category: 'dairy-alt', form: 'box', tags: ['vegan', 'vegetarian', 'dairy-free'], mayContain: ['soy', 'tree-nut'], prep: 'ready-to-eat', sl: SRC.drink, serving: '1 cup', kcal: 100, protein: 4, pkg: '32 oz box', servings: 4, volL: 1, cost: 2, rot: 3, role: 'drink', notes: 'Oat/soy/almond vary in allergens' },
  { id: 'powdered-milk', name: 'Powdered milk', category: 'dairy-alt', form: 'dry', tags: ['vegetarian'], contains: ['milk'], prep: 'add-cold-water', water: 1, sl: { ...SRC.longDry, min: 18, max: 240 }, serving: '1 cup prepared', kcal: 80, protein: 8, pkg: '#10 can', servings: 64, volL: 3.5, cost: 2, role: 'drink' },
  { id: 'juice-boxes', name: 'Juice boxes', category: 'beverage', form: 'box', tags: ['vegan', 'vegetarian', 'kid-friendly'], prep: 'ready-to-eat', sl: SRC.drink, serving: '1 box', kcal: 90, pkg: '8-pack', servings: 8, volL: 1.8, cost: 1, rot: 3, role: 'drink' },
  { id: 'electrolyte-mix', name: 'Electrolyte drink mix', category: 'beverage', form: 'packet', tags: ['vegan'], prep: 'add-cold-water', water: 2, sl: { ...SRC.shortDry, min: 18, max: 36 }, serving: '1 packet', kcal: 40, pkg: '16-count', servings: 16, volL: 0.2, cost: 2, role: 'drink' },
  { id: 'coffee-tea', name: 'Instant coffee / tea', category: 'beverage', form: 'jar', tags: ['vegan', 'comfort'], prep: 'add-hot-water', cookMin: 3, water: 1, sl: { ...SRC.shortDry, min: 18, max: 36 }, serving: '1 cup', kcal: 0, pkg: '8 oz jar', servings: 120, volL: 0.4, cost: 2, role: 'drink' },
  { id: 'cocoa-mix', name: 'Hot cocoa mix', category: 'beverage', form: 'packet', tags: ['vegetarian', 'kid-friendly', 'comfort'], contains: ['milk'], mayContain: ['soy'], prep: 'add-hot-water', cookMin: 3, water: 0.75, sl: SRC.shortDry, serving: '1 packet', kcal: 120, pkg: '10-pack', servings: 10, volL: 0.4, cost: 1, rot: 2, role: 'drink' },
];

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
      nutrition: { servingDesc: s.serving, caloriesPerServing: s.kcal, proteinG: s.protein },
      package: { description: s.pkg, servingsPerPackage: s.servings, volumeL: s.volL },
      relativeCost: s.cost ?? 2,
      rotationPriority: s.rot ?? (s.sl.max <= 18 ? 3 : s.sl.max <= 60 ? 2 : 1),
      packagingDurability: s.dur ?? (s.form === 'canned' || s.form === 'freeze-dried' ? 3 : s.form === 'box' || s.form === 'pouch' ? 1 : 2),
      safetyNotes: s.notes,
      mealRole: s.role,
      active: true,
      needsReview: false,
      revision: 1,
      updatedAt: SEED_DATE,
    } satisfies FoodItem;
  });
}
