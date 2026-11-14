import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '../../data/db';
import { setCustomValue } from '../../data/adminRepo';
import { decryptString } from '../../data/crypto';
import { useSession } from '../../app/session';
import type { CustomFieldDefinition, CustomValue, Member } from '../../domain/types';

/** Admin-defined extra profile fields. Private values are encrypted with the admin key. */
export default function CustomFieldsCard({ member }: { member: Member }) {
  const { dek } = useSession();
  const data = useLiveQuery(async () => {
    const [defs, values] = await Promise.all([
      db.customFields.filter((d) => d.enabled).toArray(),
      db.customValues.where('memberId').equals(member.id).toArray(),
    ]);
    return { defs: defs.sort((a, b) => a.label.localeCompare(b.label)), values };
  }, [member.id]);
  const [current, setCurrent] = useState<Record<string, CustomValue | undefined> | null>(null);
  const [initial, setInitial] = useState<Record<string, CustomValue | undefined>>({});
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!data || !dek) return;
    Promise.all(
      data.defs.map(async (d) => {
        const v = data.values.find((x) => x.fieldDefinitionId === d.id);
        if (!v) return [d.id, undefined] as const;
        if (v.valueEnc) return [d.id, JSON.parse(await decryptString(dek, v.valueEnc).catch(() => 'null')) ?? undefined] as const;
        return [d.id, v.value] as const;
      }),
    ).then((pairs) => {
      const obj = Object.fromEntries(pairs);
      setInitial(obj);
      setCurrent((c) => c ?? obj);
    });
  }, [data, dek]);

  if (!data) return null;
  if (data.defs.length === 0) {
    return (
      <section className="card stack">
        <h2>Other details</h2>
        <p className="small muted" style={{ margin: 0 }}>No custom fields yet. You can add some in <Link to="/admin/settings">Settings</Link>.</p>
      </section>
    );
  }

  const set = (id: string, v: CustomValue | undefined) => setCurrent((c) => ({ ...(c ?? {}), [id]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!current) return;
    let n = 0;
    for (const d of data!.defs) {
      if (JSON.stringify(current[d.id] ?? null) === JSON.stringify(initial[d.id] ?? null)) continue;
      await setCustomValue(member.id, d, current[d.id], dek);
      n++;
    }
    setInitial(current);
    setMsg(n ? `Saved ${n} field${n === 1 ? '' : 's'}.` : 'No changes to save.');
    window.setTimeout(() => setMsg(''), 2500);
  }

  return (
    <form className="card stack" onSubmit={save}>
      <div className="spread"><h2 style={{ margin: 0 }}>Other details</h2><Link to="/admin/settings" className="small">Manage fields</Link></div>
      {current === null ? <p className="muted">Loading…</p> : (
        <div className="grid">
          {data.defs.map((d) => <FieldInput key={d.id} def={d} value={current[d.id]} onChange={(v) => set(d.id, v)} />)}
        </div>
      )}
      {msg && <div className="notice ok" role="status">{msg}</div>}
      <div><button className="primary" disabled={current === null}>Save details</button></div>
    </form>
  );
}

function FieldInput({ def, value, onChange }: { def: CustomFieldDefinition; value: CustomValue | undefined; onChange: (v: CustomValue | undefined) => void }) {
  const badge = def.sensitivity === 'private' ? <span className="badge warn" style={{ marginLeft: 6 }}>private</span> : null;
  switch (def.dataType) {
    case 'checkbox':
      return <label className="inline"><input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked || undefined)} /> {def.label}{badge}</label>;
    case 'number':
      return <label>{def.label}{badge}<input type="number" value={value === undefined ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} /></label>;
    case 'single-select':
      return (
        <label>{def.label}{badge}
          <select value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value || undefined)}>
            <option value="">Not set</option>
            {def.options?.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
      );
    case 'multi-select': {
      const cur = Array.isArray(value) ? value : [];
      return (
        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 600 }}>{def.label}{badge}</legend>
          <div className="row" style={{ gap: 8, marginTop: 6 }}>
            {def.options?.map((o) => {
              const on = cur.includes(o);
              return (
                <button type="button" key={o} aria-pressed={on} onClick={() => onChange(on ? cur.filter((x) => x !== o) : [...cur, o])}
                  style={{ minHeight: 44, borderRadius: 999, background: on ? 'var(--accent)' : 'var(--surface)', color: on ? 'var(--accent-ink)' : 'var(--text)' }}>
                  {on ? '✓ ' : ''}{o}
                </button>
              );
            })}
          </div>
        </fieldset>
      );
    }
    default:
      return <label>{def.label}{badge}<input value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value || undefined)} /></label>;
  }
}
