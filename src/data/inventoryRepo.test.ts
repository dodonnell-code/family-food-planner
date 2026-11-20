import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { PlannerDB, uid } from './db';
import { addStock, clearStock, consumeStock, undoStockChange, updateStock } from './inventoryRepo';

describe('marking stock used, with undo', () => {
  it('takes from the soonest batch, and Undo puts every batch back exactly', async () => {
    const db = new PlannerDB(`inv-${uid()}`);
    const early = await addStock({ kind: 'food', foodId: 'canned-chili', quantity: 1, bestBy: '2027-01-01' }, db);
    const late = await addStock({ kind: 'food', foodId: 'canned-chili', quantity: 3, bestBy: '2028-01-01' }, db);
    const snapshot = async () => (await db.stock.toArray()).sort((a, b) => a.id.localeCompare(b.id));
    const start = await snapshot();

    const before = await consumeStock(await db.stock.toArray(), 1.5, '2026-11-20', db);
    expect(await db.stock.get(early.id)).toBeUndefined();
    expect((await db.stock.get(late.id))?.quantity).toBe(2.5);
    await undoStockChange(before, db);
    expect(await snapshot()).toEqual(start);

    const gone = await clearStock(await db.stock.toArray(), db);
    expect(await db.stock.count()).toBe(0);
    await undoStockChange(gone, db);
    expect(await snapshot()).toEqual(start);
  });
});

describe('kinds and editing batches', () => {
  it('saves the kind, and an edit can change kind, amount, date and size', async () => {
    const db = new PlannerDB(`inv-${uid()}`);
    const e = await addStock({ kind: 'food', foodId: 'canned-beans', quantity: 3.81, variety: '  Navy beans ', bought: { count: 1, size: 160, unit: 'oz' } }, db);
    expect(e.variety).toBe('Navy beans');
    await updateStock(e.id, { variety: 'Pinto beans', quantity: 4, bestBy: '2029-03-01', bought: undefined }, db);
    const after = (await db.stock.get(e.id))!;
    expect(after).toMatchObject({ variety: 'Pinto beans', quantity: 4, bestBy: '2029-03-01' });
    expect(after.bought).toBeUndefined();
  });
});
