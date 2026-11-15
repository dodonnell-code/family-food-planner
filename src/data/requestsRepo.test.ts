import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { PlannerDB, uid } from './db';
import { addMember, ensureInitialized, startOrResumeSurvey, submitSurvey, updateSurveyProgress } from './repo';
import { loadFamilyRequests, setRequestDone } from './requestsRepo';
import { matchFoods } from '../domain/requests';
import { buildSeedCatalog } from './seedCatalog';

let db: PlannerDB;
beforeEach(async () => {
  db = new PlannerDB(`test-${uid()}`);
  await ensureInitialized(db);
});

async function survey(name: string, open: { foodsToAdd?: string; comfortMeals?: string; neverStock?: string }) {
  const m = await addMember({ displayName: name }, db);
  const s = await startOrResumeSurvey(m.id, db);
  await updateSurveyProgress(s.id, { openResponses: open }, db);
  await submitSurvey(s.id, db);
  return m;
}

describe('family requests', () => {
  it('lists foods-to-add and comfort meals from submitted surveys, and tracks which are done', async () => {
    await survey('Alice', { foodsToAdd: 'Ramen noodles', comfortMeals: 'Hot cocoa and mac & cheese' });
    await survey('Dan', { neverStock: 'Sardines' });
    const { open, done } = await loadFamilyRequests(db);
    expect(open.map((q) => [q.memberName, q.kind, q.text])).toEqual([
      ['Alice', 'foodsToAdd', 'Ramen noodles'],
      ['Alice', 'comfortMeals', 'Hot cocoa and mac & cheese'],
    ]);
    expect(done).toEqual([]);

    await setRequestDone(open[1].key, true, db);
    const after = await loadFamilyRequests(db);
    expect(after.open.map((q) => q.kind)).toEqual(['foodsToAdd']);
    expect(after.done.map((q) => q.kind)).toEqual(['comfortMeals']);
    await setRequestDone(open[1].key, false, db);
    expect((await loadFamilyRequests(db)).open).toHaveLength(2);
  });

  it('ignores unfinished surveys', async () => {
    const m = await addMember({ displayName: 'Sam' }, db);
    const s = await startOrResumeSurvey(m.id, db);
    await updateSurveyProgress(s.id, { openResponses: { foodsToAdd: 'Pickles' } }, db);
    expect((await loadFamilyRequests(db)).open).toEqual([]);
  });

  it('suggests matching catalog foods', () => {
    const foods = buildSeedCatalog();
    expect(matchFoods('Hot cocoa and mac & cheese', foods).map((f) => f.id)).toEqual(expect.arrayContaining(['cocoa-mix', 'mac-cheese-cup']));
    expect(matchFoods('mashed potatoes', foods)[0].id).toBe('potato-flakes');
    expect(matchFoods('???', foods)).toEqual([]);
  });
});
