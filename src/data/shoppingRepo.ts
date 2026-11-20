// The shared shopping list: filled from Inventory ("Add to list"), Deals (a sale) or by hand;
// checked off at the store; then each bought item is put into inventory.
import { audit, db as defaultDb, now, uid, type PlannerDB } from './db';
import type { ID, ShoppingItem, ShoppingSale } from '../domain/types';

export type NewShoppingItem = Omit<ShoppingItem, 'id' | 'checked' | 'addedAt' | 'updatedAt'>;

export const listShopping = (database: PlannerDB = defaultDb) => database.shopping.toArray();

/**
 * Put something on the list. A food already on the list (not yet checked off) isn't added
 * twice: a sale picked for it fills in where to buy it, and a different sale adds a second line
 * (e.g. two kinds of soup at two stores).
 */
export async function addToShopping(input: NewShoppingItem, database: PlannerDB = defaultDb): Promise<ShoppingItem> {
  if (!input.name.trim()) throw new Error('Enter what to buy');
  if (input.quantity !== undefined && (!Number.isFinite(input.quantity) || input.quantity < 0)) throw new Error('Enter an amount of 0 or more');
  return database.transaction('rw', [database.shopping, database.audit], async () => {
    const open = (await database.shopping.toArray()).filter((s) => !s.checked && s.kind === input.kind && (input.kind === 'other' ? s.name.toLowerCase() === input.name.trim().toLowerCase() : s.foodId === input.foodId));
    const same = open.find((s) => (s.sale?.saleId ?? null) === (input.sale?.saleId ?? null)) ?? (input.sale ? open.find((s) => !s.sale) : undefined);
    const ts = now();
    if (same) {
      const merged: ShoppingItem = { ...same, sale: input.sale ?? same.sale, quantity: input.quantity ?? same.quantity, updatedAt: ts };
      await database.shopping.put(merged);
      return merged;
    }
    const item: ShoppingItem = { ...input, name: input.name.trim(), note: input.note?.trim() || undefined, id: uid(), checked: false, addedAt: ts, updatedAt: ts };
    await database.shopping.add(item);
    await audit('shopping.add', { shoppingId: item.id, foodId: item.foodId }, undefined, database);
    return item;
  });
}

export async function updateShopping(id: ID, patch: Partial<Pick<ShoppingItem, 'quantity' | 'checked' | 'note' | 'variety' | 'sale'>>, database: PlannerDB = defaultDb) {
  await database.shopping.update(id, { ...patch, updatedAt: now() });
}

export async function removeShopping(id: ID, database: PlannerDB = defaultDb) {
  await database.shopping.delete(id);
}

/** Take a sale off the list: the line goes, unless it was on the list before the sale was picked. */
export async function removeSale(foodKey: { kind: ShoppingItem['kind']; foodId?: ID }, saleId: number, database: PlannerDB = defaultDb) {
  const line = (await database.shopping.toArray()).find((s) => s.kind === foodKey.kind && s.foodId === foodKey.foodId && s.sale?.saleId === saleId);
  if (line) await database.shopping.delete(line.id);
}

export async function clearChecked(database: PlannerDB = defaultDb) {
  const done = (await database.shopping.toArray()).filter((s) => s.checked).map((s) => s.id);
  await database.shopping.bulkDelete(done);
}

export const saleOf = (s: { id: number; store: string; product: string; price: string; through?: string }): ShoppingSale =>
  ({ saleId: s.id, store: s.store, product: s.product, price: s.price, through: s.through });
