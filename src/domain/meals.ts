// Meal ideas: simple default recipes built from stored foods, scaled for one sitting for
// everyone in the household. Fresh food (eggs, meat, produce) is suggested as an optional
// add-in, never required. Pure, so it's easy to test.
import type { FoodItem, ID } from './types';

export type MealType = 'Breakfast' | 'Lunch' | 'Dinner';

/** One ingredient line. Options are tried in order; `per` = catalog servings per person. */
export interface RecipeSlot {
  label: string;
  options: [foodId: ID, per: number][];
  optional?: boolean;
}

export interface MealRecipe {
  id: string;
  name: string;
  meal: MealType;
  /** Needs a stove or hot water. */
  heat: boolean;
  slots: RecipeSlot[];
  steps: string[];
  /** Optional fresh food that makes it better if you have it. */
  freshAddIns: string[];
}

const MILK: RecipeSlot['options'] = [['powdered-milk', 0.5], ['shelf-milk', 0.5], ['shelf-plant-milk', 0.5]];
const FRUIT: RecipeSlot['options'] = [['fd-fruit', 1], ['raisins', 0.5], ['canned-peaches', 1], ['canned-pineapple', 1], ['fruit-cups', 0.5], ['applesauce-pouch', 1]];
const VEG: RecipeSlot['options'] = [['fd-veg', 1], ['fd-corn-peas', 1], ['carrots-canned', 1], ['green-beans-canned', 1], ['corn-canned', 1], ['veg-pouch', 1]];
const MEAT: RecipeSlot['options'] = [['fd-meat', 1], ['chicken-canned', 2], ['meat-pouch-rte', 1], ['tuna-pouch', 1.5], ['tuna-canned', 2], ['salmon-canned', 2], ['spam-canned', 1]];
const NUT_BUTTER: RecipeSlot['options'] = [['peanut-butter', 1], ['sunbutter', 1], ['pb-packets', 1]];
const OIL: RecipeSlot['options'] = [['cooking-oil', 0.25]];
const FLOUR: RecipeSlot['options'] = [['flour-wheat', 1.5], ['wheat-berries', 1.5]];

export const MEAL_RECIPES: MealRecipe[] = [
  // ---- Breakfast ----
  {
    id: 'oatmeal', name: 'Oatmeal with fruit', meal: 'Breakfast', heat: true,
    slots: [
      { label: 'Oats', options: [['oats-rolled', 1.5], ['oats-instant', 1.5]] },
      { label: 'Fruit', options: FRUIT, optional: true },
      { label: 'Milk', options: MILK, optional: true },
      { label: 'Nut butter (stir in)', options: NUT_BUTTER.map(([id]) => [id, 0.5]), optional: true },
    ],
    steps: ['Boil the water (about 1 cup per ½ cup rolled oats).', 'Stir in the oats and simmer 5 minutes, or pour hot water over instant packets.', 'Mix the milk powder into a little water, then stir it in with the fruit and nut butter.'],
    freshAddIns: ['Fresh or frozen berries, sliced banana or apple', 'Brown sugar, honey or cinnamon', 'A pat of butter'],
  },
  {
    id: 'egg-scramble', name: 'Egg scramble or breakfast burritos', meal: 'Breakfast', heat: true,
    slots: [
      { label: 'Eggs', options: [['fd-breakfast', 1.5], ['egg-powder', 2]] },
      { label: 'Tortillas', options: [['tortillas-shelf', 1.5]], optional: true },
      { label: 'Meat', options: [['fd-meat', 0.5], ['spam-canned', 0.5]], optional: true },
      { label: 'Fruit on the side', options: FRUIT, optional: true },
    ],
    steps: ['Freeze-dried eggs: add hot water, stir and let stand 5 minutes. Powdered egg: whisk 2 tbsp powder with 2–3 tbsp water per egg.', 'Cook in an oiled pan, stirring, until set. Stir in the meat to warm it.', 'Wrap in warmed tortillas if you have them.'],
    freshAddIns: ['Fresh eggs (use instead of powder)', 'Shredded cheese, salsa', 'Onion, peppers, potatoes', 'Bacon or sausage'],
  },
  {
    id: 'cereal', name: 'Cereal or granola with milk', meal: 'Breakfast', heat: false,
    slots: [
      { label: 'Cereal', options: [['cereal', 1.5], ['granola', 1]] },
      { label: 'Milk', options: MILK.map(([id]) => [id, 1]) },
      { label: 'Fruit', options: FRUIT, optional: true },
    ],
    steps: ['Mix powdered milk with cold water (⅓ cup powder per cup of water) the night before if you can; it tastes better chilled.', 'Pour over the cereal and top with fruit.'],
    freshAddIns: ['Fresh fruit or berries', 'Yogurt'],
  },
  {
    id: 'pancakes', name: 'Pancakes', meal: 'Breakfast', heat: true,
    slots: [
      { label: 'Flour', options: FLOUR },
      { label: 'Powdered egg', options: [['egg-powder', 0.5]], optional: true },
      { label: 'Milk', options: MILK, optional: true },
      { label: 'Oil', options: OIL },
      { label: 'Fruit', options: FRUIT, optional: true },
    ],
    steps: ['Wheat berries: grind them into flour first.', 'Per cup of flour: 2 tsp baking powder, a pinch of salt, 1 tbsp sugar, 1 egg (or 2 tbsp egg powder + 2 tbsp water), about ¾ cup milk and 1 tbsp oil. Stir until just mixed.', 'Cook ¼-cup scoops in an oiled pan over medium heat, flipping when bubbles form.'],
    freshAddIns: ['Fresh eggs and milk', 'Butter and syrup', 'Fresh berries or banana'],
  },
  // ---- Lunch ----
  {
    id: 'pb-wraps', name: 'Peanut butter wraps or crackers', meal: 'Lunch', heat: false,
    slots: [
      { label: 'Nut butter', options: NUT_BUTTER },
      { label: 'Wraps or crackers', options: [['tortillas-shelf', 1.5], ['crackers', 3]] },
      { label: 'Fruit', options: FRUIT },
    ],
    steps: ['Spread the nut butter on the tortillas or crackers.', 'Serve with the fruit (or roll dried fruit into the wraps).'],
    freshAddIns: ['Sliced banana or apple', 'Honey or jam'],
  },
  {
    id: 'tuna-chicken-salad', name: 'Chicken or tuna salad wraps', meal: 'Lunch', heat: false,
    slots: [
      { label: 'Chicken or fish', options: MEAT.filter(([id]) => id !== 'spam-canned') },
      { label: 'Wraps or crackers', options: [['tortillas-shelf', 1.5], ['crackers', 3]] },
      { label: 'Vegetables', options: [['corn-canned', 0.5], ['fd-corn-peas', 0.5], ['fd-veg', 0.5]], optional: true },
      { label: 'Fruit on the side', options: FRUIT, optional: true },
    ],
    steps: ['Freeze-dried meat: soak in water 5–10 minutes, then drain. Canned: drain.', 'Mix the meat with the vegetables and any dressing you have.', 'Spoon onto tortillas or crackers.'],
    freshAddIns: ['Mayonnaise or mustard', 'Lettuce, celery, onion, pickles', 'Fresh bread instead of tortillas'],
  },
  {
    id: 'bean-burritos', name: 'Bean and rice burritos', meal: 'Lunch', heat: true,
    slots: [
      { label: 'Beans', options: [['refried-beans-canned', 1.5], ['black-beans-canned', 1.5], ['pinto-beans-dry', 1], ['kidney-beans-canned', 1.5]] },
      { label: 'Tortillas', options: [['tortillas-shelf', 1.5]] },
      { label: 'Rice', options: [['white-rice', 0.75], ['rice-pouch-rte', 0.5]], optional: true },
      { label: 'Corn or tomatoes', options: [['corn-canned', 0.5], ['fd-corn-peas', 0.5], ['tomato-sauce', 0.5]], optional: true },
    ],
    steps: ['Dry beans: soak overnight, then simmer 1–2 hours until soft (or start them the day before).', 'Cook the rice. Warm the beans and mash some of them.', 'Fill the tortillas with beans, rice and corn; roll up and warm in a pan.'],
    freshAddIns: ['Cheese, sour cream, salsa', 'Ground beef or chicken', 'Onion, peppers, cilantro, avocado'],
  },
  // ---- Dinner ----
  {
    id: 'chicken-rice', name: 'Chicken, rice and vegetable skillet', meal: 'Dinner', heat: true,
    slots: [
      { label: 'Rice', options: [['white-rice', 1.5], ['rice-pouch-rte', 1]] },
      { label: 'Chicken or meat', options: MEAT.filter(([id]) => !id.startsWith('tuna') && id !== 'salmon-canned') },
      { label: 'Vegetables', options: VEG },
      { label: 'Oil', options: OIL, optional: true },
    ],
    steps: ['Cook the rice (2 cups water per cup of rice, simmer covered 18 minutes).', 'Rehydrate freeze-dried meat and vegetables in hot water for 5–10 minutes, then drain.', 'Fry everything together in the oil for a few minutes; season with salt, pepper, garlic powder or soy sauce.'],
    freshAddIns: ['Fresh chicken (use instead of stored meat)', 'Onion, garlic, peppers, fresh or frozen vegetables', 'Scrambled fresh egg for fried rice'],
  },
  {
    id: 'lentil-soup', name: 'Lentil or split pea soup', meal: 'Dinner', heat: true,
    slots: [
      { label: 'Lentils or split peas', options: [['lentils-dry', 1], ['split-peas-dry', 1], ['lentils-canned', 2]] },
      { label: 'Vegetables', options: [['fd-veg', 1], ['carrots-canned', 1], ['veg-pouch', 1], ['tomato-sauce', 1]] },
      { label: 'Bread or crackers', options: [['crackers', 2], ['flour-wheat', 0.75], ['wheat-berries', 0.75]], optional: true },
      { label: 'Meat', options: [['spam-canned', 0.5], ['fd-meat', 0.5]], optional: true },
    ],
    steps: ['Rinse the lentils or split peas (no soaking needed).', 'Simmer with about 4 cups water per cup of dry lentils, 30–45 minutes, until soft. Add the vegetables partway through.', 'Season with salt, pepper and bouillon if you have it. Serve with crackers or skillet flatbread.'],
    freshAddIns: ['Onion, carrot, celery, garlic', 'Ham, sausage or a ham bone', 'Fresh bread'],
  },
  {
    id: 'pasta', name: 'Pasta with tomato sauce', meal: 'Dinner', heat: true,
    slots: [
      { label: 'Pasta', options: [['pasta-dry', 1.5]] },
      { label: 'Tomato sauce', options: [['tomato-sauce', 1]] },
      { label: 'Meat', options: MEAT.filter(([id]) => id === 'fd-meat' || id === 'chicken-canned'), optional: true },
      { label: 'Vegetables', options: VEG, optional: true },
    ],
    steps: ['Boil the pasta in plenty of water until tender, then drain (save some cooking water).', 'Warm the sauce with the meat and vegetables.', 'Toss together; thin with a little pasta water if needed.'],
    freshAddIns: ['Ground beef or Italian sausage', 'Onion, garlic, mushrooms, zucchini', 'Parmesan'],
  },
  {
    id: 'chili', name: 'Chili with rice or crackers', meal: 'Dinner', heat: true,
    slots: [
      { label: 'Chili', options: [['fd-chili', 1.5], ['chili-canned', 1.5], ['veg-chili-canned', 1.5]] },
      { label: 'Rice or crackers', options: [['white-rice', 1], ['rice-pouch-rte', 1], ['crackers', 2]] },
      { label: 'Extra beans', options: [['kidney-beans-canned', 0.5], ['black-beans-canned', 0.5]], optional: true },
    ],
    steps: ['Freeze-dried chili: add boiling water, stir, cover 10 minutes. Canned: heat through (it can be eaten cold).', 'Stir in the extra beans to stretch it.', 'Serve over rice or with crackers.'],
    freshAddIns: ['Cheese, sour cream, onion', 'Ground beef to stretch it further', 'Cornbread'],
  },
  {
    id: 'rice-beans', name: 'Red beans and rice', meal: 'Dinner', heat: true,
    slots: [
      { label: 'Rice', options: [['white-rice', 1.5], ['rice-pouch-rte', 1]] },
      { label: 'Beans', options: [['kidney-beans-canned', 1.5], ['pinto-beans-dry', 1], ['black-beans-canned', 1.5]] },
      { label: 'Tomatoes', options: [['tomato-sauce', 0.5]], optional: true },
      { label: 'Meat', options: [['spam-canned', 0.5], ['fd-meat', 0.5]], optional: true },
      { label: 'Oil', options: OIL, optional: true },
    ],
    steps: ['Dry beans: soak overnight, then simmer 1–2 hours until soft.', 'Cook the rice.', 'Fry the meat in the oil, add the beans and tomatoes and simmer 10 minutes; season with Cajun spice, garlic, salt and pepper. Serve over rice.'],
    freshAddIns: ['Smoked sausage', 'Onion, celery, bell pepper', 'Hot sauce'],
  },
  {
    id: 'freeze-dried-dinner', name: 'Freeze-dried dinner and fruit', meal: 'Dinner', heat: true,
    slots: [
      { label: 'Freeze-dried meal', options: [['fd-meal', 1.5], ['fd-chicken-rice', 1.5], ['fd-meal-veg', 1.5], ['fd-chili', 1.5]] },
      { label: 'Fruit', options: FRUIT, optional: true },
      { label: 'Vegetables', options: [['fd-corn-peas', 0.5], ['fd-veg', 0.5]], optional: true },
    ],
    steps: ['Boil the water listed below.', 'Stir it into the meal (in its pouch or a pot), cover and wait 10 minutes. Add the vegetables to rehydrate at the same time.', 'Serve with the fruit.'],
    freshAddIns: ['A green salad', 'Fresh bread'],
  },
  {
    id: 'soup-flatbread', name: 'Soup and skillet flatbread', meal: 'Dinner', heat: true,
    slots: [
      { label: 'Soup', options: [['soup-mix-dry', 1.5], ['soup-rte', 2]] },
      { label: 'Flatbread or crackers', options: [...FLOUR, ['crackers', 2]] },
      { label: 'Oil', options: OIL, optional: true },
      { label: 'Meat', options: [['fd-meat', 0.5], ['chicken-canned', 1]], optional: true },
    ],
    steps: ['Soup mix: simmer in water as the package says; stir in the meat.', 'Flatbread (wheat berries ground first): per cup of flour, mix ½ tsp salt, 1 tbsp oil and about ⅓ cup water into a soft dough. Roll thin and cook in a dry hot pan 1–2 minutes a side.', 'Serve the flatbread with the soup.'],
    freshAddIns: ['Fresh vegetables in the soup', 'Butter for the flatbread', 'Leftover cooked meat'],
  },
  {
    id: 'heat-and-eat', name: 'Heat-and-eat meal', meal: 'Dinner', heat: false,
    slots: [
      { label: 'Ready meal', options: [['beef-stew-canned', 1.5], ['ravioli-canned', 1.5], ['curry-pouch', 1.5], ['meal-pouch-rte', 1], ['veg-chili-canned', 1.5], ['soup-rte', 2]] },
      { label: 'Crackers or rice', options: [['crackers', 2], ['rice-pouch-rte', 0.75]], optional: true },
      { label: 'Fruit', options: FRUIT, optional: true },
    ],
    steps: ['Warm it if you can; these are safe to eat cold.', 'Serve with crackers or rice and fruit.'],
    freshAddIns: ['Fresh vegetables or a salad', 'Cheese'],
  },
];

// ---- Amounts ----

const FRACTIONS: [number, string][] = [[0, ''], [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾'], [1, '']];

/** 1.5 → "1½", 0.25 → "¼" (nearest quarter or third). */
export function fmtQty(n: number): string {
  let whole = Math.floor(n);
  let [frac, sym] = FRACTIONS.reduce((best, f) => (Math.abs(n - whole - f[0]) < Math.abs(n - whole - best[0]) ? f : best));
  if (frac === 1) { whole += 1; sym = ''; }
  if (!whole && !sym) return '¼';
  return `${whole || ''}${sym}`;
}

const plural = (w: string) => (/(s|x|ch|sh)$/.test(w) ? `${w}es` : `${w}s`);
const NO_PLURAL = new Set(['oz', 'tbsp', 'tsp', 'lb', 'g']);

/** Turns a serving description ("¼ cup dry", "1 tortilla", "2 tbsp (1 egg)") times a number of servings into an amount. */
export function amountFor(servingDesc: string, servings: number): string {
  const m = servingDesc.trim().match(/^(\d+)(?:\/(\d+))?\s+(\S+)(.*)$/);
  if (!m) return `${fmtQty(servings)} × ${servingDesc}`;
  const qty = (Number(m[1]) / (m[2] ? Number(m[2]) : 1)) * servings;
  let unit = m[3];
  const rest = m[4];
  if (unit === 'tbsp' && qty >= 4) return `${fmtQty(qty / 16)} cup${qty / 16 > 1 ? 's' : ''}${rest}`;
  if (unit === 'cup' || unit === 'tbsp' || unit === 'oz') {
    const q = unit === 'oz' ? Math.round(qty * 2) / 2 : qty;
    return `${fmtQty(q)} ${unit === 'cup' && q > 1 ? 'cups' : unit}${rest}`;
  }
  // Countable things: round up to whole ones.
  const n = Math.max(1, Math.ceil(qty - 0.05));
  if (n > 1 && !NO_PLURAL.has(unit) && !unit.endsWith('s')) unit = plural(unit);
  return `${n} ${unit}${rest}`;
}

// ---- Building ideas ----

export interface IdeaLine {
  label: string;
  foodId: ID;
  name: string;
  servings: number;
  amount: string;
  /** e.g. "about ⅓ of a #10 can" */
  packageNote?: string;
  optional: boolean;
}

export interface MealIdea {
  recipe: MealRecipe;
  lines: IdeaLine[];
  people: number;
  caloriesTotal: number;
  caloriesPerPerson: number;
  waterCups: number;
  /** How many times the available food covers this meal (limited by the scarcest required item). */
  sittings: number;
}

export interface MealIdeasResult {
  ideas: MealIdea[];
  /** Recipes that can't be made, with what's missing. */
  missing: { recipe: MealRecipe; needs: string[] }[];
}

export interface MealIdeasInput {
  /** Foods available and how many servings of each. */
  available: Map<ID, number>;
  foods: FoodItem[];
  /** Each person's daily calories. */
  dailyCalories: number[];
  mealsPerDay: number;
  /** No-cook plans only show meals that don't need heat. */
  noCook?: boolean;
}

export function buildMealIdeas({ available, foods, dailyCalories, mealsPerDay, noCook }: MealIdeasInput): MealIdeasResult {
  const byId = new Map(foods.map((f) => [f.id, f]));
  const people = dailyCalories.length;
  const mealCalories = dailyCalories.reduce((t, c) => t + c, 0) / Math.max(1, mealsPerDay);
  const ideas: MealIdea[] = [];
  const missing: MealIdeasResult['missing'] = [];

  for (const recipe of MEAL_RECIPES) {
    if (noCook && recipe.heat) continue;
    const picks: { slot: RecipeSlot; food: FoodItem; per: number }[] = [];
    const needs: string[] = [];
    for (const slot of recipe.slots) {
      const opt = slot.options.find(([id]) => (available.get(id) ?? 0) > 0 && byId.has(id));
      if (opt) picks.push({ slot, food: byId.get(opt[0])!, per: opt[1] });
      else if (!slot.optional) needs.push(slot.label.toLowerCase());
    }
    if (needs.length) { missing.push({ recipe, needs }); continue; }

    // Scale the recipe so one sitting gives everyone their share of the day's calories
    // (within reason: a recipe is never shrunk or stretched more than it can take).
    const basePerPerson = picks.reduce((t, p) => t + p.per * p.food.nutrition.caloriesPerServing, 0);
    const portions = people ? Math.min(people * 1.6, Math.max(people * 0.6, mealCalories / Math.max(1, basePerPerson))) : 0;
    const lines: IdeaLine[] = picks.map(({ slot, food, per }) => {
      const servings = per * portions;
      const spp = food.package.servingsPerPackage;
      const pk = servings / spp;
      const packageNote = spp > 1 ? (pk < 0.2 ? `about 1/${Math.round(1 / pk)} of a ${food.package.description}` : pk < 0.95 ? `about ${fmtQty(pk)} of a ${food.package.description}` : `about ${fmtQty(pk)} × ${food.package.description}`) : undefined;
      return { label: slot.label, foodId: food.id, name: food.name, servings, amount: amountFor(food.nutrition.servingDesc, servings), packageNote, optional: !!slot.optional };
    });
    const caloriesTotal = Math.round(picks.reduce((t, p) => t + p.per * portions * p.food.nutrition.caloriesPerServing, 0));
    const required = lines.filter((l) => !l.optional);
    ideas.push({
      recipe, lines, people,
      caloriesTotal,
      caloriesPerPerson: people ? Math.round(caloriesTotal / people) : 0,
      waterCups: Math.round(lines.reduce((t, l) => t + l.servings * (byId.get(l.foodId)!.prep.waterCupsPerServing ?? 0), 0) * 4) / 4,
      sittings: required.length ? Math.floor(Math.min(...required.map((l) => (available.get(l.foodId) ?? 0) / l.servings)) + 1e-9) : 0,
    });
  }
  return { ideas, missing };
}
