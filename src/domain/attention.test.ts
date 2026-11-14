import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { PlannerDB, uid } from '../data/db';
import { addMember, addNeed, addRestrictions, ensureInitialized, saveAnswer, setMemberStatus, startOrResumeSurvey, submitSurvey } from '../data/repo';
import { changesSinceLastPlan, computeAttention } from './attention';

let db: PlannerDB;
beforeEach(async () => {
  db = new PlannerDB(`test-${uid()}`);
  await ensureInitialized(db);
});

describe('needs attention', () => {
  it('flags missing surveys, placeholders, unconfirmed restrictions and outdated surveys; clears when resolved', async () => {
    const z = await addMember({ displayName: 'Sam' }, db);
    await addNeed({ memberId: z.id, domain: 'food', kind: 'rapid-carbs', params: { servingsPerDay: 3 }, confirmed: false }, db);
    await addRestrictions(z.id, ['peanut'], { type: 'allergy' }, db); // unconfirmed
    let ids = (await computeAttention(db)).map((i) => i.id.split(':')[0]);
    expect(ids).toEqual(expect.arrayContaining(['nosurvey', 'placeholder', 'unverified', 'backup']));

    const s = await startOrResumeSurvey(z.id, db);
    await saveAnswer(s.id, 'tuna-canned', 4, {}, db);
    await submitSurvey(s.id, db);
    ids = (await computeAttention(db)).map((i) => i.id.split(':')[0]);
    expect(ids).not.toContain('nosurvey');

    await addRestrictions(z.id, ['sesame'], { type: 'allergy', verifiedAt: new Date().toISOString() }, db);
    ids = (await computeAttention(db)).map((i) => i.id.split(':')[0]);
    expect(ids).toContain('refresh');
  });

  it('ignores archived members', async () => {
    const c = await addMember({ displayName: 'Charlie' }, db);
    await setMemberStatus(c.id, 'archived', db);
    expect((await computeAttention(db)).filter((i) => i.memberId === c.id)).toEqual([]);
  });
});

describe('changes since last plan', () => {
  it('describes planning-relevant changes in plain language without sensitive values', async () => {
    const z = await addMember({ displayName: 'Sam' }, db);
    await addRestrictions(z.id, ['peanut'], { type: 'allergy' }, db);
    await addNeed({ memberId: z.id, domain: 'food', kind: 'carb-counting', params: {}, confirmed: true }, db);
    const texts = (await changesSinceLastPlan(db)).changes.map((c) => c.text);
    expect(texts).toEqual(expect.arrayContaining(['Sam was added', 'Sam: Peanut restriction added', 'Sam: "Carb counts for meals" added']));
  });

  it('only lists changes after the latest plan snapshot', async () => {
    await addMember({ displayName: 'Alice' }, db);
    await new Promise((r) => setTimeout(r, 5));
    await db.snapshots.add({ id: uid(), scenarioId: 's', engineVersion: '0', catalogVersion: 2, sourceSurveyIds: [], results: {}, warnings: [], createdAt: new Date().toISOString() });
    await new Promise((r) => setTimeout(r, 5));
    await addMember({ displayName: 'Bob' }, db);
    expect((await changesSinceLastPlan(db)).changes.map((c) => c.text)).toEqual(['Bob was added']);
  });
});
