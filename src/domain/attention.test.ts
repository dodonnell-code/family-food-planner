import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { PlannerDB, uid } from '../data/db';
import { addMember, addNeed, addRestrictions, ensureInitialized, saveAnswer, setMemberStatus, startOrResumeSurvey, submitSurvey } from '../data/repo';
import { attentionByPage, computeAttention } from './attention';

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
    await saveAnswer(s.id, 'canned-fish', 4, {}, db);
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

describe('dislikes in attention', () => {
  it('never asks to confirm a dislike', async () => {
    const m = await addMember({ displayName: 'Sam' }, db);
    await addRestrictions(m.id, ['food:olives'], { type: 'dislike' }, db); // no verifiedAt
    expect((await computeAttention(db)).some((i) => i.id.startsWith('unverified'))).toBe(false);
  });
});

describe('menu badges', () => {
  it('counts what needs a look on each page, using each item’s full count', () => {
    expect(attentionByPage([
      { id: 'a', severity: 'high', title: '', link: '/admin/members/m1' },
      { id: 'b', severity: 'high', title: '', link: '/admin/members/m2' },
      { id: 'c', severity: 'low', title: '', link: '/admin/inventory', count: 3 },
      { id: 'd', severity: 'medium', title: '', link: '/admin/review#changes', count: 2 },
      { id: 'e', severity: 'medium', title: '', link: '/admin/backup' },
      { id: 'f', severity: 'low', title: '' },
    ])).toEqual({ '/admin/members': 2, '/admin/inventory': 3, '/admin/review': 2, '/admin/backup': 1 });
  });
});
