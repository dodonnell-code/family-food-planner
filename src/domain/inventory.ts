// Compares what's on hand with a plan: what's still to buy, what's extra, what needs rotating.
// Pure, so it's easy to test and reuse in reports.
import type { PlanResult } from './planner';
import type { FoodItem, ID, StockEntry } from './types';

/** Default warning time before a best-by date (Settings can change it). */
export const EXPIRING_SOON_DAYS = 30;

export type StockStatus = 'ok' | 'expiring' | 'expired';

export function stockStatus(e: StockEntry, today: string, warnDays = EXPIRING_SOON_DAYS): StockStatus {
  if (!e.bestBy) return 'ok';
  if (e.bestBy < today) return 'expired';
  const soon = new Date(Date.parse(today) + warnDays * 86_400_000).toISOString().slice(0, 10);
  return e.bestBy <= soon ? 'expiring' : 'ok';
}

export interface NeedRow {
  foodId: ID;
  name: string;
  packageDesc: string;
  /** Packages the plan calls for (group food + reserved individual items). */
  need: number;
  /** Unexpired packages on hand. */
  have: number;
  expired: number;
  expiring: number;
  toBuy: number;
  reserved: boolean;
  entries: StockEntry[];
}

export interface InventoryStatus {
  rows: NeedRow[];
  /** On hand but not in this plan. */
  extras: NeedRow[];
  totals: { needPackages: number; havePackages: number; toBuyPackages: number; plannedCalories: number; coveredCalories: number };
  water: { needGallons: number; haveGallons: number; expiredGallons: number; toBuyGallons: number; entries: StockEntry[] };
  equipment: { item: string; foods: string[]; have: boolean; entry?: StockEntry }[];
  /** Everything expired or expiring, soonest first. */
  rotation: { entry: StockEntry; name: string; status: StockStatus }[];
}

export function inventoryStatus(plan: PlanResult, stock: StockEntry[], foods: FoodItem[], today: string, warnDays = EXPIRING_SOON_DAYS): InventoryStatus {
  const foodName = (id?: ID) => foods.find((f) => f.id === id)?.name ?? 'Unknown food';
  const need = new Map<ID, { name: string; packageDesc: string; need: number; calories: number; reserved: boolean }>();
  for (const i of plan.items) need.set(i.foodId, { name: i.name, packageDesc: i.packageDesc, need: i.packages, calories: i.calories, reserved: false });
  for (const r of plan.reserved) {
    if (!r.foodId || !r.packages) continue;
    const cur = need.get(r.foodId);
    need.set(r.foodId, { name: r.foodName ?? foodName(r.foodId), packageDesc: r.packageDesc ?? '', need: (cur?.need ?? 0) + r.packages, calories: cur?.calories ?? 0, reserved: true });
  }

  const foodStock = stock.filter((e) => e.kind === 'food' && e.foodId);
  const byFood = new Map<ID, StockEntry[]>();
  for (const e of foodStock) byFood.set(e.foodId!, [...(byFood.get(e.foodId!) ?? []), e]);

  const row = (foodId: ID, n: { name: string; packageDesc: string; need: number; reserved: boolean }): NeedRow => {
    const entries = (byFood.get(foodId) ?? []).sort((a, b) => (a.bestBy ?? '9999').localeCompare(b.bestBy ?? '9999'));
    const sum = (s: StockStatus[]) => entries.filter((e) => s.includes(stockStatus(e, today, warnDays))).reduce((t, e) => t + e.quantity, 0);
    const have = sum(['ok', 'expiring']);
    return { foodId, name: n.name, packageDesc: n.packageDesc, need: n.need, have, expired: sum(['expired']), expiring: sum(['expiring']), toBuy: Math.max(0, Math.ceil(n.need - have)), reserved: n.reserved, entries };
  };

  const rows = [...need].map(([id, n]) => row(id, n));
  const extras = [...byFood.keys()].filter((id) => !need.has(id)).map((id) => {
    const f = foods.find((x) => x.id === id);
    return row(id, { name: f?.name ?? 'Unknown food', packageDesc: f?.package.description ?? '', need: 0, reserved: false });
  }).sort((a, b) => a.name.localeCompare(b.name));

  // Calories covered: for each planned food, the fraction on hand (capped at what's needed).
  const coveredCalories = rows.reduce((t, r) => t + (need.get(r.foodId)!.calories * Math.min(1, r.need ? r.have / r.need : 0)), 0);

  const waterEntries = stock.filter((e) => e.kind === 'water');
  const haveGallons = waterEntries.filter((e) => stockStatus(e, today, warnDays) !== 'expired').reduce((t, e) => t + e.quantity, 0);
  const expiredGallons = waterEntries.filter((e) => stockStatus(e, today, warnDays) === 'expired').reduce((t, e) => t + e.quantity, 0);

  const gear = stock.filter((e) => e.kind === 'equipment');
  const equipment = plan.equipment.map((e) => {
    const entry = gear.find((g) => g.item === e.item);
    return { item: e.item, foods: e.foods, have: !!entry && entry.quantity > 0, entry };
  });

  const rotation = [...foodStock, ...waterEntries]
    .map((entry) => ({ entry, name: entry.kind === 'water' ? 'Stored water' : foodName(entry.foodId), status: stockStatus(entry, today, warnDays) }))
    .filter((x) => x.status !== 'ok')
    .sort((a, b) => (a.entry.bestBy ?? '').localeCompare(b.entry.bestBy ?? ''));

  return {
    rows: rows.sort((a, b) => b.toBuy - a.toBuy || a.name.localeCompare(b.name)),
    extras,
    totals: {
      needPackages: rows.reduce((t, r) => t + r.need, 0),
      havePackages: rows.reduce((t, r) => t + Math.min(r.have, r.need), 0),
      toBuyPackages: rows.reduce((t, r) => t + r.toBuy, 0),
      plannedCalories: plan.plannedCalories,
      coveredCalories: Math.round(coveredCalories),
    },
    water: { needGallons: plan.water.totalGallons, haveGallons, expiredGallons, toBuyGallons: Math.max(0, Math.round((plan.water.totalGallons - haveGallons) * 10) / 10), entries: waterEntries },
    equipment,
    rotation,
  };
}

/** The plan reduced to what's still to buy (for printing/exporting a shopping list). */
export function remainingPlan(plan: PlanResult, status: InventoryStatus): PlanResult {
  const toBuy = new Map(status.rows.map((r) => [r.foodId, r.toBuy]));
  let left = new Map(toBuy);
  const items = plan.items.flatMap((i) => {
    const n = Math.min(i.packages, left.get(i.foodId) ?? 0);
    left.set(i.foodId, (left.get(i.foodId) ?? 0) - n);
    if (n <= 0) return [];
    const servings = Math.min(i.servings, n * i.servingsPerPackage);
    return [{ ...i, packages: n, servings, leftoverServings: Math.round((n * i.servingsPerPackage - servings) * 10) / 10 }];
  });
  const reserved = plan.reserved.flatMap((r) => {
    if (!r.foodId || !r.packages) return [r];
    const n = Math.min(r.packages, left.get(r.foodId) ?? 0);
    left.set(r.foodId, (left.get(r.foodId) ?? 0) - n);
    return n > 0 ? [{ ...r, packages: n }] : [];
  });
  left = new Map();
  const missingGear = new Set(status.equipment.filter((e) => !e.have).map((e) => e.item));
  return {
    ...plan,
    items,
    reserved,
    equipment: plan.equipment.filter((e) => missingGear.has(e.item)),
    water: { ...plan.water, totalGallons: status.water.toBuyGallons },
    warnings: [],
  };
}
