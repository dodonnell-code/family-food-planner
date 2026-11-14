import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { PlannerDB, uid } from './db';
import {
  addMember,
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
