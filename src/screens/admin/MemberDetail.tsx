import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db, now } from '../../data/db';
import { addRestriction, deactivateRestriction, mergeMembers, setMemberStatus, updateMember } from '../../data/repo';
import { decryptString, encryptString } from '../../data/crypto';
import { useSession } from '../../app/session';
import { ALLERGENS, Avatar, DIET_TAGS, fmtDate, MEMBER_COLORS, RESTRICTION_TYPES, subjectLabel } from '../../app/ui';
import { RAPID_CARB_PLACEHOLDER_SERVINGS } from '../../domain/types';
import type { AgeBand, HealthNeeds, Member, MemberRestriction, PlanningProfile, Presence, RestrictionType } from '../../domain/types';
import { useStartSurvey } from './AdminLayout';

const AGE_BANDS: { v: AgeBand; l: string }[] = [
  { v: 'infant', l: 'Infant (under 1)' }, { v: 'toddler', l: 'Toddler (1–3)' }, { v: 'child', l: 'Child (4–12)' },
  { v: 'teen', l: 'Teen (13–17)' }, { v: 'adult', l: 'Adult' }, { v: 'older-adult', l: 'Older adult' },
];

export default function MemberDetail() {
  const { id } = useParams<{ id: string }>();
  const member = useLiveQuery(() => db.members.get(id!), [id]);
  if (member === undefined) return <p className="muted">Loading…</p>;
  if (!member) return <p>Member not found. <Link to="/admin/members">Back</Link></p>;
  return <MemberEditor key={member.id} member={member} />;
}

function MemberEditor({ member }: { member: Member }) {
  const nav = useNavigate();
  const startSurvey = useStartSurvey();
  const [saved, setSaved] = useState('');

  const flash = (t: string) => { setSaved(t); window.setTimeout(() => setSaved(''), 2000); };

  return (
    <div className="stack">
      <div className="spread">
        <div className="row"><Avatar member={member} size={56} /><div><h1 style={{ margin: 0 }}>{member.displayName}</h1><span className="muted small">Member since {fmtDate(member.joinedAt ?? member.createdAt)} · <span className="badge">{member.status}</span></span></div></div>
        <div className="row">
          {member.status === 'active' && <button className="primary" onClick={() => startSurvey(member.id)}>Start survey for {member.preferredName || member.displayName.split(' ')[0]}</button>}
          <Link to="/admin/members" className="btn ghost">All members</Link>
        </div>
      </div>
      {saved && <div className="notice ok" role="status">{saved}</div>}

      <ProfileCard member={member} onSaved={() => flash('Profile saved')} />
      <RestrictionsCard member={member} />
      <HealthNeedsCard member={member} onSaved={() => flash('Food-related health needs saved')} />
      <PrivateNotesCard member={member} onSaved={() => flash('Private note saved (encrypted)')} />
      <SurveyHistoryCard memberId={member.id} />
      <StatusCard member={member} onMerged={() => nav('/admin/members')} />
    </div>
  );
}

function ProfileCard({ member, onSaved }: { member: Member; onSaved: () => void }) {
  const [f, setF] = useState({
    displayName: member.displayName,
    preferredName: member.preferredName ?? '',
    color: member.color ?? MEMBER_COLORS[0],
    ...member.planningProfile,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.displayName.trim()) return;
    const { displayName, preferredName, color, ...profile } = f;
    const planningProfile: PlanningProfile = {
      ...profile,
      healthNeeds: member.planningProfile.healthNeeds, // owned by HealthNeedsCard; keep latest saved value
      dailyCalorieGoal: profile.dailyCalorieGoal ? Number(profile.dailyCalorieGoal) : undefined,
    };
    await updateMember(member.id, { displayName: displayName.trim(), preferredName: preferredName.trim() || undefined, color, planningProfile });
    onSaved();
  }

  return (
    <form className="card stack" onSubmit={save}>
      <h2>Profile</h2>
      <div className="grid">
        <label>Display name<input value={f.displayName} onChange={(e) => set('displayName', e.target.value)} required /></label>
        <label>Preferred name (shown at handoff)<input value={f.preferredName} onChange={(e) => set('preferredName', e.target.value)} /></label>
        <label>Age band (optional)
          <select value={f.ageBand ?? ''} onChange={(e) => set('ageBand', (e.target.value || undefined) as AgeBand | undefined)}>
            <option value="">Not specified</option>
            {AGE_BANDS.map((a) => <option key={a.v} value={a.v}>{a.l}</option>)}
          </select>
        </label>
        <label>Daily calorie goal (admin-approved, optional)
          <input type="number" inputMode="numeric" min={500} max={5000} step={50} value={f.dailyCalorieGoal ?? ''} onChange={(e) => set('dailyCalorieGoal', e.target.value ? Number(e.target.value) : undefined)} placeholder="Uses household default" />
        </label>
        <label>Presence
          <select value={f.presence} onChange={(e) => set('presence', e.target.value as Presence)}>
            <option value="usually-present">Usually present</option>
            <option value="occasional-guest">Occasional guest</option>
            <option value="temporary-guest">Temporary guest (date range)</option>
          </select>
        </label>
        {f.presence === 'temporary-guest' && (
          <>
            <label>Guest from<input type="date" value={f.guestFrom ?? ''} onChange={(e) => set('guestFrom', e.target.value || undefined)} /></label>
            <label>Guest until<input type="date" value={f.guestUntil ?? ''} onChange={(e) => set('guestUntil', e.target.value || undefined)} /></label>
          </>
        )}
      </div>
      <label className="inline"><input type="checkbox" checked={!!f.canPrepareFood} onChange={(e) => set('canPrepareFood', e.target.checked)} /> Can prepare food on their own</label>
      <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 600, marginBottom: 6 }}>Profile color</legend>
        <div className="row">
          {MEMBER_COLORS.map((c) => (
            <button type="button" key={c} aria-label={`Color ${c}`} aria-pressed={f.color === c} onClick={() => set('color', c)}
              style={{ width: 44, minHeight: 44, padding: 0, borderRadius: '50%', background: c, border: f.color === c ? '3px solid var(--text)' : '1px solid var(--border)' }} />
          ))}
        </div>
      </fieldset>
      <p className="small muted">Exact birth dates, weight and other unnecessary details are intentionally not collected. Age band is never used to infer a medical need.</p>
      <div><button className="primary">Save profile</button></div>
    </form>
  );
}

function RestrictionsCard({ member }: { member: Member }) {
  const { dek } = useSession();
  const restrictions = useLiveQuery(() => db.restrictions.where('memberId').equals(member.id).toArray(), [member.id]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [type, setType] = useState<RestrictionType>('allergy');
  const [subject, setSubject] = useState('peanut');
  const [customFood, setCustomFood] = useState('');
  const [severity, setSeverity] = useState<'' | 'mild' | 'moderate' | 'severe'>('');
  const [crossContact, setCrossContact] = useState(true);
  const [verified, setVerified] = useState(true);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!dek || !restrictions) return;
    Promise.all(restrictions.filter((r) => r.adminNoteEnc).map(async (r) => [r.id, await decryptString(dek, r.adminNoteEnc!).catch(() => '[unreadable]')] as const))
      .then((pairs) => setNotes(Object.fromEntries(pairs)));
  }, [dek, restrictions]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!dek) return;
    const subj = subject === '__food' ? `food:${customFood.trim()}` : subject;
    if (subj === 'food:') return;
    await addRestriction({
      memberId: member.id,
      type,
      subject: subj,
      severity: severity || undefined,
      cautionCrossContact: crossContact,
      verifiedAt: verified ? now() : undefined,
      adminNoteEnc: note.trim() ? await encryptString(dek, note.trim()) : undefined,
    });
    setNote('');
    setCustomFood('');
  }

  const active = (restrictions ?? []).filter((r) => r.active);
  const inactive = (restrictions ?? []).filter((r) => !r.active);

  return (
    <section className="card stack">
      <h2>Allergies, restrictions &amp; safety needs</h2>
      <p className="small muted">These are hard safety rules. No food matching an active restriction will ever be assigned to {member.preferredName || member.displayName}, no matter how much others like it.</p>
      {active.length === 0 && <p className="muted">None recorded.</p>}
      <div className="list">
        {active.map((r) => <RestrictionRow key={r.id} r={r} note={notes[r.id]} />)}
      </div>

      <form className="stack" onSubmit={add} style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        <h3>Add a restriction</h3>
        <div className="grid">
          <label>Type
            <select value={type} onChange={(e) => setType(e.target.value as RestrictionType)}>
              {RESTRICTION_TYPES.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
            </select>
          </label>
          <label>What it applies to
            <select value={subject} onChange={(e) => setSubject(e.target.value)}>
              <optgroup label="Allergens">{ALLERGENS.map((a) => <option key={a.code} value={a.code}>{a.label}</option>)}</optgroup>
              <optgroup label="Diets & exclusions">{DIET_TAGS.map((d) => <option key={d.code} value={d.code}>{d.label}</option>)}</optgroup>
              <option value="__food">A specific food (type it)…</option>
            </select>
          </label>
          {subject === '__food' && <label>Food<input value={customFood} onChange={(e) => setCustomFood(e.target.value)} placeholder="e.g. mushrooms" /></label>}
          <label>Severity (optional)
            <select value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)}>
              <option value="">Not specified</option><option value="mild">Mild</option><option value="moderate">Moderate</option><option value="severe">Severe</option>
            </select>
          </label>
        </div>
        <label className="inline"><input type="checkbox" checked={crossContact} onChange={(e) => setCrossContact(e.target.checked)} /> Cross-contact is a concern (shared storage needs review)</label>
        <label className="inline"><input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} /> Admin-confirmed (respondent cannot remove it)</label>
        <label>Private note (encrypted, optional)<textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Planning info only, e.g. 'carries epinephrine; avoid 'may contain' labels'. Not a medical history." /></label>
        <div><button className="primary" disabled={!dek}>Add restriction</button></div>
      </form>

      {inactive.length > 0 && (
        <details>
          <summary className="muted">Removed restrictions ({inactive.length})</summary>
          <div className="list">{inactive.map((r) => <RestrictionRow key={r.id} r={r} note={notes[r.id]} />)}</div>
        </details>
      )}
    </section>
  );
}

function RestrictionRow({ r, note }: { r: MemberRestriction; note?: string }) {
  return (
    <div className="spread">
      <div>
        <strong>{subjectLabel(r.subject)}</strong>{' '}
        <span className="badge">{RESTRICTION_TYPES.find((t) => t.code === r.type)?.label}</span>{' '}
        {r.severity && <span className={`badge ${r.severity === 'severe' ? 'danger' : 'warn'}`}>{r.severity}</span>}{' '}
        {r.verifiedAt ? <span className="badge ok">confirmed</span> : <span className="badge warn">unconfirmed</span>}{' '}
        {r.cautionCrossContact && <span className="badge warn">cross-contact</span>}
        {note && <div className="small muted">{note}</div>}
      </div>
      {r.active && (
        <button className="danger" onClick={() => confirm(`Remove the ${subjectLabel(r.subject)} restriction? It will be kept in history.`) && deactivateRestriction(r.id)}>Remove</button>
      )}
    </div>
  );
}

function HealthNeedsCard({ member, onSaved }: { member: Member; onSaved: () => void }) {
  const { dek } = useSession();
  const name = member.preferredName || member.displayName.split(' ')[0];
  const [n, setN] = useState<HealthNeeds>(member.planningProfile.healthNeeds ?? {});
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!dek) return;
    if (!member.conditionLabelEnc) setLabel('');
    else decryptString(dek, member.conditionLabelEnc).then(setLabel, () => setLabel('[unreadable]'));
  }, [dek, member.conditionLabelEnc]);

  const rc = n.rapidCarbs ?? { enabled: false, servingsPerDay: RAPID_CARB_PLACEHOLDER_SERVINGS, confirmed: false };
  const setRc = (patch: Partial<typeof rc>) => setN((x) => ({ ...x, rapidCarbs: { ...rc, ...patch } }));
  const flag = (k: 'carbCounting' | 'infantFormula' | 'textureModified' | 'specialtyFormula', v: boolean) => setN((x) => ({ ...x, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!dek || label === null) return;
    await updateMember(member.id, {
      planningProfile: { ...member.planningProfile, healthNeeds: n },
      conditionLabelEnc: label.trim() ? await encryptString(dek, label.trim()) : undefined,
    });
    onSaved();
  }

  return (
    <form className="card stack" onSubmit={save}>
      <h2>Food-related health needs</h2>
      <p className="small muted">Planning flags only. The app never suggests doses or treatment, and these details stay admin-only, excluded from the family summary unless you choose a detailed report.</p>

      <label>Condition (optional, encrypted)
        <input value={label ?? ''} disabled={label === null} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Type 1 diabetes" />
      </label>

      <div className="stack" style={{ gap: 8 }}>
        <label className="inline"><input type="checkbox" checked={rc.enabled} onChange={(e) => setRc({ enabled: e.target.checked })} />
          Needs fast-acting carbs on hand (low blood sugar)</label>
        {rc.enabled && (
          <div className="stack" style={{ marginLeft: 36, gap: 8 }}>
            <label style={{ maxWidth: 360 }}>Fast-acting carb servings to reserve per day
              <input type="number" inputMode="numeric" min={1} max={20} value={rc.servingsPerDay}
                onChange={(e) => setRc({ servingsPerDay: Math.max(1, Number(e.target.value) || 1), confirmed: true })} />
            </label>
            {rc.confirmed ? (
              <span className="badge ok" style={{ alignSelf: 'flex-start' }}>amount set by admin</span>
            ) : (
              <div className="notice small">
                {RAPID_CARB_PLACEHOLDER_SERVINGS} per day is a <strong>placeholder</strong>, not a recommendation. Set the amount that matches {name}'s care plan.
                <div style={{ marginTop: 8 }}><button type="button" onClick={() => setRc({ confirmed: true })}>Keep {rc.servingsPerDay} per day</button></div>
              </div>
            )}
            <span className="small muted">These are reserved for {name} in every plan (glucose tablets, gel, juice boxes and similar) and listed separately from shared food.</span>
          </div>
        )}
        <label className="inline"><input type="checkbox" checked={!!n.carbCounting} onChange={(e) => flag('carbCounting', e.target.checked)} />
          Needs carb counts for meals (shows carbs per serving; favors consistently labeled foods)</label>
        <label className="inline"><input type="checkbox" checked={!!n.infantFormula} onChange={(e) => flag('infantFormula', e.target.checked)} />
          Uses infant formula</label>
        <label className="inline"><input type="checkbox" checked={!!n.textureModified} onChange={(e) => flag('textureModified', e.target.checked)} />
          Needs soft or texture-modified food</label>
        <label className="inline"><input type="checkbox" checked={!!n.specialtyFormula} onChange={(e) => flag('specialtyFormula', e.target.checked)} />
          Uses a specialty or medical formula / nutrition product</label>
      </div>
      <div><button className="primary" disabled={label === null}>Save health needs</button></div>
    </form>
  );
}

function PrivateNotesCard({ member, onSaved }: { member: Member; onSaved: () => void }) {
  const { dek } = useSession();
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (!dek) return;
    if (!member.privateNotesEnc) setText('');
    else decryptString(dek, member.privateNotesEnc).then(setText, () => setText('[unreadable]'));
  }, [dek, member.privateNotesEnc]);

  async function save() {
    if (!dek || text === null) return;
    await updateMember(member.id, { privateNotesEnc: text.trim() ? await encryptString(dek, text.trim()) : undefined });
    onSaved();
  }
  return (
    <section className="card stack">
      <h2>Private notes</h2>
      <p className="small muted">Health or feeding information relevant to planning (e.g. needs rapid carbs for low blood sugar, uses formula, needs soft textures). Encrypted on this iPad and excluded from non-detailed reports. Does not generate treatment advice.</p>
      <textarea value={text ?? ''} disabled={text === null} onChange={(e) => setText(e.target.value)} />
      <div><button onClick={save} disabled={text === null}>Save note</button></div>
    </section>
  );
}

function SurveyHistoryCard({ memberId }: { memberId: string }) {
  const surveys = useLiveQuery(() => db.surveys.where('memberId').equals(memberId).toArray(), [memberId]);
  const sorted = (surveys ?? []).sort((a, b) => b.version - a.version);
  return (
    <section className="card stack">
      <h2>Survey history</h2>
      {sorted.length === 0 && <p className="muted">No surveys yet.</p>}
      <div className="list">
        {sorted.map((s) => (
          <div key={s.id} className="spread">
            <span>Version {s.version} · started {fmtDate(s.startedAt)}{s.completedAt && ` · submitted ${fmtDate(s.completedAt)}`}</span>
            <span className="row">
              {s.needsRefresh && <span className="badge warn">needs refresh</span>}
              <span className={`badge ${s.status === 'submitted' ? 'ok' : s.status === 'in-progress' ? 'warn' : ''}`}>{s.status}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function StatusCard({ member, onMerged }: { member: Member; onMerged: () => void }) {
  const others = useLiveQuery(() => db.members.filter((m) => m.id !== member.id).toArray(), [member.id]);
  const [mergeFrom, setMergeFrom] = useState('');

  async function doMerge() {
    const from = others?.find((o) => o.id === mergeFrom);
    if (!from) return;
    if (!confirm(`Merge "${from.displayName}" INTO "${member.displayName}"?\n\nAll of ${from.displayName}'s surveys and restrictions will move to ${member.displayName}, and ${from.displayName} will be archived. This is recorded in the audit log.`)) return;
    await mergeMembers(member.id, from.id);
    setMergeFrom('');
    onMerged();
  }

  return (
    <section className="card stack">
      <h2>Membership</h2>
      <div className="row">
        {member.status !== 'active' && <button className="primary" onClick={() => setMemberStatus(member.id, 'active')}>Reactivate</button>}
        {member.status === 'active' && <button onClick={() => setMemberStatus(member.id, 'inactive')}>Mark inactive</button>}
        {member.status !== 'archived' && <button className="danger" onClick={() => confirm(`Archive ${member.displayName}? They leave the current plan, but all history is kept and they can be reactivated.`) && setMemberStatus(member.id, 'archived')}>Archive</button>}
      </div>
      <p className="small muted">Inactive and archived members are excluded from current quantities but never deleted. Reactivating reuses the same record and marks their last survey "needs refresh".</p>

      {others && others.length > 0 && (
        <details>
          <summary>Merge a duplicate profile into this one…</summary>
          <div className="row" style={{ marginTop: 10 }}>
            <select value={mergeFrom} onChange={(e) => setMergeFrom(e.target.value)}>
              <option value="">Choose duplicate…</option>
              {others.map((o) => <option key={o.id} value={o.id}>{o.displayName} ({o.status})</option>)}
            </select>
            <button className="danger" disabled={!mergeFrom} onClick={doMerge}>Merge</button>
          </div>
        </details>
      )}
    </section>
  );
}
