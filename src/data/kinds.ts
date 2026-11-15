// Kinds (varieties) for the generic catalog foods: the survey asks which kinds each person
// likes, and the shopping list says which kinds to buy and which to skip for someone's safety.
// Allergens/tags here add to the food's own (which hold only what every kind has in common).
// Generic values: brands and recipes differ, so labels still need checking.
import type { FoodKind } from '../domain/types';

const k = (id: string, name: string, icon: string, extra: Omit<FoodKind, 'id' | 'name' | 'icon'> = {}): FoodKind => ({ id, name, icon, ...extra });
const VEG = ['vegetarian'];
const VEGAN = ['vegan', 'vegetarian'];

export const SEED_KINDS: Record<string, FoodKind[]> = {
  'canned-fruit': [
    k('peaches', 'Peaches', '🍑'), k('pears', 'Pears', '🍐'), k('pineapple', 'Pineapple', '🍍'),
    k('mandarin', 'Mandarin oranges', '🍊'), k('fruit-cocktail', 'Fruit cocktail', '🍒'), k('cherries', 'Cherries', '🍒'),
    k('apricots', 'Apricots', '🍑'), k('mango', 'Mango', '🥭'), k('mixed-cups', 'Mixed fruit cups', '🥣'),
  ],
  'fd-fruit': [
    k('strawberries', 'Strawberries', '🍓'), k('bananas', 'Bananas', '🍌'), k('apples', 'Apples', '🍎'),
    k('blueberries', 'Blueberries', '🫐'), k('mango', 'Mango', '🥭'), k('peaches', 'Peaches', '🍑'),
    k('pineapple', 'Pineapple', '🍍'), k('raspberries', 'Raspberries', '🍓'), k('mixed', 'Mixed fruit', '🍇'),
  ],
  'canned-veg': [
    k('green-beans', 'Green beans', '🫛'), k('corn', 'Corn', '🌽', { contains: ['corn'] }), k('carrots', 'Carrots', '🥕'),
    k('peas', 'Peas', '🟢'), k('mixed', 'Mixed vegetables', '🥗', { contains: ['corn'] }), k('potatoes', 'Potatoes', '🥔'),
    k('spinach', 'Spinach', '🥬'), k('sweet-potatoes', 'Sweet potatoes / yams', '🍠'), k('mushrooms', 'Mushrooms', '🍄'),
    k('beets', 'Beets', '🔴'),
  ],
  'fd-veg': [
    k('corn', 'Corn', '🌽', { contains: ['corn'] }), k('peas', 'Peas', '🟢'), k('green-beans', 'Green beans', '🫛'),
    k('broccoli', 'Broccoli', '🥦'), k('carrots', 'Carrots', '🥕'), k('mixed', 'Mixed vegetables', '🥗', { contains: ['corn'] }),
    k('peppers', 'Bell peppers', '🫑'), k('onions', 'Onions', '🧅'), k('potatoes', 'Potato dices / hash browns', '🥔'),
    k('spinach', 'Spinach', '🥬'),
  ],
  'canned-soup': [
    k('chicken-noodle', 'Chicken noodle', '🍜', { contains: ['wheat', 'gluten', 'egg'], tags: ['poultry', 'kid-friendly'] }),
    k('chicken-rice', 'Chicken & rice', '🍚', { tags: ['poultry', 'kid-friendly'] }),
    k('tomato', 'Tomato', '🍅', { contains: ['wheat', 'gluten'], tags: VEG }),
    k('vegetable', 'Vegetable', '🥕', { tags: VEGAN }),
    k('beef-stew', 'Beef stew', '🥩', { contains: ['wheat', 'gluten'], tags: ['beef'] }),
    k('beef-vegetable', 'Beef & vegetable', '🥘', { tags: ['beef'] }),
    k('minestrone', 'Minestrone', '🍝', { contains: ['wheat', 'gluten'], tags: VEG }),
    k('clam-chowder', 'Clam chowder', '🐚', { contains: ['shellfish', 'milk', 'wheat', 'gluten'] }),
    k('cream-mushroom', 'Cream of mushroom', '🍄', { contains: ['milk', 'wheat', 'gluten'], tags: VEG }),
    k('potato-cheese', 'Potato / cheddar', '🥔', { contains: ['milk', 'wheat', 'gluten'], tags: VEG }),
    k('split-pea', 'Split pea (with ham)', '🟢', { tags: ['pork'] }),
    k('lentil', 'Lentil', '🫘', { tags: VEGAN }),
  ],
  'canned-chili': [
    k('beef-beans', 'Beef chili with beans', '🌶️', { tags: ['beef'] }),
    k('beef-no-beans', 'Beef chili, no beans', '🥩', { tags: ['beef'] }),
    k('turkey', 'Turkey chili', '🦃', { tags: ['poultry'] }),
    k('vegetarian', 'Vegetarian bean chili', '🫘', { tags: VEGAN }),
    k('white-chicken', 'White chicken chili', '🍗', { contains: ['milk'], tags: ['poultry'] }),
  ],
  'canned-beans': [
    k('black', 'Black beans', '⚫'), k('kidney', 'Kidney beans', '🔴'), k('pinto', 'Pinto beans', '🟤'),
    k('chickpeas', 'Chickpeas (garbanzo)', '🟡'), k('white', 'White / great northern', '⚪'), k('lentils', 'Lentils', '🟠'),
    k('baked', 'Baked beans', '🍯', { tags: VEG }), k('pork-beans', 'Pork & beans', '🐖', { tags: ['pork'] }),
  ],
  tuna: [
    k('light-water', 'Chunk light, in water', '🐟'), k('albacore', 'Albacore (white)', '🐟'), k('in-oil', 'Packed in oil', '🫒', { mayContain: ['soy'] }),
    k('flavored', 'Flavored pouches (lemon pepper, etc.)', '🍋', { mayContain: ['soy', 'milk'] }),
    k('salad-kit', 'Tuna salad kits with crackers', '🥪', { contains: ['egg', 'wheat', 'gluten', 'soy'] }),
  ],
  bars: [
    k('granola', 'Granola bars', '🌾', { contains: ['wheat', 'gluten'], mayContain: ['peanut', 'tree-nut', 'soy'] }),
    k('chewy', 'Chewy bars (chocolate chip, etc.)', '🍫', { contains: ['wheat', 'gluten', 'milk', 'soy'], mayContain: ['peanut', 'tree-nut'] }),
    k('protein', 'Protein bars', '💪', { contains: ['milk', 'soy'], mayContain: ['peanut', 'tree-nut'] }),
    k('peanut-butter', 'Peanut butter bars', '🥜', { contains: ['peanut', 'soy'] }),
    k('nut', 'Nut bars', '🌰', { contains: ['tree-nut'], mayContain: ['peanut'] }),
    k('fruit-grain', 'Fruit & grain bars', '🍓', { contains: ['wheat', 'gluten', 'soy'], mayContain: ['milk'] }),
    k('breakfast', 'Breakfast / meal-replacement bars', '🥣', { contains: ['milk', 'soy'], mayContain: ['wheat', 'peanut', 'tree-nut'] }),
  ],
  'fd-entree': [
    k('stroganoff', 'Beef stroganoff', '🥩', { tags: ['beef'] }), k('chili-mac', 'Chili mac', '🌶️', { tags: ['beef'] }),
    k('teriyaki', 'Teriyaki chicken & rice', '🍗', { tags: ['poultry'] }), k('alfredo', 'Chicken alfredo', '🍝', { contains: ['egg'], tags: ['poultry'] }),
    k('lasagna', 'Lasagna', '🍝', { tags: ['beef'] }), k('mac-cheese', 'Mac & cheese', '🧀', { tags: VEG }),
    k('sweet-sour', 'Sweet & sour chicken', '🍗', { tags: ['poultry'] }), k('primavera', 'Pasta primavera', '🥗', { tags: VEG }),
    k('rice-beans', 'Rice & beans', '🫘', { tags: VEG }), k('beef-stew', 'Beef stew', '🍲', { tags: ['beef'] }),
  ],
  'fd-meal': [
    k('stroganoff', 'Beef stroganoff', '🥩', { tags: ['beef'] }), k('chili-mac', 'Chili mac', '🌶️', { tags: ['beef'] }),
    k('chicken-rice', 'Chicken & rice', '🍗', { tags: ['poultry'] }), k('alfredo', 'Chicken alfredo', '🍝', { contains: ['egg'], tags: ['poultry'] }),
    k('lasagna', 'Lasagna', '🍝', { tags: ['beef'] }), k('mac-cheese', 'Mac & cheese', '🧀', { tags: VEG }),
    k('pad-thai', 'Pad thai', '🍜', { contains: ['peanut', 'egg'], tags: ['poultry'] }), k('breakfast-skillet', 'Breakfast skillet', '🍳', { contains: ['egg'], tags: ['pork'] }),
    k('rice-beans', 'Rice & beans', '🫘', { tags: VEG }),
  ],
  'fd-breakfast': [
    k('eggs-bacon', 'Scrambled eggs with bacon', '🥓', { tags: ['pork'] }), k('eggs', 'Scrambled eggs (plain)', '🍳', { tags: VEG }),
    k('granola', 'Granola with milk & blueberries', '🥣', { contains: ['wheat', 'gluten'], mayContain: ['tree-nut'], tags: VEG }),
    k('biscuits-gravy', 'Biscuits & gravy', '🍞', { contains: ['wheat', 'gluten'], tags: ['pork'] }),
    k('pancakes', 'Pancakes', '🥞', { contains: ['wheat', 'gluten'], tags: VEG }),
    k('oatmeal', 'Oatmeal (apple cinnamon, etc.)', '🥣', { mayContain: ['wheat', 'gluten'], tags: VEG }),
  ],
  ramen: [
    k('chicken', 'Chicken', '🍗', { tags: ['poultry'] }), k('beef', 'Beef', '🥩', { tags: ['beef'] }),
    k('shrimp', 'Shrimp', '🦐', { contains: ['shellfish'] }), k('soy-sauce', 'Soy sauce / oriental', '🍜'),
    k('spicy', 'Spicy', '🌶️'), k('cup', 'Cup noodles (in the cup)', '🥤'),
  ],
  'juice-boxes': [
    k('apple', 'Apple', '🍎'), k('grape', 'Grape', '🍇'), k('fruit-punch', 'Fruit punch', '🍹'), k('orange', 'Orange', '🍊'), k('berry', 'Berry', '🫐'),
  ],
  'beef-jerky': [
    k('original', 'Original beef', '🥩'), k('teriyaki', 'Teriyaki', '🍶', { contains: ['wheat', 'gluten'] }), k('peppered', 'Peppered', '🌶️'),
    k('turkey', 'Turkey jerky', '🦃', { tags: ['poultry', 'high-protein'] }), k('meat-sticks', 'Meat sticks', '🌭', { tags: ['beef', 'pork', 'high-protein'] }),
  ],
  crackers: [
    k('saltines', 'Saltines', '🧂'), k('butter', 'Butter crackers (Ritz-style)', '🧈', { mayContain: ['milk'] }), k('wheat', 'Wheat crackers', '🌾'),
    k('cheese', 'Cheese crackers', '🧀', { contains: ['milk'] }), k('graham', 'Graham crackers', '🍪', { mayContain: ['milk', 'soy'] }),
    k('sandwich', 'Peanut butter sandwich crackers', '🥜', { contains: ['peanut', 'soy'] }),
  ],
  cereal: [
    k('os', 'Toasted oat O’s', '⭕', { mayContain: ['wheat'] }), k('flakes', 'Corn or bran flakes', '🌽', { contains: ['corn'] }),
    k('frosted', 'Frosted / sweetened', '✨'), k('puffed-rice', 'Crisp rice', '🍚', { mayContain: ['milk'] }),
    k('shredded-wheat', 'Shredded wheat', '🌾'), k('granola', 'Granola-style', '🥣', { mayContain: ['tree-nut', 'peanut'] }),
  ],
};
