// "What needs to change" — computed live from the data, so items clear once resolved.
// Each check is a small function; future domains (medical, equipment) and later phases
// (respondent suggestions, plan impact) add checks here.
import { db as defaultDb, type PlannerDB } from '../data/db';
import { needKind } from './needs';
import { subjectLabel } from '../app/ui';
import type { AuditEvent, Member } from './types';

export type AttentionSeverity = 'high' | 'medium' | 'low';

export interface AttentionItem {
  id: string;
  severity: AttentionSeverity;
  title: string;
  detail?: string;
  memberId?: string;
  /** In-app route to resolve it. */
  link?: string;
  action?: 'start-survey';
}

const fname = (m?: Pick<Member, 'displayName' | 'preferredName'>) => (m ? m.preferredName || m.displayName.split(/\s+/)[0] : 'Someone');

export async function computeAttention(database: PlannerDB = defaultDb): Promise<AttentionItem[]> {
  const [members, surveys, restrictions, needs, household] = await Promise.all([
    database.members.toArray(),
    database.surveys.toArray(),
    database.restrictions.filter((r) => r.active).toArray(),
    database.needs.filter((n) => n.active).toArray(),
    database.households.toCollection().first(),
  ]);
  const active = members.filter((m) => m.status === 'active');
  const activeIds = new Set(active.map((m) => m.id));
  const byId = new Map(members.map((m) => [m.id, m]));
  const items: AttentionItem[] = [];

  for (const m of active) {
    const mine = surveys.filter((s) => s.memberId === m.id);
    const latest = mine.filter((s) => s.status === 'submitted').sort((a, b) => b.version - a.version)[0];
    const inProgress = mine.find((s) => s.status === 'in-progress');
    if (!latest && !inProgress) {
      items.push({ id: `nosurvey:${m.id}`, severity: 'high', memberId: m.id, action: 'start-survey', link: `/admin/members/${m.id}`,
        title: `${fname(m)} hasn't taken the survey`, detail: 'Their preferences are unknown, so the plan can only use safe defaults for them.' });
    } else if (!latest && inProgress) {
      items.push({ id: `inprogress:${m.id}`, severity: 'medium', memberId: m.id, link: `/admin/members/${m.id}`,
        title: `${fname(m)}'s survey is unfinished`, detail: 'They can continue it from the welcome screen.' });
    } else if (latest?.needsRefresh && !inProgress) {
      items.push({ id: `refresh:${m.id}`, severity: 'medium', memberId: m.id, action: 'start-survey', link: `/admin/members/${m.id}`,
        title: `${fname(m)}'s survey may be outdated`, detail: 'Their restrictions or membership changed after they last took it. Consider a retake.' });
    }
  }

  for (const r of restrictions) {
    if (!activeIds.has(r.memberId) || r.verifiedAt) continue;
    items.push({ id: `unverified:${r.id}`, severity: 'high', memberId: r.memberId, link: `/admin/members/${r.memberId}`,
      title: `Confirm a restriction for ${fname(byId.get(r.memberId))}`, detail: 'Unconfirmed restrictions are still enforced, but should be checked.' });
  }

  for (const n of needs) {
    if (!activeIds.has(n.memberId) || n.confirmed) continue;
    items.push({ id: `placeholder:${n.id}`, severity: 'high', memberId: n.memberId, link: `/admin/members/${n.memberId}`,
      title: `Set the amount for "${needKind(n.kind)?.label ?? n.kind}" for ${fname(byId.get(n.memberId))}`,
      detail: 'It is using a placeholder number, not one from their care plan.' });
  }

  const guestsEnded = active.filter((m) => m.planningProfile.presence === 'temporary-guest' && m.planningProfile.guestUntil && m.planningProfile.guestUntil < new Date().toISOString().slice(0, 10));
  for (const m of guestsEnded) {
    items.push({ id: `guest:${m.id}`, severity: 'low', memberId: m.id, link: `/admin/members/${m.id}`,
      title: `${fname(m)}'s guest dates have ended`, detail: 'They are no longer counted for current dates. Mark inactive or update their dates.' });
  }

  const last = household?.settings.lastBackupAt;
  const days = household?.settings.backupReminderDays ?? 14;
  if (active.length > 0 && (!last || Date.now() - Date.parse(last) > days * 86_400_000)) {
    items.push({ id: 'backup', severity: 'medium', title: last ? 'Backup overdue' : 'No backup yet',
      detail: 'iPad browser storage can be cleared. Make an encrypted backup (available in a later phase).' });
  }

  const order: Record<AttentionSeverity, number> = { high: 0, medium: 1, low: 2 };
  return items.sort((a, b) => order[a.severity] - order[b.severity]);
}

// ---------- Changes since the last plan ----------
export interface ChangeEntry {
  id: string;
  timestamp: string;
  text: string;
  memberId?: string;
}

/** Audit events that affect planning, rendered as plain sentences. Sensitive values (condition names, notes) are never shown. */
export async function changesSinceLastPlan(database: PlannerDB = defaultDb): Promise<{ since?: string; changes: ChangeEntry[] }> {
  const lastSnap = (await database.snapshots.orderBy('createdAt').last())?.createdAt;
  const events = await database.audit.where('timestamp').above(lastSnap ?? '').toArray();
  const [members, restrictions, needs] = await Promise.all([database.members.toArray(), database.restrictions.toArray(), database.needs.toArray()]);
  const mById = new Map(members.map((m) => [m.id, m]));
  const rById = new Map(restrictions.map((r) => [r.id, r]));
  const nById = new Map(needs.map((n) => [n.id, n]));

  const describe = (e: AuditEvent): { text: string; memberId?: string } | null => {
    const memberId = (e.refs.memberId as string | undefined)
      ?? rById.get(e.refs.restrictionId as string)?.memberId
      ?? nById.get(e.refs.needId as string)?.memberId;
    const who = fname(mById.get(memberId ?? ''));
    switch (e.action) {
      case 'member.add': return { text: `${who} was added`, memberId };
      case 'member.status.active': return { text: `${who} was reactivated`, memberId };
      case 'member.status.inactive': return { text: `${who} was marked inactive`, memberId };
      case 'member.status.archived': return { text: `${who} was archived`, memberId };
      case 'member.merge': return { text: `A duplicate profile was merged into ${fname(mById.get(e.refs.intoId as string))}`, memberId: e.refs.intoId as string };
      case 'member.update': return /planningProfile/.test(e.detail ?? '') ? { text: `${who}'s planning details changed`, memberId } : null;
      case 'restriction.add': return { text: `${who}: ${subjectLabel(e.detail ?? rById.get(e.refs.restrictionId as string)?.subject ?? '')} restriction added`, memberId };
      case 'restriction.deactivate': return { text: `${who}: ${subjectLabel(rById.get(e.refs.restrictionId as string)?.subject ?? '')} restriction removed`, memberId };
      case 'need.add': return { text: `${who}: "${needKind((e.detail ?? '').split(':')[1] ?? '')?.label ?? 'need'}" added`, memberId };
      case 'need.update': return { text: `${who}: "${needKind(nById.get(e.refs.needId as string)?.kind ?? '')?.label ?? 'need'}" updated`, memberId };
      case 'need.deactivate': return { text: `${who}: "${needKind(nById.get(e.refs.needId as string)?.kind ?? '')?.label ?? 'need'}" removed`, memberId };
      case 'condition.add': return { text: `${who}: a health condition was added`, memberId };
      case 'condition.deactivate': return { text: `${who}: a health condition was removed`, memberId };
      case 'survey.submit': return { text: `${who} submitted a survey`, memberId };
      default: return null;
    }
  };

  const changes = events
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .flatMap((e) => {
      const d = describe(e);
      return d ? [{ id: e.id, timestamp: e.timestamp, ...d }] : [];
    });
  return { since: lastSnap, changes };
}
