import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { PlannerDB, uid } from './db';
import {
  addCondition,
  addMember,
  addNeed,
  addRestrictions,
  mergeMembers,
  addRestriction,
  answersFor,
  ensureInitialized,
  isOnRoster,
  latestSubmittedSurvey,
  saveAnswer,
  setMemberStatus,
  startOrResumeSurvey,
  submitSurvey,
  updateMember,
  updateSurveyProgress,
} from './repo';
import { buildSeedCatalog } from './seedCatalog';

let db: PlannerDB;
beforeEach(async () => {
  db = new PlannerDB(`test-${uid()}`);
  await ensureInitialized(db);
});

describe('seed catalog', () => {
  it('has at least 50 entries across all categories, each requiring label verification', () => {
    const cat = buildSeedCatalog();
    expect(cat.length).toBeGreaterThanOrEqual(50);
    expect(new Set(cat.map((f) => f.id)).size).toBe(cat.length);
    expect(new Set(cat.map((f) => f.category)).size).toBe(9);
    expect(cat.every((f) => f.allergens.verifyLabel)).toBe(true);
  });
  it('is seeded once and does not duplicate on re-init', async () => {
    const n = await db.foods.count();
    await ensureInitialized(db);
    expect(await db.foods.count()).toBe(n);
  });
});

async function completeSurvey(memberId: string, ratings: Record<string, Parameters<typeof saveAnswer>[2]>) {
  const s = await startOrResumeSurvey(memberId, db);
  for (const [food, r] of Object.entries(ratings)) await saveAnswer(s.id, food, r, {}, db);
  await submitSurvey(s.id, db);
  return s;
}

describe('acceptance tests (scope §12)', () => {
  it('#1 adding Charlie later does not alter earlier surveys', async () => {
    const alice = await addMember({ displayName: 'Alice' }, db);
    const bob = await addMember({ displayName: 'Bob' }, db);
    const sa = await completeSurvey(alice.id, { 'tuna-canned': 5 });
    await completeSurvey(bob.id, { 'tuna-canned': 2 });
    const before = await answersFor(sa.id, db);
    const charlie = await addMember({ displayName: 'Charlie' }, db);
    expect((await db.members.toArray()).filter((m) => isOnRoster(m)).map((m) => m.id)).toContain(charlie.id);
    expect(await answersFor(sa.id, db)).toEqual(before);
  });

  it('#2 archiving Charlie removes him from roster but keeps history; reactivation restores', async () => {
    const charlie = await addMember({ displayName: 'Charlie' }, db);
    const s = await completeSurvey(charlie.id, { 'white-rice': 4 });
    await setMemberStatus(charlie.id, 'archived', db);
    const m = (await db.members.get(charlie.id))!;
    expect(isOnRoster(m)).toBe(false);
    expect(await answersFor(s.id, db)).toHaveLength(1);
    await setMemberStatus(charlie.id, 'active', db);
    const latest = await latestSubmittedSurvey(charlie.id, db);
    expect(latest?.id).toBe(s.id);
    expect(latest?.needsRefresh).toBe(true);
  });

  it('#5 "not tried" is stored as unknown, not a negative rating', async () => {
    const bob = await addMember({ displayName: 'Bob' }, db);
    const s = await completeSurvey(bob.id, { 'lentils-dry': 'unknown' });
    const [a] = await answersFor(s.id, db);
    expect(a.rating).toBe('unknown');
  });

  it('#6 resume a half-finished survey at the saved step with answers intact (after "reopen")', async () => {
    const name = `test-${uid()}`;
    const db1 = new PlannerDB(name);
    await ensureInitialized(db1);
    const m = await addMember({ displayName: 'Dana' }, db1);
    const s = await startOrResumeSurvey(m.id, db1);
    await saveAnswer(s.id, 'chili-canned', 4, {}, db1);
    await updateSurveyProgress(s.id, { currentStep: 3 }, db1);
    db1.close();

    const db2 = new PlannerDB(name); // simulate app termination + reopen
    const resumed = await startOrResumeSurvey(m.id, db2);
    expect(resumed.id).toBe(s.id);
    expect(resumed.currentStep).toBe(3);
    expect((await answersFor(s.id, db2))[0].rating).toBe(4);
  });

  it('#7 renaming a member keeps responses tied to the stable ID', async () => {
    const m = await addMember({ displayName: 'Alice' }, db);
    const s = await completeSurvey(m.id, { 'tuna-canned': 5 });
    await updateMember(m.id, { displayName: 'Alicia' }, db);
    expect((await latestSubmittedSurvey(m.id, db))?.id).toBe(s.id);
  });
});

describe('survey versioning', () => {
  it('locks submitted surveys and keeps previous versions as superseded', async () => {
    const m = await addMember({ displayName: 'Eve' }, db);
    const v1 = await completeSurvey(m.id, { 'tuna-canned': 3 });
    await expect(saveAnswer(v1.id, 'tuna-canned', 5, {}, db)).rejects.toThrow(/locked/);
    const v2 = await completeSurvey(m.id, { 'tuna-canned': 5 });
    expect(v2.version).toBe(2);
    expect((await db.surveys.get(v1.id))?.status).toBe('superseded');
    expect((await latestSubmittedSurvey(m.id, db))?.id).toBe(v2.id);
  });

  it('flags the latest survey as needing refresh when a restriction is added', async () => {
    const m = await addMember({ displayName: 'Alice' }, db);
    await completeSurvey(m.id, { 'peanut-butter': 5 });
    await addRestriction({ memberId: m.id, type: 'allergy', subject: 'peanut', severity: 'severe', verifiedAt: new Date().toISOString() }, db);
    expect((await latestSubmittedSurvey(m.id, db))?.needsRefresh).toBe(true);
  });
});

describe('catalog upgrade', () => {
  it('refreshes unedited seed entries with carbs but never overwrites admin edits', async () => {
    // Simulate an older install: carbs missing, one entry edited by admin, catalog version 1.
    await db.foods.update('white-rice', { nutrition: { servingDesc: '1/4 cup dry', caloriesPerServing: 160 } });
    await db.foods.update('tuna-canned', { name: 'Our tuna', revision: 2, nutrition: { servingDesc: '2 oz', caloriesPerServing: 60 } });
    await db.foods.delete('glucose-tabs');
    await db.meta.put({ key: 'catalogVersion', value: 1 });

    await ensureInitialized(db);
    expect((await db.foods.get('white-rice'))?.nutrition.carbsG).toBe(36);
    expect((await db.foods.get('tuna-canned'))?.name).toBe('Our tuna');
    expect((await db.foods.get('glucose-tabs'))?.tags).toContain('rapid-carb');
  });
  it('retires untouched freeze-dried meal entries replaced by generic cans, but keeps admin-edited ones', async () => {
    const seed = buildSeedCatalog()[0];
    await db.foods.bulkPut([
      { ...seed, id: 'fd-chili', name: 'Freeze-dried chili / beef meal', revision: 1, active: true },
      { ...seed, id: 'fd-chicken-rice', name: 'Our chicken & rice', revision: 2, active: true },
    ]);
    await db.meta.put({ key: 'catalogVersion', value: 5 });
    await ensureInitialized(db);
    expect((await db.foods.get('fd-chili'))?.active).toBe(false);
    expect((await db.foods.get('fd-chicken-rice'))?.active).toBe(true);
    expect((await db.foods.get('fd-entree'))?.active).toBe(true);
  });
  it('every seed entry has a carb estimate', () => {
    expect(buildSeedCatalog().filter((f) => f.nutrition.carbsG === undefined).map((f) => f.id)).toEqual([]);
  });
});

describe('multiple restrictions, needs and conditions', () => {
  it('adds several restrictions at once and skips duplicates', async () => {
    const m = await addMember({ displayName: 'Sam' }, db);
    const r1 = await addRestrictions(m.id, ['peanut', 'tree-nut', 'sesame'], { type: 'allergy' }, db);
    expect(r1.added).toHaveLength(3);
    const r2 = await addRestrictions(m.id, ['peanut', 'food:mushrooms'], { type: 'allergy' }, db);
    expect(r2.added.map((r) => r.subject)).toEqual(['food:mushrooms']);
    expect(r2.skipped).toEqual(['peanut']);
  });

  it('stores multiple needs and conditions per member and moves them on merge', async () => {
    const a = await addMember({ displayName: 'Sam' }, db);
    const dup = await addMember({ displayName: 'Sam (dup)' }, db);
    await addNeed({ memberId: a.id, domain: 'food', kind: 'rapid-carbs', params: { servingsPerDay: 3 }, confirmed: false }, db);
    await addNeed({ memberId: a.id, domain: 'food', kind: 'carb-counting', params: {}, confirmed: true }, db);
    await addNeed({ memberId: dup.id, domain: 'food', kind: 'other-food', params: {}, confirmed: true }, db);
    await addCondition(a.id, { iv: 'x', ct: 'y' }, db);
    await addCondition(dup.id, { iv: 'x', ct: 'z' }, db);
    await mergeMembers(a.id, dup.id, db);
    expect(await db.needs.where('memberId').equals(a.id).count()).toBe(3);
    expect(await db.conditions.where('memberId').equals(a.id).count()).toBe(2);
  });
});

describe('DB v1 → v2 upgrade', () => {
  it('converts old single health-needs fields into need and condition records', async () => {
    const name = `test-${uid()}`;
    const { default: Dexie } = await import('dexie');
    const v1 = new Dexie(name);
    v1.version(1).stores({ members: 'id, householdId, status' });
    await v1.table('members').add({
      id: 'z', householdId: 'h', displayName: 'Sam', status: 'active', createdAt: '', updatedAt: '',
      planningProfile: { presence: 'usually-present', healthNeeds: { rapidCarbs: { enabled: true, servingsPerDay: 4, confirmed: true }, carbCounting: true } },
      conditionLabelEnc: { iv: 'a', ct: 'b' },
    });
    v1.close();

    const v2 = new PlannerDB(name);
    const needs = await v2.needs.where('memberId').equals('z').toArray();
    expect(needs.map((n) => n.kind).sort()).toEqual(['carb-counting', 'rapid-carbs']);
    expect(needs.find((n) => n.kind === 'rapid-carbs')?.params.servingsPerDay).toBe(4);
    expect(await v2.conditions.where('memberId').equals('z').count()).toBe(1);
    const z = await v2.members.get('z');
    expect(z?.planningProfile.healthNeeds).toBeUndefined();
    expect(z?.conditionLabelEnc).toBeUndefined();
  });
});
