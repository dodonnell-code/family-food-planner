// Human-readable titles and before/after rows for ChangeRecords.
import { needKind } from './needs';
import { RESTRICTION_TYPES, subjectLabel } from '../app/ui';
import type { ChangeRecord, EncryptedBlob, Member, MemberNeed, MemberRestriction } from './types';

export interface Lookups {
  members: Map<string, Member>;
  restrictions: Map<string, MemberRestriction>;
  needs: Map<string, MemberNeed>;
  foods?: Map<string, { name: string }>;
}

const fname = (m?: Pick<Member, 'displayName' | 'preferredName'>) => (m ? m.preferredName || m.displayName.split(/\s+/)[0] : 'Someone');

export function changeTitle(c: ChangeRecord, l: Lookups): string {
  const who = fname(l.members.get(c.memberId ?? ''));
  const r = l.restrictions.get(c.entityId);
  const n = l.needs.get(c.entityId);
  const needLabel = needKind(n?.kind ?? (c.after?.kind as string) ?? '')?.label ?? 'need';
  const restr = subjectLabel(r?.subject ?? (c.after?.subject as string) ?? '');
  const isDislike = (r?.type ?? c.after?.type) === 'dislike';
  switch (`${c.entity}.${c.op}`) {
    case 'member.create': return `${who} was added`;
    case 'member.update': return c.source === 'respondent' ? `${who} suggests a profile change` : `${who}'s profile changed`;
    case 'member.status': return `${who} was ${({ active: 'reactivated', inactive: 'marked inactive', archived: 'archived' } as Record<string, string>)[c.after?.status as string] ?? 'updated'}`;
    case 'member.merge': return `"${c.before?.displayName ?? 'A duplicate'}" was merged into ${who}`;
    case 'restriction.create':
      if (isDislike) return c.source === 'respondent' ? `${who} says they don’t like ${restr}` : `${who}: doesn’t like ${restr}`;
      return c.source === 'respondent' ? `${who} suggests a restriction: ${restr}` : `${who}: ${restr} restriction added`;
    case 'restriction.deactivate':
      if (isDislike) return c.source === 'respondent' ? `${who} asks to remove ${restr} from their dislikes` : `${who}: ${restr} removed from dislikes`;
      return c.source === 'respondent' ? `${who} asks to remove the ${restr} restriction` : `${who}: ${restr} restriction removed`;
    case 'restriction.update': return `${who}: ${restr} restriction changed`;
    case 'need.create': return `${who}: "${needLabel}" added`;
    case 'need.update': return `${who}: "${needLabel}" changed`;
    case 'need.deactivate': return `${who}: "${needLabel}" removed`;
    case 'condition.create': return `${who}: a health condition was added`;
    case 'condition.deactivate': return `${who}: a health condition was removed`;
    case 'survey.update': {
      const b = (c.before?.ignoredRefusals as string[] | undefined) ?? [];
      const a = (c.after?.ignoredRefusals as string[] | undefined) ?? [];
      const added = a.filter((x) => !b.includes(x));
      const removed = b.filter((x) => !a.includes(x));
      const nm = (id?: string) => l.foods?.get(id ?? '')?.name ?? 'a food';
      if (added.length) return `${who}: stopped applying survey refusal of ${nm(added[0])}`;
      if (removed.length) return `${who}: survey refusal of ${nm(removed[0])} applies again`;
      return `${who}: survey settings changed`;
    }
    case 'survey.submit': return `${who} submitted survey version ${c.after?.version ?? ''}`.trim();
    default: return `${who}: ${c.entity} ${c.op}`;
  }
}

// ---------- Before/after rows ----------
export type DisplayValue = { kind: 'text'; text: string } | { kind: 'encrypted'; blob: EncryptedBlob; json?: boolean };

export interface DiffRow {
  label: string;
  before: DisplayValue;
  after: DisplayValue;
}

const LABELS: Record<string, string> = {
  displayName: 'Display name', preferredName: 'Preferred name', color: 'Profile color', status: 'Status', leftAt: 'Left on',
  'planningProfile.ageBand': 'Age band', 'planningProfile.dailyCalorieGoal': 'Daily calorie goal', 'planningProfile.presence': 'Presence',
  'planningProfile.guestFrom': 'Guest from', 'planningProfile.guestUntil': 'Guest until', 'planningProfile.canPrepareFood': 'Can prepare food',
  'planningProfile.portionFactor': 'Portion size', privateNotesEnc: 'Private notes',
  type: 'Type', subject: 'Applies to', severity: 'Severity', cautionCrossContact: 'Cross-contact concern', verifiedAt: 'Admin-confirmed',
  adminNoteEnc: 'Note', active: 'Active', kind: 'Need', confirmed: 'Amount confirmed', detailsEnc: 'Details', labelEnc: 'Condition',
  version: 'Survey version', mergedInto: 'Merged into', reason: 'Reason given', refuses: 'Foods they would refuse',
  ignoredRefusals: 'Survey refusals not applied',
};

const isBlob = (v: unknown): v is EncryptedBlob => !!v && typeof v === 'object' && 'iv' in (v as object) && 'ct' in (v as object);

function fmt(key: string, v: unknown, l: Lookups): DisplayValue {
  if (isBlob(v)) return { kind: 'encrypted', blob: v, json: key === 'detailsEnc' };
  if (v === undefined || v === null || v === '') return { kind: 'text', text: 'not set' };
  if (key === 'verifiedAt') return { kind: 'text', text: 'Yes' };
  if (typeof v === 'boolean') return { kind: 'text', text: v ? 'Yes' : 'No' };
  if (key === 'subject') return { kind: 'text', text: subjectLabel(String(v)) };
  if (key === 'type') return { kind: 'text', text: RESTRICTION_TYPES.find((t) => t.code === v)?.label ?? String(v) };
  if (key === 'kind') return { kind: 'text', text: needKind(String(v))?.label ?? String(v) };
  if (key === 'ignoredRefusals' && Array.isArray(v)) return { kind: 'text', text: v.length ? v.map((id) => l.foods?.get(String(id))?.name ?? String(id)).join(', ') : 'none' };
  if (Array.isArray(v)) return { kind: 'text', text: v.length ? v.join(', ') : 'none' };
  if (key === 'mergedInto') return { kind: 'text', text: fname(l.members.get(String(v))) };
  if (key === 'leftAt' || key.endsWith('guestFrom') || key.endsWith('guestUntil')) return { kind: 'text', text: new Date(String(v)).toLocaleDateString() };
  if (key === 'planningProfile.presence') return { kind: 'text', text: String(v).replace(/-/g, ' ') };
  if (key === 'planningProfile.dailyCalorieGoal') return { kind: 'text', text: `${Number(v).toLocaleString()} kcal` };
  return { kind: 'text', text: typeof v === 'object' ? JSON.stringify(v) : String(v) };
}

/** Flatten one level for nested objects we know about (planningProfile, params). */
function flatten(obj: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj ?? {})) {
    if (k === 'planningProfile' && v && typeof v === 'object') {
      for (const [k2, v2] of Object.entries(v)) out[`planningProfile.${k2}`] = v2;
    } else if (k === 'params' && v && typeof v === 'object') {
      for (const [k2, v2] of Object.entries(v)) out[`params.${k2}`] = v2;
    } else out[k] = v;
  }
  return out;
}

export function diffRows(c: ChangeRecord, l: Lookups): DiffRow[] {
  const b = flatten(c.before);
  const a = flatten(c.after);
  const kind = (c.after?.kind as string) ?? l.needs.get(c.entityId)?.kind;
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  const rows: DiffRow[] = [];
  for (const k of keys) {
    if (c.op !== 'create' && JSON.stringify(b[k]) === JSON.stringify(a[k])) continue; // unchanged
    if (c.op === 'create' && (a[k] === undefined || k === 'active' || k === 'status')) continue;
    const label = k.startsWith('params.')
      ? needKind(kind ?? '')?.params?.find((p) => p.key === k.slice(7))?.label ?? k.slice(7)
      : LABELS[k] ?? k;
    rows.push({
      label,
      before: c.op === 'create' ? { kind: 'text', text: '—' } : fmt(k, b[k], l),
      after: fmt(k, a[k], l),
    });
  }
  return rows;
}
