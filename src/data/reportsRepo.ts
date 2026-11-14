// Loads (and decrypts) per-person details for the Admin-only detailed report.
import { db as defaultDb, type PlannerDB } from './db';
import { decryptString } from './crypto';
import { RESTRICTION_TYPES, STRICTNESS, subjectLabel } from '../app/ui';
import { needKind } from '../domain/needs';
import type { PrivateProfile } from '../domain/reports';
import type { CustomValue, EncryptedBlob, ID } from '../domain/types';

export async function loadPrivateProfiles(memberIds: ID[], dek: CryptoKey, database: PlannerDB = defaultDb): Promise<PrivateProfile[]> {
  const dec = async (b?: EncryptedBlob) => (b ? decryptString(dek, b).catch(() => '[unreadable]') : undefined);
  const fields = await database.customFields.toArray();
  const out: PrivateProfile[] = [];
  for (const id of memberIds) {
    const m = await database.members.get(id);
    if (!m) continue;
    const [restrictions, needs, conditions, values] = await Promise.all([
      database.restrictions.where('memberId').equals(id).filter((r) => r.active).toArray(),
      database.needs.where('memberId').equals(id).filter((n) => n.active).toArray(),
      database.conditions.where('memberId').equals(id).filter((c) => c.active).toArray(),
      database.customValues.where('memberId').equals(id).toArray(),
    ]);
    const p = m.planningProfile;
    const details: PrivateProfile['details'] = [];
    if (p.ageBand) details.push({ label: 'Age band', value: p.ageBand });
    details.push({ label: 'Presence', value: p.presence.replace(/-/g, ' ') + (p.guestFrom || p.guestUntil ? ` (${p.guestFrom ?? '…'} to ${p.guestUntil ?? '…'})` : '') });
    if (p.dailyCalorieGoal) details.push({ label: 'Daily calorie goal', value: String(p.dailyCalorieGoal) });
    for (const v of values) {
      const def = fields.find((f) => f.id === v.fieldDefinitionId);
      if (!def) continue;
      const raw: CustomValue | undefined = v.valueEnc ? JSON.parse((await dec(v.valueEnc)) ?? 'null') ?? undefined : v.value;
      if (raw === undefined) continue;
      details.push({ label: def.label, value: Array.isArray(raw) ? raw.join(', ') : raw === true ? 'Yes' : String(raw) });
    }
    out.push({
      memberId: id,
      name: m.preferredName || m.displayName,
      details,
      restrictions: await Promise.all(restrictions.map(async (r) => {
        const type = RESTRICTION_TYPES.find((t) => t.code === r.type)?.label ?? r.type;
        const extra = [
          r.type === 'intolerance' ? STRICTNESS.find((s) => s.code === (r.strictness ?? 'strict'))?.label : undefined,
          r.severity, r.cautionCrossContact ? 'cross-contact concern' : undefined, r.verifiedAt ? 'admin-confirmed' : undefined,
        ].filter(Boolean);
        const note = await dec(r.adminNoteEnc);
        return `${type}: ${subjectLabel(r.subject)}${extra.length ? ` (${extra.join(', ')})` : ''}${note ? `. Note: ${note}` : ''}`;
      })),
      needs: await Promise.all(needs.map(async (n) => {
        const def = needKind(n.kind);
        const params = Object.entries(n.params ?? {}).map(([k, v]) => `${def?.params?.find((x) => x.key === k)?.label ?? k}: ${v}`);
        const text = n.detailsEnc ? Object.values(JSON.parse((await dec(n.detailsEnc)) ?? '{}') as Record<string, string>).filter(Boolean) : [];
        return `${def?.label ?? n.kind}${[...params, ...text].length ? ` (${[...params, ...text].join('; ')})` : ''}${n.confirmed ? '' : ' [amount not confirmed]'}`;
      })),
      conditions: (await Promise.all(conditions.map((c) => dec(c.labelEnc)))).filter((x): x is string => !!x),
      notes: await dec(m.privateNotesEnc),
    });
  }
  return out;
}
