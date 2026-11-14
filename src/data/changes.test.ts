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
