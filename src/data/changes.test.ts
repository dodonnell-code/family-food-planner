import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { PlannerDB, uid } from './db';
import { addMember, addNeed, addRestrictions, deactivateRestriction, ensureInitialized, setMemberStatus, startOrResumeSurvey, submitSurvey, updateMember, updateNeed } from './repo';
import { approveAll, ChangeConflictError, decideChange, markAllRead, markRead } from './changes';
import { diffRows, type Lookups } from '../domain/changeView';

let db: PlannerDB;
beforeEach(async () => {
  db = new PlannerDB(`test-${uid()}`);
  await ensureInitialized(db);
});

const pending = () => db.changes.where('status').equals('pending').toArray();
const latest = async () => (await db.changes.orderBy('timestamp').toArray()).at(-1)!;
const lookups = async (): Promise<Lookups> => ({
  members: new Map((await db.members.toArray()).map((m) => [m.id, m])),
  restrictions: new Map((await db.restrictions.toArray()).map((r) => [r.id, r])),
  needs: new Map((await db.needs.toArray()).map((n) => [n.id, n])),
});

describe('change records', () => {
  it('records before/after for a profile edit and shows only changed fields', async () => {
    const m = await addMember({ displayName: 'Sam' }, db);
    await updateMember(m.id, { planningProfile: { ...m.planningProfile, dailyCalorieGoal: 1800 } }, db);
    const c = await latest();
    expect(c.op).toBe('update');
    const rows = diffRows(c, await lookups());
    expect(rows).toEqual([{ label: 'Daily calorie goal', before: { kind: 'text', text: 'not set' }, after: { kind: 'text', text: '1,800 kcal' } }]);
  });

  it('skips no-op edits', async () => {
    const m = await addMember({ displayName: 'Sam' }, db);
    const n = (await db.changes.count());
    await updateMember(m.id, { displayName: 'Sam' }, db);
    expect(await db.changes.count()).toBe(n);
  });

  it('shows need parameter labels', async () => {
    const m = await addMember({ displayName: 'Sam' }, db);
    const need = await addNeed({ memberId: m.id, domain: 'food', kind: 'rapid-carbs', params: { servingsPerDay: 3 }, confirmed: false }, db);
    await updateNeed(need.id, { params: { servingsPerDay: 4 }, confirmed: true }, db);
    const rows = diffRows(await latest(), await lookups());
    expect(rows.map((r) => [r.label, r.before, r.after])).toEqual([
      ['Servings to reserve per day', { kind: 'text', text: '3' }, { kind: 'text', text: '4' }],
      ['Amount confirmed', { kind: 'text', text: 'No' }, { kind: 'text', text: 'Yes' }],
    ]);
  });
});

describe('deny reverts', () => {
  it('a profile edit', async () => {
    const m = await addMember({ displayName: 'Sam' }, db);
    await updateMember(m.id, { displayName: 'Z', preferredName: 'Zee' }, db);
    await decideChange((await latest()).id, 'deny', db);
    const after = await db.members.get(m.id);
    expect(after?.displayName).toBe('Sam');
    expect(after?.preferredName).toBeUndefined();
    expect((await db.changes.get((await latest()).id))?.status).toBe('denied');
  });

  it('an added member is archived, never deleted', async () => {
    const m = await addMember({ displayName: 'Charlie' }, db);
    await decideChange((await latest()).id, 'deny', db);
    expect((await db.members.get(m.id))?.status).toBe('archived');
  });

  it('an added restriction is deactivated; a removed one is reactivated', async () => {
    const m = await addMember({ displayName: 'Sam' }, db);
    const { added } = await addRestrictions(m.id, ['peanut'], { type: 'allergy' }, db);
    await decideChange((await latest()).id, 'deny', db);
    expect((await db.restrictions.get(added[0].id))?.active).toBe(false);

    const { added: [r2] } = await addRestrictions(m.id, ['sesame'], { type: 'allergy' }, db);
    await deactivateRestriction(r2.id, db);
    await decideChange((await latest()).id, 'deny', db);
    expect((await db.restrictions.get(r2.id))?.active).toBe(true);
  });

  it('a status change', async () => {
    const m = await addMember({ displayName: 'Bob' }, db);
    await setMemberStatus(m.id, 'archived', db);
    await decideChange((await latest()).id, 'deny', db);
    const b = await db.members.get(m.id);
    expect(b?.status).toBe('active');
    expect(b?.leftAt).toBeUndefined();
  });

  it('refuses to undo when the same field changed again later', async () => {
    const m = await addMember({ displayName: 'Sam' }, db);
    await updateMember(m.id, { displayName: 'Z1' }, db);
    await updateMember(m.id, { displayName: 'Z2' }, db);
    const first = (await db.changes.toArray()).find((c) => c.after?.displayName === 'Z1')!;
    await expect(decideChange(first.id, 'deny', db)).rejects.toBeInstanceOf(ChangeConflictError);
    expect((await db.members.get(m.id))?.displayName).toBe('Z2');
    expect((await db.changes.get(first.id))?.status).toBe('pending');
  });
});

describe('approve, acknowledge, read state', () => {
  it('survey submissions can only be acknowledged', async () => {
    const m = await addMember({ displayName: 'Alice' }, db);
    const s = await startOrResumeSurvey(m.id, db);
    await submitSurvey(s.id, db);
    const c = await latest();
    expect(c.reversible).toBe(false);
    await expect(decideChange(c.id, 'deny', db)).rejects.toThrow(/cannot be undone/);
    await decideChange(c.id, 'acknowledge', db);
    expect((await db.changes.get(c.id))?.status).toBe('acknowledged');
  });

  it('tracks unread, and approve-all clears the queue', async () => {
    const m = await addMember({ displayName: 'Alice' }, db);
    await updateMember(m.id, { preferredName: 'Ali' }, db);
    const all = await pending();
    expect(all.every((c) => !c.readAt)).toBe(true);
    await markRead([all[0].id], db);
    expect((await db.changes.get(all[0].id))?.readAt).toBeDefined();
    await markAllRead(db);
    expect((await db.changes.filter((c) => !c.readAt).count())).toBe(0);
    await approveAll(db);
    expect(await pending()).toEqual([]);
  });
});

describe('respondent suggestions', () => {
  async function submitWith(memberId: string, sugs: import('../domain/types').Suggestion[], blockedFood?: string) {
    const s = await startOrResumeSurvey(memberId, db);
    if (blockedFood) {
      const { saveAnswer } = await import('./repo');
      await saveAnswer(s.id, blockedFood, 'blocked', {}, db);
    }
    const { updateSurveyProgress } = await import('./repo');
    await updateSurveyProgress(s.id, { suggestions: sugs }, db);
    await submitSurvey(s.id, db);
  }

  it('do not take effect until approved', async () => {
    const m = await addMember({ displayName: 'Sam' }, db);
    const { added: [peanut] } = await addRestrictions(m.id, ['peanut'], { type: 'allergy', verifiedAt: new Date().toISOString() }, db);
    await approveAll(db);
    await submitWith(m.id, [
      { id: 'a', kind: 'remove-restriction', restrictionId: peanut.id, reason: 'outgrew it' },
      { id: 'b', kind: 'add-restriction', restrictionType: 'cannot-eat', text: 'mushrooms, olives' },
      { id: 'c', kind: 'preferred-name', value: 'Z' },
    ], 'canned-fish');

    const sugs = (await pending()).filter((c) => c.source === 'respondent');
    expect(sugs).toHaveLength(5); // remove peanut, 2 foods, name, can't-eat tuna
    expect((await db.restrictions.get(peanut.id))?.active).toBe(true);
    expect((await db.members.get(m.id))?.preferredName).toBeUndefined();

    for (const c of sugs) await decideChange(c.id, c.op === 'deactivate' ? 'deny' : 'approve', db);
    expect((await db.restrictions.get(peanut.id))?.active).toBe(true); // declined
    expect((await db.members.get(m.id))?.preferredName).toBe('Z');
    const subjects = (await db.restrictions.where('memberId').equals(m.id).filter((r) => r.active).toArray()).map((r) => r.subject).sort();
    expect(subjects).toEqual(['food:Canned fish', 'food:mushrooms', 'food:olives', 'peanut']);
  });
});

describe('"Can’t eat it" follow-up', () => {
  it('becomes a pending restriction with the type, subject, severity and cross-contact given', async () => {
    const { saveAnswer } = await import('./repo');
    const m = await addMember({ displayName: 'Sam' }, db);
    const s = await startOrResumeSurvey(m.id, db);
    await saveAnswer(s.id, 'peanut-butter', 'blocked', { blockedInfo: { type: 'allergy', subjects: ['peanut'], severity: 'severe', crossContact: 'unsure' } }, db);
    await saveAnswer(s.id, 'shelf-milk', 'blocked', { blockedInfo: { type: 'intolerance', strictness: 'avoid' } }, db);
    await saveAnswer(s.id, 'canned-fruit', 'blocked', { blockedInfo: { type: 'texture', subjects: ['food:Pineapple'] } }, db);
    await submitSurvey(s.id, db);
    const sugs = (await pending()).filter((c) => c.source === 'respondent');
    const after = (subject: string) => sugs.find((c) => c.after?.subject === subject)?.after;
    expect(after('peanut')).toMatchObject({ type: 'allergy', severity: 'severe', cautionCrossContact: true });
    expect(String(after('peanut')?.reason)).toMatch(/Not sure about cross-contact/);
    expect(after('food:Shelf-stable milk (UHT boxes)')).toMatchObject({ type: 'intolerance', strictness: 'avoid' });
    expect(after('food:Pineapple')).toMatchObject({ type: 'texture' });

    await approveAll(db);
    const rs = await db.restrictions.where('memberId').equals(m.id).toArray();
    expect(rs.find((r) => r.subject === 'peanut')).toMatchObject({ type: 'allergy', severity: 'severe', cautionCrossContact: true });
    expect(rs.find((r) => r.subject === 'food:Shelf-stable milk (UHT boxes)')).toMatchObject({ type: 'intolerance', strictness: 'avoid' });
  });
});

describe('new survey questions', () => {
  it('offers only foods added since the last survey, keeping the other answers', async () => {
    const { saveAnswer, newSurveyQuestions } = await import('./repo');
    const m = await addMember({ displayName: 'Sam' }, db);
    const s1 = await startOrResumeSurvey(m.id, db);
    await saveAnswer(s1.id, 'white-rice', 5, {}, db);
    await submitSurvey(s1.id, db);
    expect(await newSurveyQuestions(m.id, db)).toEqual([]); // skipped questions aren't "new"

    // A survey from before condiments were added (no record of what it asked).
    await db.surveys.update(s1.id, { asked: undefined, catalogVersion: 15 });
    const fresh = await newSurveyQuestions(m.id, db);
    expect(fresh).toEqual(expect.arrayContaining(['ketchup', 'mustard', 'hot-sauce']));
    expect(fresh).not.toContain('white-rice');
    const { computeAttention } = await import('../domain/attention');
    expect((await computeAttention(db)).find((i) => i.id === `newq:${m.id}`)?.title).toMatch(/new survey questions/);

    const s2 = await startOrResumeSurvey(m.id, db, { onlyNew: true });
    expect(s2.onlyNew?.sort()).toEqual([...fresh].sort());
    expect((await db.answers.get(`${s2.id}:white-rice`))?.rating).toBe(5);
    await saveAnswer(s2.id, 'ketchup', 5, {}, db);
    await submitSurvey(s2.id, db);
    expect(await newSurveyQuestions(m.id, db)).toEqual([]);
  });
});

describe('survey refusals and never-stock answers', () => {
  it('lists refusals, can stop/restart applying one, and the change can be undone', async () => {
    const { saveAnswer, updateSurveyProgress, setRefusalIgnored } = await import('./repo');
    const { surveyRefusals } = await import('../domain/preferences');
    const m = await addMember({ displayName: 'Sam' }, db);
    const s = await startOrResumeSurvey(m.id, db);
    await saveAnswer(s.id, 'canned-fish', 1, {}, db);
    await saveAnswer(s.id, 'split-peas-dry', 1, {}, db);
    await saveAnswer(s.id, 'white-rice', 5, {}, db);
    await updateSurveyProgress(s.id, { openResponses: { neverStock: 'olives, spam.' } }, db);
    await submitSurvey(s.id, db);

    const submit = (await db.changes.toArray()).find((c) => c.op === 'submit')!;
    expect(submit.after?.refuses).toEqual(['Canned fish', 'Dry split peas']);
    const neverSugs = (await pending()).filter((c) => c.after?.type === 'dislike').map((c) => c.after?.subject).sort();
    expect(neverSugs).toEqual(['food:olives', 'food:spam']);

    expect((await surveyRefusals(m.id, db)).active.map((f) => f.id)).toEqual(['canned-fish', 'split-peas-dry']);
    await setRefusalIgnored(s.id, 'canned-fish', true, db);
    let r = await surveyRefusals(m.id, db);
    expect(r.active.map((f) => f.id)).toEqual(['split-peas-dry']);
    expect(r.ignored.map((f) => f.id)).toEqual(['canned-fish']);

    await decideChange((await latest()).id, 'deny', db); // undo the override
    r = await surveyRefusals(m.id, db);
    expect(r.active).toHaveLength(2);
  });
});
