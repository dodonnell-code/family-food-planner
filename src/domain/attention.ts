// "What needs to change" — computed live from the data, so items clear once resolved.
// Each check is a small function; future domains (medical, equipment) and later phases
// (respondent suggestions, plan impact) add checks here.
import { db as defaultDb, type PlannerDB } from '../data/db';
import { needKind } from './needs';
import { EXPIRING_SOON_DAYS, stockStatus } from './inventory';
import type { Member } from './types';
import { newSurveyQuestions } from '../data/repo';

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
  /** Can be dismissed as "no retake needed". */
  dismissRefresh?: boolean;
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
      items.push({ id: `refresh:${m.id}`, severity: 'medium', memberId: m.id, action: 'start-survey', dismissRefresh: true, link: `/admin/members/${m.id}`,
        title: `${fname(m)}'s survey may be outdated`, detail: latest.refreshReason ?? 'Their restrictions or membership changed after they last took it. Consider a retake.' });
    } else if (latest && !inProgress) {
      const n = (await newSurveyQuestions(m.id, database)).length;
      if (n) items.push({ id: `newq:${m.id}`, severity: 'low', memberId: m.id, action: 'start-survey', link: `/admin/members/${m.id}`,
        title: `${fname(m)} has ${n} new survey question${n === 1 ? '' : 's'}`, detail: 'Foods were added to the survey since they took it. They can answer just the new ones.' });
    }
  }

  for (const r of restrictions) {
    if (!activeIds.has(r.memberId) || r.verifiedAt || r.type === 'dislike') continue;
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

  const reviewFoods = await database.foods.filter((f) => f.active && f.needsReview).count();
  if (reviewFoods > 0) {
    items.push({ id: 'foodreview', severity: 'low', link: '/admin/catalog',
      title: `${reviewFoods} catalog food${reviewFoods === 1 ? '' : 's'} marked “needs review”`, detail: 'Check their allergens, preparation and package details.' });
  }

  const pending = await database.changes.where('status').equals('pending').toArray();
  if (pending.length > 0) {
    const unread = pending.filter((c) => !c.readAt).length;
    items.push({ id: 'changes', severity: 'medium', link: '/admin/review#changes',
      title: `${pending.length} change${pending.length === 1 ? '' : 's'} waiting for your review`,
      detail: unread ? `${unread} unread. Approve to keep, or deny to undo.` : 'Approve to keep, or deny to undo.' });
  }

  // Inventory rotation: expired or soon-to-expire stock.
  const todayIso = new Date().toISOString().slice(0, 10);
  const stock = await database.stock.toArray();
  const warnDays = household?.settings.expiryWarningDays ?? EXPIRING_SOON_DAYS;
  const expired = stock.filter((e) => stockStatus(e, todayIso, warnDays) === 'expired').length;
  const expiring = stock.filter((e) => stockStatus(e, todayIso, warnDays) === 'expiring').length;
  if (expired) items.push({ id: 'stock-expired', severity: 'medium', link: '/admin/inventory', title: `${expired} inventory item${expired === 1 ? ' is' : 's are'} past best-by`, detail: 'Replace them; they no longer count as on hand.' });
  if (expiring) items.push({ id: 'stock-expiring', severity: 'low', link: '/admin/inventory', title: `${expiring} inventory item${expiring === 1 ? '' : 's'} to use soon`, detail: `Best-by within ${warnDays} days. Use them in everyday meals and restock.` });

  const last = household?.settings.lastBackupAt;
  const days = household?.settings.backupReminderDays ?? 14;
  if (active.length > 0 && (!last || Date.now() - Date.parse(last) > days * 86_400_000)) {
    items.push({ id: 'backup', severity: 'medium', link: '/admin/backup', title: last ? 'Backup overdue' : 'No backup yet',
      detail: 'iPad browser storage can be cleared. Make an encrypted backup and keep it off the iPad.' });
  }

  const order: Record<AttentionSeverity, number> = { high: 0, medium: 1, low: 2 };
  return items.sort((a, b) => order[a.severity] - order[b.severity]);
}
