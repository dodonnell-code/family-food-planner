import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { PlannerDB, uid } from './db';
import { addToShopping, clearChecked, removeSale, updateShopping } from './shoppingRepo';

const beans = { kind: 'food' as const, foodId: 'canned-beans', name: 'Canned beans', quantity: 4, packageDesc: '15 oz can' };
const sale = (saleId: number, store: string) => ({ saleId, store, product: 'Bush’s beans', price: '$1.00' });

describe('shopping list', () => {
  it('doesn’t list a food twice; a sale fills in where to buy it; a second sale is its own line', async () => {
    const db = new PlannerDB(`shop-${uid()}`);
    await addToShopping(beans, db);
    await addToShopping({ ...beans, quantity: 5 }, db);
    expect(await db.shopping.count()).toBe(1);
    expect((await db.shopping.toArray())[0].quantity).toBe(5);

    await addToShopping({ ...beans, sale: sale(1, 'Kroger') }, db);
    let all = await db.shopping.toArray();
    expect(all).toHaveLength(1);
    expect(all[0].sale?.store).toBe('Kroger');

    await addToShopping({ ...beans, sale: sale(2, 'Aldi') }, db);
    expect(await db.shopping.count()).toBe(2);
    await removeSale({ kind: 'food', foodId: 'canned-beans' }, 2, db);
    all = await db.shopping.toArray();
    expect(all.map((s) => s.sale?.store)).toEqual(['Kroger']);
  });

  it('typed items match by name; checked items are cleared', async () => {
    const db = new PlannerDB(`shop-${uid()}`);
    const a = await addToShopping({ kind: 'other', name: ' Paper towels ' }, db);
    await addToShopping({ kind: 'other', name: 'paper towels' }, db);
    expect(a.name).toBe('Paper towels');
    expect(await db.shopping.count()).toBe(1);
    await updateShopping(a.id, { checked: true }, db);
    // Once checked off, the same thing can go back on the list for next time.
    await addToShopping({ kind: 'other', name: 'Paper towels' }, db);
    expect(await db.shopping.count()).toBe(2);
    await clearChecked(db);
    expect(await db.shopping.count()).toBe(1);
  });
});
