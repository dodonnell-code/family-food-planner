import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../data/db';
import { addCondition, addNeed, deactivateCondition, deactivateNeed, updateNeed } from '../../data/repo';
import { decryptString, encryptString } from '../../data/crypto';
import { useSession } from '../../app/session';
import { NEED_DOMAINS, NEED_KINDS, needKind, type NeedKindDef } from '../../domain/needs';
import type { Member, MemberNeed } from '../../domain/types';

type Details = Record<string, string>;

/** Conditions + needs, each a list (many per person). Extensible by domain via domain/needs.ts. */
export default function NeedsCard({ member }: { member: Member }) {
  const name = member.preferredName || member.displayName.split(' ')[0];
  const enabledDomains = NEED_DOMAINS.filter((d) => d.enabled);
  return (
    <section className="card stack">
      <h2>Health conditions &amp; needs</h2>
      <p className="small muted">Planning information only: the app never suggests doses or treatment. Everything here is admin-only and left out of the family summary unless you choose a detailed report.</p>
      <Conditions memberId={member.id} />
      {enabledDomains.map((d) => (
        <Needs key={d.domain} memberId={member.id} name={name} domainLabel={d.label} kinds={NEED_KINDS.filter((k) => k.domain === d.domain)} />
      ))}
    </section>
  );
}

function Conditions({ memberId }: { memberId: string }) {
  const { dek } = useSession();
  const rows = useLiveQuery(() => db.conditions.where('memberId').equals(memberId).filter((c) => c.active).toArray(), [memberId]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [text, setText] = useState('');

  useEffect(() => {
    if (!dek || !rows) return;
    Promise.all(rows.map(async (c) => [c.id, await decryptString(dek, c.labelEnc).catch(() => '[unreadable]')] as const)).then((p) => setLabels(Object.fromEntries(p)));
  }, [dek, rows]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!dek) return;
    for (const label of text.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)) {
      await addCondition(memberId, await encryptString(dek, label));
    }
    setText('');
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <h3 style={{ margin: 0 }}>Conditions (optional, encrypted)</h3>
      {rows && rows.length > 0 ? (
        <div className="row" style={{ gap: 8 }}>
          {rows.map((c) => (
            <span key={c.id} className="badge" style={{ fontSize: '0.95rem', padding: '6px 6px 6px 14px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {labels[c.id] ?? '…'}
              <button type="button" className="ghost" aria-label={`Remove ${labels[c.id] ?? 'condition'}`} style={{ minHeight: 32, padding: '0 8px' }}
                onClick={() => confirm(`Remove "${labels[c.id]}"? It stays in history.`) && deactivateCondition(c.id)}>✕</button>
            </span>
          ))}
        </div>
      ) : <p className="muted small" style={{ margin: 0 }}>None recorded.</p>}
      <form className="row" onSubmit={add}>
        <input style={{ flex: 1, minWidth: 220 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Type 1 diabetes (separate several with commas)" aria-label="Add condition" />
        <button disabled={!dek || !text.trim()}>Add</button>
      </form>
    </div>
  );
}

function Needs({ memberId, name, domainLabel, kinds }: { memberId: string; name: string; domainLabel: string; kinds: NeedKindDef[] }) {
  const rows = useLiveQuery(
    () => db.needs.where('memberId').equals(memberId).filter((n) => n.active && kinds.some((k) => k.kind === n.kind)).toArray(),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- kinds is derived from domainLabel
    [memberId, domainLabel],
  );
  const [adding, setAdding] = useState('');
  const available = kinds.filter((k) => k.multiple || !rows?.some((r) => r.kind === k.kind));
  const addingDef = needKind(adding);

  return (
    <div className="stack" style={{ gap: 8, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
      <h3 style={{ margin: 0 }}>{domainLabel} needs</h3>
      {rows && rows.length === 0 && <p className="muted small" style={{ margin: 0 }}>None recorded.</p>}
      <div className="list">
        {rows?.map((n) => <NeedRow key={n.id} need={n} name={name} />)}
      </div>

      {addingDef ? (
        <NeedForm key={adding} def={addingDef} name={name} onCancel={() => setAdding('')}
          onSave={async (params, confirmed, detailsEnc) => {
            await addNeed({ memberId, domain: addingDef.domain, kind: addingDef.kind, params, confirmed, detailsEnc });
            setAdding('');
          }} />
      ) : available.length > 0 && (
        <div className="row">
          <select value="" onChange={(e) => setAdding(e.target.value)} aria-label={`Add a ${domainLabel.toLowerCase()} need`}>
            <option value="">+ Add a {domainLabel.toLowerCase()} need…</option>
            {available.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

function NeedRow({ need, name }: { need: MemberNeed; name: string }) {
  const { dek } = useSession();
  const def = needKind(need.kind);
  const [details, setDetails] = useState<Details>({});
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!dek || !need.detailsEnc) return setDetails({});
    decryptString(dek, need.detailsEnc).then((t) => setDetails(JSON.parse(t) as Details), () => setDetails({}));
  }, [dek, need.detailsEnc]);

  if (!def) return <div className="muted small">Unknown need type "{need.kind}" (from a newer version?)</div>;

  if (editing) {
    return (
      <NeedForm def={def} name={name} initial={{ params: need.params, details }} onCancel={() => setEditing(false)}
        onSave={async (params, confirmed, detailsEnc) => {
          await updateNeed(need.id, { params, confirmed, detailsEnc });
          setEditing(false);
        }} />
    );
  }

  const summary = [
    ...(def.params ?? []).map((p) => {
      const v = p.type === 'number' ? need.params[p.key] : details[p.key];
      return v !== undefined && v !== '' ? `${p.label}: ${v}` : null;
    }),
  ].filter(Boolean);

  return (
    <div className="spread">
      <div>
        <strong>{def.label}</strong>{' '}
        {!need.confirmed && <span className="badge warn">placeholder amount</span>}
        <div className="small muted">{summary.length ? summary.join(' · ') : def.description}</div>
        {!need.confirmed && (
          <div className="small" style={{ marginTop: 4 }}>
            This amount is a placeholder, not a recommendation. Set the amount from {name}'s care plan.{' '}
            <button type="button" style={{ minHeight: 36, padding: '0 12px' }} onClick={() => updateNeed(need.id, { confirmed: true })}>Keep it</button>
          </div>
        )}
      </div>
      <div className="row">
        {def.params && <button type="button" onClick={() => setEditing(true)}>Edit</button>}
        <button type="button" className="danger" onClick={() => confirm(`Remove "${def.label}"? It stays in history.`) && deactivateNeed(need.id)}>Remove</button>
      </div>
    </div>
  );
}

function NeedForm({ def, name, initial, onSave, onCancel }: {
  def: NeedKindDef;
  name: string;
  initial?: { params: Record<string, number>; details: Details };
  onSave: (params: Record<string, number>, confirmed: boolean, detailsEnc: MemberNeed['detailsEnc']) => Promise<void>;
  onCancel: () => void;
}) {
  const { dek } = useSession();
  const numberDefs = (def.params ?? []).filter((p) => p.type === 'number');
  const textDefs = (def.params ?? []).filter((p) => p.type === 'text');
  const [nums, setNums] = useState<Record<string, string>>(() =>
    Object.fromEntries(numberDefs.map((p) => [p.key, String(initial?.params[p.key] ?? p.placeholder ?? '')])),
  );
  const [touched, setTouched] = useState<Set<string>>(() => new Set(initial ? numberDefs.map((p) => p.key) : []));
  const [texts, setTexts] = useState<Details>(() => Object.fromEntries(textDefs.map((p) => [p.key, initial?.details[p.key] ?? ''])));

  // Unconfirmed if any number still holds an untouched placeholder default.
  const usingPlaceholder = numberDefs.some((p) => p.placeholder !== undefined && !touched.has(p.key));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!dek) return;
    const params: Record<string, number> = {};
    for (const p of numberDefs) {
      const v = Number(nums[p.key]);
      if (nums[p.key] !== '' && Number.isFinite(v)) params[p.key] = Math.min(p.max ?? Infinity, Math.max(p.min ?? -Infinity, v));
    }
    const cleanTexts = Object.fromEntries(Object.entries(texts).filter(([, v]) => v.trim()));
    const detailsEnc = Object.keys(cleanTexts).length ? await encryptString(dek, JSON.stringify(cleanTexts)) : undefined;
    await onSave(params, !usingPlaceholder, detailsEnc);
  }

  return (
    <form className="stack card" style={{ background: 'var(--surface-2)', gap: 10 }} onSubmit={submit}>
      <strong>{def.label}</strong>
      <span className="small muted">{def.description}</span>
      {numberDefs.map((p) => (
        <label key={p.key} style={{ maxWidth: 360 }}>{p.label}
          <input type="number" inputMode="numeric" min={p.min} max={p.max} value={nums[p.key]}
            onChange={(e) => { setNums((x) => ({ ...x, [p.key]: e.target.value })); setTouched((t) => new Set(t).add(p.key)); }} />
          {p.help && <span className="small muted" style={{ fontWeight: 400 }}>{p.help}</span>}
        </label>
      ))}
      {usingPlaceholder && (
        <div className="notice small">The suggested number is a <strong>placeholder</strong>, not a recommendation. Change it to match {name}'s care plan, or save it and confirm later.</div>
      )}
      {textDefs.map((p) => (
        <label key={p.key}>{p.label}
          <input value={texts[p.key]} onChange={(e) => setTexts((x) => ({ ...x, [p.key]: e.target.value }))} />
          {p.help && <span className="small muted" style={{ fontWeight: 400 }}>{p.help}</span>}
        </label>
      ))}
      <div className="row">
        <button className="primary" disabled={!dek}>Save</button>
        <button type="button" className="ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
