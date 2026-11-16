// Inventory writes. These are routine bookkeeping, so they're audited but don't create
// review items (Review stays focused on profile and safety changes).
import { audit, db as defaultDb, now, uid, type PlannerDB } from './db';
import type { ID, StockEntry } from '../domain/types';
import { planUse } from '../domain/inventory';

export async function addStock(input: Omit<StockEntry, 'id' | 'addedAt' | 'updatedAt'>, database: PlannerDB = defaultDb): Promise<StockEntry> {
  if (!(input.quantity > 0) || !Number.isFinite(input.quantity)) throw new Error('Enter a quantity more than 0');
  if (input.kind === 'food' && !input.foodId) throw new Error('Choose a food');
  const ts = now();
  const e: StockEntry = { ...input, bestBy: input.bestBy || undefined, note: input.note?.trim() || undefined, id: uid(), addedAt: ts, updatedAt: ts };
  await database.stock.add(e);
  await audit('stock.add', { stockId: e.id, foodId: e.foodId ?? '' }, `${e.kind} ${e.quantity}`, database);
  return e;
}

export async function updateStock(id: ID, patch: Partial<Pick<StockEntry, 'quantity' | 'bestBy' | 'note'>>, database: PlannerDB = defaultDb) {
  if (patch.quantity !== undefined && (!Number.isFinite(patch.quantity) || patch.quantity < 0)) throw new Error('Quantity can’t be negative');
  if (patch.quantity === 0) return removeStock(id, database);
  await database.stock.update(id, { ...patch, updatedAt: now() });
  await audit('stock.update', { stockId: id }, Object.keys(patch).join(','), database);
}

/** Used up, thrown out, or entered by mistake. */
export async function removeStock(id: ID, database: PlannerDB = defaultDb) {
  await database.stock.delete(id);
  await audit('stock.remove', { stockId: id }, undefined, database);
}

/** Tick an equipment item as on hand (or not). */
export async function setEquipmentHave(item: string, have: boolean, database: PlannerDB = defaultDb) {
  const existing = await database.stock.where('kind').equals('equipment').filter((e) => e.item === item).toArray();
  if (have && !existing.length) await addStock({ kind: 'equipment', item, quantity: 1 }, database);
  if (!have) for (const e of existing) await removeStock(e.id, database);
}

export const listStock = (database: PlannerDB = defaultDb) => database.stock.toArray();

/** Some was eaten (or drunk) in everyday meals: take it from the batches that expire soonest. */
export async function consumeStock(entries: StockEntry[], qty: number, today: string, database: PlannerDB = defaultDb) {
  const changes = planUse(entries, qty, today);
  await database.transaction('rw', [database.stock, database.audit], async () => {
    for (const c of changes) {
      if (c.quantity <= 0) await database.stock.delete(c.id);
      else await database.stock.update(c.id, { quantity: c.quantity, updatedAt: now() });
    }
    await audit('stock.use', { foodId: entries[0]?.foodId ?? '' }, `${entries[0]?.kind ?? 'food'} -${qty}`, database);
  });
}
