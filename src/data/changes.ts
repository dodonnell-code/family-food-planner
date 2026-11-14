// Reviewable change records: before/after, read/unread, approve/deny.
// Deny reverts the change — but only if nothing changed the same fields since,
// otherwise it refuses rather than overwrite newer data.
import { audit, db as defaultDb, now, uid, type PlannerDB } from './db';
import type { ChangeEntity, ChangeOp, ChangeRecord, ID, MemberRestriction } from '../domain/types';

const IGNORED = new Set(['updatedAt', 'id', 'createdAt', 'memberId', 'householdId']);

/** Pick only the given keys (dropping bookkeeping fields). */
export function pick(obj: object | undefined, keys: string[]): Record<string, unknown> {
  const o = (obj ?? {}) as Record<string, unknown>;
  return Object.fromEntries(keys.filter((k) => !IGNORED.has(k)).map((k) => [k, o[k]]));
}

/** Strictly increasing timestamps so changes made in the same millisecond keep their order. */
let lastTs = 0;
function monotonicNow(): string {
  lastTs = Math.max(Date.now(), lastTs + 1);
  return new Date(lastTs).toISOString();
}

export async function recordChange(
  database: PlannerDB,
  rec: { entity: ChangeEntity; entityId: ID; memberId?: ID; op: ChangeOp; before?: Record<string, unknown>; after?: Record<string, unknown>; source?: 'admin' | 'respondent'; reversible?: boolean },
): Promise<ChangeRecord> {
  const c: ChangeRecord = {
    id: uid(),
    timestamp: monotonicNow(),
    source: 'admin',
    status: 'pending',
    reversible: rec.op !== 'submit' && rec.op !== 'merge',
    ...rec,
  };
  // Drop no-op updates (nothing actually changed).
  if (c.op === 'update' && c.before && c.after && same(c.before, c.after)) return c;
  await database.changes.add(c);
  return c;
}

const same = (a: unknown, b: unknown) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
function normalize(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.map(normalize);
  if (typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([, x]) => x !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => [k, normalize(x)]),
    );
  }
  return v;
}

export async function markRead(ids: ID[], database: PlannerDB = defaultDb) {
  const ts = now();
  await database.changes.where('id').anyOf(ids).filter((c) => !c.readAt).modify({ readAt: ts });
}

export async function markAllRead(database: PlannerDB = defaultDb) {
  const ts = now();
  await database.changes.filter((c) => !c.readAt).modify({ readAt: ts });
}

export class ChangeConflictError extends Error {}

const TABLE: Record<ChangeEntity, 'members' | 'restrictions' | 'needs' | 'conditions' | 'surveys'> = {
  member: 'members', restriction: 'restrictions', need: 'needs', condition: 'conditions', survey: 'surveys',
};

/** Approve (keep), acknowledge (non-reversible info), or deny (revert). */
export async function decideChange(id: ID, decision: 'approve' | 'deny' | 'acknowledge', database: PlannerDB = defaultDb) {
  await database.transaction('rw', [database.changes, database.members, database.restrictions, database.needs, database.conditions, database.surveys, database.audit], async () => {
    const c = await database.changes.get(id);
    if (!c) throw new Error('Change not found');
    if (c.status !== 'pending') throw new Error('This change was already decided');
    const ts = now();

    if (c.source === 'respondent') {
      // Suggestions were never applied: approve applies them, deny simply declines.
      if (decision === 'approve') await applySuggestion(c, database, ts);
      await audit(`suggestion.${decision}`, { changeId: c.id, entityId: c.entityId }, `${c.entity}.${c.op}`, database);
    } else if (decision === 'deny') {
      if (!c.reversible) throw new Error('This change cannot be undone');
      const table = database[TABLE[c.entity]] as unknown as import('dexie').Table<Record<string, unknown>, string>;
      const current = await table.get(c.entityId);
      if (!current) throw new ChangeConflictError('The record no longer exists.');
      // For a creation, only its active/status matters; otherwise every touched field.
      const keys = c.op === 'create' ? [c.entity === 'member' ? 'status' : 'active'] : Object.keys({ ...c.before, ...c.after });
      // Conflict check: the touched fields must still hold the "after" values.
      if (!same(pick(current, keys), pick(c.after, keys))) {
        throw new ChangeConflictError('This was changed again afterwards, so it can no longer be undone automatically. Deny or edit the newer change instead.');
      }
      let restore: Record<string, unknown>;
      if (c.op === 'create') {
        // Never delete: members are archived, everything else deactivated.
        restore = c.entity === 'member' ? { status: 'archived', leftAt: ts } : { active: false };
      } else {
        restore = { ...c.before };
      }
      // Dexie removes a property when updated with undefined.
      await table.update(c.entityId, { ...restore, ...(c.entity === 'member' || c.entity === 'need' ? { updatedAt: ts } : {}) });
      await audit('change.deny', { changeId: c.id, entityId: c.entityId }, `${c.entity}.${c.op}`, database);
    } else {
      await audit(`change.${decision}`, { changeId: c.id, entityId: c.entityId }, `${c.entity}.${c.op}`, database);
    }

    await database.changes.update(c.id, {
      status: decision === 'deny' ? 'denied' : decision === 'acknowledge' ? 'acknowledged' : 'approved',
      decidedAt: ts,
      readAt: c.readAt ?? ts,
    });
  });
}

async function applySuggestion(c: ChangeRecord, database: PlannerDB, ts: string) {
  const a = c.after ?? {};
  if (c.entity === 'member' && c.op === 'update') {
    await database.members.update(c.entityId, { preferredName: a.preferredName as string, updatedAt: ts });
  } else if (c.entity === 'restriction' && c.op === 'deactivate') {
    const r = await database.restrictions.get(c.entityId);
    if (r?.active) await database.restrictions.update(c.entityId, { active: false });
  } else if (c.entity === 'restriction' && c.op === 'create') {
    if (!(await database.restrictions.get(c.entityId))) {
      await database.restrictions.add({
        id: c.entityId, memberId: c.memberId!, type: a.type as MemberRestriction['type'], subject: a.subject as string,
        // Approved by the admin, so it counts as confirmed.
        verifiedAt: ts, cautionCrossContact: a.type === 'allergy', active: true, createdAt: ts,
      });
    }
  } else {
    throw new Error(`Unsupported suggestion: ${c.entity}.${c.op}`);
  }
}

/** Approve every pending reversible change and acknowledge the rest. */
export async function approveAll(database: PlannerDB = defaultDb) {
  const pending = await database.changes.where('status').equals('pending').toArray();
  for (const c of pending) await decideChange(c.id, c.reversible ? 'approve' : 'acknowledge', database);
}
