import { describe, expect, it } from 'vitest';
import { buildSeedCatalog } from '../data/seedCatalog';
import { DEFAULT_PLANNING } from '../data/repo';
import { buildPlan, type PlanMember } from './planner';
import { inventoryStatus, remainingPlan, stockStatus } from './inventory';
import type { StockEntry } from './types';

const foods = buildSeedCatalog();
const m = (id: string): PlanMember => ({ id, name: id, ratings: {}, ignoredRefusals: [], surveyId: 's', restrictions: [], needs: [] });
const z: PlanMember = { ...m('z'), needs: [{ id: 'n', memberId: 'z', domain: 'food', kind: 'rapid-carbs', params: { servingsPerDay: 3 }, confirmed: true, active: true, createdAt: '', updatedAt: '' }] };
const plan = buildPlan({ tier: 'short', scenario: 'no-cook', days: 3, defaults: { ...DEFAULT_PLANNING }, members: [m('a'), z], foods });
const TODAY = '2026-11-14';
let n = 0;
const entry = (e: Partial<StockEntry>): StockEntry => ({ id: `e${n++}`, kind: 'food', quantity: 1, addedAt: '', updatedAt: '', ...e });

describe('stockStatus', () => {
  it('warns 30 days ahead by default, and honours a custom warning time', () => {
    expect(stockStatus(entry({ bestBy: '2026-11-13' }), TODAY)).toBe('expired');
    expect(stockStatus(entry({ bestBy: '2026-12-14' }), TODAY)).toBe('expiring');
    expect(stockStatus(entry({ bestBy: '2026-12-15' }), TODAY)).toBe('ok');
    expect(stockStatus(entry({ bestBy: '2026-12-20' }), TODAY, 45)).toBe('expiring');
    expect(stockStatus(entry({}), TODAY)).toBe('ok');
  });
});

describe('inventoryStatus', () => {
  const first = plan.items[0];
  it('subtracts what’s on hand; expired stock doesn’t count', () => {
    const stock = [
      entry({ foodId: first.foodId, quantity: 1, bestBy: '2030-01-01' }),
      entry({ foodId: first.foodId, quantity: 50, bestBy: '2020-01-01' }),
      entry({ foodId: 'pasta-dry', quantity: 2 }),
      entry({ kind: 'water', quantity: 2 }),
      entry({ kind: 'equipment', item: 'Trash bags' }),
    ];
    const s = inventoryStatus(plan, stock, foods, TODAY);
    const row = s.rows.find((r) => r.foodId === first.foodId)!;
    expect(row).toMatchObject({ need: first.packages, have: 1, expired: 50, toBuy: Math.max(0, first.packages - 1) });
    expect(s.extras.map((r) => r.foodId)).toEqual(['pasta-dry']);
    expect(s.water.haveGallons).toBe(2);
    expect(s.water.toBuyGallons).toBeCloseTo(plan.water.totalGallons - 2, 5);
    expect(s.equipment.find((e) => e.item === 'Trash bags')?.have).toBe(true);
    expect(s.rotation.map((x) => x.entry.quantity)).toEqual([50]);
    // Reserved individual items are tracked too.
    expect(s.rows.find((r) => r.foodId === 'glucose-tabs')?.reserved).toBe(true);
  });

  it('remaining plan lists only what is still to buy', () => {
    const stock = plan.items.map((i) => entry({ foodId: i.foodId, quantity: i.packages }));
    const rest = remainingPlan(plan, inventoryStatus(plan, stock, foods, TODAY));
    expect(rest.items).toEqual([]);
    expect(rest.reserved.map((r) => r.foodId)).toEqual(['glucose-tabs']);
    expect(rest.equipment.length).toBe(plan.equipment.length);
  });
});
