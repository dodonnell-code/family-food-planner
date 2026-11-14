import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { PlannerDB, uid } from './db';
import { addMember, ensureInitialized } from './repo';
import { blankFood, saveFieldDefinition, saveFood, setCustomValue, setFoodActive, updateHousehold } from './adminRepo';
import { createVault, decryptString } from './crypto';
import { decideChange } from './changes';
import { diffRows } from '../domain/changeView';

let db: PlannerDB;
beforeEach(async () => {
  db = new PlannerDB(`test-${uid()}`);
  await ensureInitialized(db);
});
const latest = async () => (await db.changes.orderBy('timestamp').toArray()).at(-1)!;
const L = async () => ({ members: new Map(), restrictions: new Map(), needs: new Map(), foods: new Map((await db.foods.toArray()).map((f) => [f.id, f])) });

describe('food catalog', () => {
  it('adds a food with derived prep fields', async () => {
    const f = await saveFood({ ...blankFood(), name: 'Canned soup X', prep: { ...blankFood().prep, method: 'simmer', cookMinutes: 10 } }, db);
    expect(f.id).toMatch(/^custom-/);
    expect(f.prep.edibleWithoutHeat).toBe(false);
    expect(f.prep.needsFuel).toBe(true);
    expect((await latest()).op).toBe('create');
  });

  it('edits mark the entry as admin-edited and record only changed nested fields', async () => {
    const rice = (await db.foods.get('white-rice'))!;
    await saveFood({ ...rice, nutrition: { ...rice.nutrition, carbsG: 40 }, allergens: { ...rice.allergens, contains: ['corn'] } }, db);
    const after = (await db.foods.get('white-rice'))!;
    expect(after.revision).toBe(2);
    const rows = diffRows(await latest(), await L());
    expect(rows.map((r) => r.label).sort()).toEqual(['Carbs (g)', 'Contains']);
  });

  it('refuses invalid data', async () => {
    await expect(saveFood({ ...blankFood(), name: '' }, db)).rejects.toThrow(/Name/);
    await expect(saveFood({ ...blankFood(), name: 'x', package: { description: '', servingsPerPackage: 0 } }, db)).rejects.toThrow(/Servings/);
  });

  it('retires without deleting, and deny restores it', async () => {
    await setFoodActive('tuna-canned', false, db);
    expect((await db.foods.get('tuna-canned'))?.active).toBe(false);
    await decideChange((await latest()).id, 'deny', db);
    expect((await db.foods.get('tuna-canned'))?.active).toBe(true);
  });
});

describe('household settings', () => {
  it('validates horizons and records before/after', async () => {
    const hh = (await db.households.toCollection().first())!;
    await expect(updateHousehold({ planningDefaults: { ...hh.planningDefaults, mediumDays: 2 } }, db)).rejects.toThrow(/increase/);
    await updateHousehold({ planningDefaults: { ...hh.planningDefaults, mediumDays: 30, mealsPerDay: 2 } }, db);
    const rows = diffRows(await latest(), await L());
    expect(rows.map((r) => [r.label, (r.before as { text: string }).text, (r.after as { text: string }).text])).toEqual([
      ['Medium-term plan (days)', '14', '30'],
      ['Group meals per day', '3', '2'],
    ]);
  });

  it('fills newly added defaults for older households', async () => {
    const hh = (await db.households.toCollection().first())!;
    const { mealsPerDay: _m, waterReserveDays: _w, ...old } = hh.planningDefaults;
    await db.households.put({ ...hh, planningDefaults: old as typeof hh.planningDefaults });
    const fixed = await ensureInitialized(db);
    expect(fixed.planningDefaults.mealsPerDay).toBe(3);
    expect(fixed.planningDefaults.waterReserveDays).toBe(3);
  });
});

describe('custom fields', () => {
  it('encrypts private values and keeps reportable ones plain', async () => {
    const { dek } = await createVault('pw-12345678');
    const m = await addMember({ displayName: 'Sam' }, db);
    const priv = await saveFieldDefinition({ label: 'Comfort food', dataType: 'text', sensitivity: 'private', enabled: true }, db);
    const pub = await saveFieldDefinition({ label: 'Shirt size', dataType: 'single-select', options: ['S', 'M', ''], sensitivity: 'reportable', enabled: true }, db);
    expect(pub.options).toEqual(['S', 'M']);
    await setCustomValue(m.id, priv, 'hot cocoa', dek, db);
    await setCustomValue(m.id, pub, 'M', dek, db);
    const pv = await db.customValues.get(`${m.id}:${priv.id}`);
    expect(pv?.value).toBeUndefined();
    expect(JSON.parse(await decryptString(dek, pv!.valueEnc!))).toBe('hot cocoa');
    expect((await db.customValues.get(`${m.id}:${pub.id}`))?.value).toBe('M');
  });

  it('requires options for select fields', async () => {
    await expect(saveFieldDefinition({ label: 'X', dataType: 'multi-select', options: [], sensitivity: 'private', enabled: true }, db)).rejects.toThrow(/option/);
  });
});
