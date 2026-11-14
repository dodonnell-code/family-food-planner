// Equipment needed to prepare or store a food. Most of it follows from how the food is
// prepared and packaged; foods can add their own (e.g. a grain mill for wheat berries).
import type { FoodItem } from './types';

export const STOVE = 'Camp stove or other outdoor cooking method, with fuel';
export const IGNITION = 'Matches or lighter in a waterproof bag';

/** Equipment implied by the food's preparation method, form and package. */
export function implicitEquipment(f: FoodItem): string[] {
  const out: string[] = [];
  const bigCan = /#10/.test(f.package.description);
  if ((f.form === 'canned' && !/pull-tab/i.test(f.name)) || bigCan) out.push('Manual can opener');
  if (bigCan) out.push('Plastic lids for opened #10 cans');
  if (f.prep.method === 'add-cold-water') out.push('Pitcher, jar or shaker bottle for mixing');
  if (f.prep.method === 'add-hot-water') out.push('Kettle or pot for boiling water');
  if (f.prep.method === 'heat' || f.prep.method === 'simmer' || f.prep.method === 'boil') out.push('Cooking pot with lid');
  if (f.prep.needsFuel) out.push(STOVE, IGNITION);
  if (f.prep.waterCupsPerServing > 0) out.push('Measuring cup');
  if ((f.form === 'dry' || f.form === 'bulk') && f.package.servingsPerPackage >= 20) out.push('Airtight food-grade containers (buckets, or Mylar bags with oxygen absorbers)');
  return out;
}

/** Everything a food needs: implied equipment plus anything listed on the food itself. */
export function equipmentFor(f: FoodItem): string[] {
  return [...new Set([...implicitEquipment(f), ...(f.equipment ?? [])])];
}

/** Always useful for any stored food plan. */
export const BASIC_EQUIPMENT = ['Plates, cups and utensils (disposable or easy to clean)', 'Food-safe containers with lids for leftovers', 'Trash bags'];
