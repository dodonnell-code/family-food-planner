import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db, now } from '../../data/db';
import { addRestrictions, deactivateRestriction, dismissSurveyRefresh, mergeMembers, resetSurvey, setMemberStatus, setRefusalIgnored, updateMember, updateRestriction } from '../../data/repo';
import { surveyRefusals } from '../../domain/preferences';
import { decryptString, encryptString } from '../../data/crypto';
import { useSession } from '../../app/session';
import { ALLERGENS, Avatar, DIET_TAGS, fmtDate, isPreferenceOnly, MEMBER_COLORS, RESTRICTION_TYPES, STRICTNESS, subjectLabel } from '../../app/ui';
import NeedsCard from './NeedsCard';
import CustomFieldsCard from './CustomFieldsCard';
import type { AgeBand, Strictness, Member, MemberRestriction, PlanningProfile, Presence, RestrictionType } from '../../domain/types';
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
      <NeedsCard member={member} />
      <CustomFieldsCard member={member} />
      <PrivateNotesCard member={member} onSaved={() => flash('Private note saved (encrypted)')} />
      <SurveyHistoryCard member={member} />
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
  const [picked, setPicked] = useState<string[]>([]);
  const [customFood, setCustomFood] = useState('');
  const [result, setResult] = useState('');
  const [severity, setSeverity] = useState<'' | 'mild' | 'moderate' | 'severe'>('');
  const [crossContact, setCrossContact] = useState(true);
  const [strictness, setStrictness] = useState<Strictness>('strict');
  const [verified, setVerified] = useState(true);
  const [note, setNote] = useState('');
  const refusals = useLiveQuery(() => surveyRefusals(member.id), [member.id]);
  const catalogNames = useLiveQuery(async () => (await db.foods.filter((f) => f.active).toArray()).map((f) => f.name).sort(), []);

  useEffect(() => {
    if (!dek || !restrictions) return;
    Promise.all(restrictions.filter((r) => r.adminNoteEnc).map(async (r) => [r.id, await decryptString(dek, r.adminNoteEnc!).catch(() => '[unreadable]')] as const))
      .then((pairs) => setNotes(Object.fromEntries(pairs)));
  }, [dek, restrictions]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!dek) return;
    const foods = customFood.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean).map((s) => `food:${s}`);
    const subjects = [...picked, ...foods];
    if (subjects.length === 0) return setResult('Choose at least one item or type a food.');
    const pref = isPreferenceOnly(type);
    const isIntol = type === 'intolerance';
    const { added, skipped } = await addRestrictions(member.id, subjects, {
      type,
      // Preferences carry no sensitivity: no severity, no cross-contact, nothing to confirm.
      severity: pref || isIntol ? undefined : severity || undefined,
      strictness: isIntol ? strictness : undefined,
      cautionCrossContact: pref || (isIntol && strictness !== 'strict') ? false : crossContact,
      verifiedAt: pref || verified ? now() : undefined,
      adminNoteEnc: note.trim() ? await encryptString(dek, note.trim()) : undefined,
    });
    setResult(
      `Added ${added.length} ${pref ? 'disliked food' : 'restriction'}${added.length === 1 ? '' : 's'}.` +
        (skipped.length ? ` Already recorded: ${skipped.map(subjectLabel).join(', ')}.` : ''),
    );
    setPicked([]);
    setNote('');
    setCustomFood('');
  }

  const pendingCount = picked.length + customFood.split(/[,;\n]/).filter((x) => x.trim()).length;
  const toggle = (code: string) => setPicked((p) => (p.includes(code) ? p.filter((x) => x !== code) : [...p, code]));
  const activeSubjects = new Set((restrictions ?? []).filter((r) => r.active && r.type === type).map((r) => r.subject));
  const Chip = ({ code, label }: { code: string; label: string }) => {
    const on = picked.includes(code);
    const has = activeSubjects.has(code);
    return (
      <button type="button" aria-pressed={on} disabled={has} title={has ? 'Already recorded' : undefined} onClick={() => toggle(code)}
        style={{ minHeight: 44, padding: '0 14px', borderRadius: 999, fontWeight: 600,
          background: on ? 'var(--accent)' : 'var(--surface)', color: on ? 'var(--accent-ink)' : 'var(--text)', borderColor: on ? 'var(--accent)' : 'var(--border)' }}>
        {on ? '✓ ' : ''}{label}
      </button>
    );
  };

  const pref = isPreferenceOnly(type);
  const intol = type === 'intolerance';
  const active = (restrictions ?? []).filter((r) => r.active && !isPreferenceOnly(r.type));
  const dislikes = (restrictions ?? []).filter((r) => r.active && isPreferenceOnly(r.type));
  const inactive = (restrictions ?? []).filter((r) => !r.active);

  return (
    <section className="card stack">
      <h2>Allergies, restrictions &amp; dislikes</h2>
      <p className="small muted">Allergies, diets and strict intolerances are hard safety rules: group meals never include a conflicting food, no matter how much others like it. Intolerances marked “avoid when possible” or “barely an inconvenience” only count against a food.</p>
      {active.length === 0 && <p className="muted">None recorded.</p>}
      <div className="list">
        {active.map((r) => <RestrictionRow key={r.id} r={r} note={notes[r.id]} />)}
      </div>

      <div className="stack" style={{ gap: 6, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        <h3 style={{ margin: 0 }}>Foods {member.preferredName || member.displayName.split(' ')[0]} doesn’t like</h3>
        <p className="small muted" style={{ margin: 0 }}>Not a safety issue. These count against a food when choosing group meals, so foods the family dislikes are avoided where possible.</p>
        {dislikes.length === 0 && !refusals?.active.length ? <p className="muted small" style={{ margin: 0 }}>None recorded.</p> : (
          <>
          <div className="row" style={{ gap: 8 }}>
            {dislikes.map((r) => (
              <span key={r.id} className="badge" style={{ fontSize: '0.95rem', padding: '6px 6px 6px 14px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {subjectLabel(r.subject)}
                <button type="button" className="ghost" aria-label={`Remove ${subjectLabel(r.subject)}`} style={{ minHeight: 32, padding: '0 8px' }}
                  onClick={() => deactivateRestriction(r.id)}>✕</button>
              </span>
            ))}
            {refusals?.active.map((f) => (
              <span key={f.id} className="badge" title="From their survey: “Would refuse”" style={{ fontSize: '0.95rem', padding: '6px 6px 6px 12px', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--accent-soft)', color: 'var(--text)' }}>
                <span className="small muted">survey:</span> {f.name}
                <button type="button" className="ghost" aria-label={`Stop applying ${f.name} until next survey`} title="Stop applying until their next survey" style={{ minHeight: 32, padding: '0 8px' }}
                  onClick={() => setRefusalIgnored(refusals.survey!.id, f.id, true)}>✕</button>
              </span>
            ))}
          </div>
          {!!refusals?.active.length && <span className="small muted">Tags marked “survey” come from {member.preferredName || member.displayName.split(' ')[0]}’s answers (“Would refuse”). Removing one stops it counting until their next survey.</span>}
          </>
        )}
        {!!refusals?.ignored.length && (
          <details>
            <summary className="small muted">Survey refusals not applied ({refusals.ignored.length})</summary>
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              {refusals.ignored.map((f) => (
                <button key={f.id} type="button" style={{ minHeight: 40 }} onClick={() => setRefusalIgnored(refusals.survey!.id, f.id, false)}>↺ {f.name}</button>
              ))}
            </div>
          </details>
        )}
      </div>

      <form className="stack" onSubmit={add} style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        <h3>Add restrictions or dislikes</h3>
        <p className="small muted" style={{ margin: 0 }}>Choose a type, then tap or type everything that applies. You can add several at once.</p>
        <label style={{ maxWidth: 360 }}>Type
          <select value={type} onChange={(e) => { setType(e.target.value as RestrictionType); setPicked([]); }}>
            {RESTRICTION_TYPES.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
          </select>
        </label>
        {!pref && <>
        <div className="stack" style={{ gap: 6 }}>
          <span style={{ fontWeight: 600 }}>Allergens</span>
          <div className="row" style={{ gap: 8 }}>{ALLERGENS.map((a) => <Chip key={a.code} code={a.code} label={a.label} />)}</div>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <span style={{ fontWeight: 600 }}>Diets &amp; exclusions</span>
          <div className="row" style={{ gap: 8 }}>{DIET_TAGS.map((d) => <Chip key={d.code} code={d.code} label={d.label} />)}</div>
        </div>
        </>}
        <label>{pref ? 'Foods they don’t like (separate with commas)' : 'Specific foods (optional, separate with commas)'}
          <input value={customFood} onChange={(e) => setCustomFood(e.target.value)} placeholder={pref ? 'e.g. sardines, olives, split peas' : 'e.g. mushrooms, olives, coconut'} list="catalog-foods" />
          <datalist id="catalog-foods">{(catalogNames ?? []).map((n) => <option key={n} value={n} />)}</datalist>
          {pref && <span className="small muted" style={{ fontWeight: 400 }}>A short word like “tuna” matches every tuna item in the catalog.</span>}
        </label>
        {!pref && <>
        {intol && (
          <fieldset className="stack" style={{ border: 'none', padding: 0, margin: 0, gap: 8 }}>
            <legend style={{ fontWeight: 600, marginBottom: 6 }}>How strict? (applies to all selected)</legend>
            {STRICTNESS.map((o) => (
              <label key={o.code} className="inline" style={{ alignItems: 'flex-start' }}>
                <input type="radio" name="strictness" checked={strictness === o.code} onChange={() => setStrictness(o.code)} style={{ width: 24, height: 24, marginTop: 2 }} />
                <span><strong>{o.label}</strong><br /><span className="small muted" style={{ fontWeight: 400 }}>{o.help}</span></span>
              </label>
            ))}
          </fieldset>
        )}
        {!intol && <div className="grid">
          <label>Severity (optional, applies to all selected)
            <select value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)}>
              <option value="">Not specified</option><option value="mild">Mild</option><option value="moderate">Moderate</option><option value="severe">Severe</option>
            </select>
          </label>
        </div>}
        {(!intol || strictness === 'strict') && <label className="inline"><input type="checkbox" checked={crossContact} onChange={(e) => setCrossContact(e.target.checked)} /> Cross-contact is a concern (“may contain” foods are left out too)</label>}
        <label className="inline"><input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} /> Admin-confirmed (respondent cannot remove it)</label>
        </>}
        {!pref && <label>Private note (encrypted, optional)<textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Planning info only, e.g. 'carries epinephrine; avoid 'may contain' labels'. Not a medical history." /></label>}
        {result && <div className="notice ok" role="status">{result}</div>}
        <div><button className="primary" disabled={!dek || pendingCount === 0}>
          {pendingCount ? `Add ${pendingCount} ${pref ? 'disliked food' : 'restriction'}${pendingCount === 1 ? '' : 's'}` : pref ? 'Add disliked foods' : 'Add restrictions'}
        </button></div>
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
  const [editing, setEditing] = useState(false);
  if (editing) return <RestrictionEditor r={r} note={note} done={() => setEditing(false)} />;
  return (
    <div className="spread">
      <div>
        <strong>{subjectLabel(r.subject)}</strong>{' '}
        <span className="badge">{RESTRICTION_TYPES.find((t) => t.code === r.type)?.label}</span>{' '}
        {r.severity && <span className={`badge ${r.severity === 'severe' ? 'danger' : 'warn'}`}>{r.severity}</span>}{' '}
        {r.type === 'intolerance' && <span className={`badge ${!r.strictness || r.strictness === 'strict' ? 'danger' : r.strictness === 'avoid' ? 'warn' : ''}`}>{STRICTNESS.find((x) => x.code === (r.strictness ?? 'strict'))?.label.split(':')[0]}</span>}{' '}
        {r.verifiedAt ? <span className="badge ok">confirmed</span> : <span className="badge warn">unconfirmed</span>}{' '}
        {r.cautionCrossContact && <span className="badge warn">cross-contact</span>}
        {note && <div className="small muted">{note}</div>}
      </div>
      {r.active && (
        <span className="row" style={{ gap: 6 }}>
          <button onClick={() => setEditing(true)}>Edit</button>
          <button className="danger" onClick={() => confirm(`Remove the ${subjectLabel(r.subject)} restriction? It will be kept in history.`) && deactivateRestriction(r.id)}>Remove</button>
        </span>
      )}
    </div>
  );
}

/** Change a restriction in place: its type, how strict or severe it is, cross-contact, and the note. */
function RestrictionEditor({ r, note, done }: { r: MemberRestriction; note?: string; done: () => void }) {
  const { dek } = useSession();
  const [type, setType] = useState<RestrictionType>(r.type);
  const [severity, setSeverity] = useState<'' | 'mild' | 'moderate' | 'severe'>(r.severity ?? '');
  const [strictness, setStrictness] = useState<Strictness>(r.strictness ?? 'strict');
  const [cross, setCross] = useState(!!r.cautionCrossContact);
  const [verified, setVerified] = useState(!!r.verifiedAt);
  const [text, setText] = useState(note ?? '');
  const [err, setErr] = useState('');
  const pref = isPreferenceOnly(type);
  const intol = type === 'intolerance';
  async function save() {
    try {
      const noteEnc = !dek ? r.adminNoteEnc : text.trim() ? (text.trim() === (note ?? '') ? r.adminNoteEnc : await encryptString(dek, text.trim())) : undefined;
      await updateRestriction(r.id, {
        type,
        severity: pref || intol ? undefined : severity || undefined,
        strictness: intol ? strictness : undefined,
        cautionCrossContact: pref || (intol && strictness !== 'strict') ? false : cross,
        verifiedAt: pref || verified ? r.verifiedAt ?? now() : undefined,
        adminNoteEnc: pref ? undefined : noteEnc,
      });
      done();
    } catch (e) { setErr((e as Error).message); }
  }
  return (
    <div className="stack" style={{ gap: 10, padding: 12, border: '1px solid var(--border)', borderRadius: 12 }}>
      <strong>Edit: {subjectLabel(r.subject)}</strong>
      <label style={{ maxWidth: 360 }}>Type
        <select value={type} onChange={(e) => setType(e.target.value as RestrictionType)}>
          {RESTRICTION_TYPES.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
        </select>
      </label>
      {intol && (
        <fieldset className="stack" style={{ border: 'none', padding: 0, margin: 0, gap: 8 }}>
          <legend style={{ fontWeight: 600, marginBottom: 6 }}>How strict?</legend>
          {STRICTNESS.map((o) => (
            <label key={o.code} className="inline" style={{ alignItems: 'flex-start' }}>
              <input type="radio" name={`strict-${r.id}`} checked={strictness === o.code} onChange={() => setStrictness(o.code)} style={{ width: 24, height: 24, marginTop: 2 }} />
              <span><strong>{o.label}</strong><br /><span className="small muted" style={{ fontWeight: 400 }}>{o.help}</span></span>
            </label>
          ))}
        </fieldset>
      )}
      {!pref && !intol && (
        <label style={{ maxWidth: 260 }}>Severity
          <select value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)}>
            <option value="">Not specified</option><option value="mild">Mild</option><option value="moderate">Moderate</option><option value="severe">Severe</option>
          </select>
        </label>
      )}
      {!pref && (!intol || strictness === 'strict') && <label className="inline"><input type="checkbox" checked={cross} onChange={(e) => setCross(e.target.checked)} /> Cross-contact is a concern (“may contain” foods are left out too)</label>}
      {!pref && <label className="inline"><input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} /> Admin-confirmed (respondent cannot remove it)</label>}
      {!pref && <label>Private note (encrypted)<textarea value={text} onChange={(e) => setText(e.target.value)} disabled={!dek} /></label>}
      {err && <div className="notice danger" role="alert">{err}</div>}
      <div className="row" style={{ gap: 8 }}>
        <button className="primary" onClick={save}>Save changes</button>
        <button className="ghost" onClick={done}>Cancel</button>
      </div>
    </div>
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
      <p className="small muted">Anything else worth knowing for planning that doesn't fit above. Encrypted on this iPad and excluded from non-detailed reports.</p>
      <textarea value={text ?? ''} disabled={text === null} onChange={(e) => setText(e.target.value)} />
      <div><button onClick={save} disabled={text === null}>Save note</button></div>
    </section>
  );
}

function SurveyHistoryCard({ member }: { member: Member }) {
  const memberId = member.id;
  const surveys = useLiveQuery(() => db.surveys.where('memberId').equals(memberId).toArray(), [memberId]);
  const sorted = (surveys ?? []).sort((a, b) => b.version - a.version);
  const latest = sorted.find((s) => s.status === 'submitted');
  const live = sorted.some((s) => s.status === 'submitted' || s.status === 'in-progress');
  const name = member.preferredName || member.displayName.split(' ')[0];
  return (
    <section className="card stack">
      <div className="spread">
        <h2 style={{ margin: 0 }}>Survey</h2>
        <span className="row" style={{ gap: 6 }}>
          {live && <button className="danger" onClick={() => window.confirm(`Reset ${name}’s survey?\n\nTheir answers will stop counting in the plan (safe defaults are used for them) until they take it again. Their restrictions aren’t affected, and the old survey stays in the history.`) && resetSurvey(memberId)}>Reset survey</button>}
        </span>
      </div>
      {latest?.needsRefresh && (
        <div className="notice spread" style={{ gap: 8 }}>
          <span className="small">{latest.refreshReason ?? 'Their restrictions or membership changed after they last took it, so a retake is suggested.'}</span>
          <button className="ghost small" onClick={() => dismissSurveyRefresh(memberId)}>No retake needed</button>
        </div>
      )}
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
