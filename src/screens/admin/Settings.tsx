import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../data/db';
import { saveFieldDefinition, updateHousehold } from '../../data/adminRepo';
import type { CustomFieldDefinition, CustomFieldType, Household, PlanningDefaults } from '../../domain/types';

export default function Settings() {
  const hh = useLiveQuery(() => db.households.toCollection().first(), []);
  if (!hh) return <p className="muted">Loading…</p>;
  return (
    <div className="stack">
      <h1>Settings</h1>
      <PlanningForm key={hh.id} hh={hh} />
      <CustomFields />
    </div>
  );
}

type NumKey = { [K in keyof PlanningDefaults]-?: PlanningDefaults[K] extends number | undefined ? K : never }[keyof PlanningDefaults];

function PlanningForm({ hh }: { hh: Household }) {
  const [name, setName] = useState(hh.name);
  const [p, setP] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(hh.planningDefaults).filter(([, v]) => typeof v !== 'boolean').map(([k, v]) => [k, v === undefined ? '' : String(v)])));
  const [s, setS] = useState({ autoLockMinutes: String(hh.settings.autoLockMinutes), backupReminderDays: String(hh.settings.backupReminderDays), expiryWarningDays: String(hh.settings.expiryWarningDays ?? 30) });
  const [noCanned, setNoCanned] = useState(hh.planningDefaults.longTermNoCanned !== false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();

  const field = (k: NumKey, label: string, opts: { min?: number; max?: number; step?: number; help?: string; optional?: boolean } = {}) => (
    <label key={k}>{label}
      <input type="number" inputMode="decimal" min={opts.min ?? 0} max={opts.max} step={opts.step ?? 1} value={p[k] ?? ''} placeholder={opts.optional ? 'Not set' : undefined}
        onChange={(e) => setP((x) => ({ ...x, [k]: e.target.value }))} />
      {opts.help && <span className="small muted" style={{ fontWeight: 400 }}>{opts.help}</span>}
    </label>
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(undefined);
    const n = (v: string | undefined) => (v === undefined || v.trim() === '' ? undefined : Number(v));
    const planningDefaults = ({ ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, n(v)])), longTermNoCanned: noCanned }) as unknown as PlanningDefaults;
    for (const k of ['shortDays', 'mediumDays', 'longDays', 'waterGallonsPerPersonPerDay', 'minDailyMealOptions', 'defaultDailyCalories', 'mealsPerDay', 'waterReserveDays'] as const) {
      if (planningDefaults[k] === undefined) return setMsg({ ok: false, text: 'Please fill in every required setting.' });
    }
    try {
      await updateHousehold({
        name: name.trim() || hh.name,
        planningDefaults,
        settings: { ...hh.settings, autoLockMinutes: Math.max(1, n(s.autoLockMinutes) ?? 5), backupReminderDays: Math.max(1, n(s.backupReminderDays) ?? 14), expiryWarningDays: Math.min(365, Math.max(1, n(s.expiryWarningDays) ?? 30)) },
      });
      setMsg({ ok: true, text: 'Settings saved. The change is listed in Review.' });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <form className="stack" onSubmit={save}>
      <section className="card stack">
        <h2>Household</h2>
        <label style={{ maxWidth: 420 }}>Household name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
      </section>

      <section className="card stack">
        <h2>Planning horizons</h2>
        <p className="small muted" style={{ margin: 0 }}>How many days each plan covers. These are planning presets, not official standards. Three days is a common minimum; two weeks is a useful expansion.</p>
        <div className="grid">
          {field('shortDays', 'Short term (days)', { min: 1, help: 'Default 3 (72-hour kit, no cooking)' })}
          {field('mediumDays', 'Medium term (days)', { min: 2, help: 'Default 14 (14–30 is typical)' })}
          {field('longDays', 'Long term (days)', { min: 3, help: 'Default 90 (90–365 is typical)' })}
        </div>
      </section>

      <section className="card stack">
        <h2>Meals &amp; calories</h2>
        <div className="grid">
          {field('mealsPerDay', 'Group meals per day', { min: 1, max: 6 })}
          {field('defaultDailyCalories', 'Default daily calories per person', { min: 500, step: 50, help: 'Used when a person has no calorie goal set' })}
          {field('minDailyMealOptions', 'Minimum meal options per person', { min: 1, help: 'The plan warns if anyone has fewer suitable options' })}
        </div>
      </section>

      <section className="card stack">
        <h2>Water</h2>
        <p className="small muted" style={{ margin: 0 }}>The CDC minimum is 1 gallon per person per day. Water for preparing food is calculated separately, so it isn’t double-counted.</p>
        <div className="grid">
          {field('waterGallonsPerPersonPerDay', 'Drinking water per person per day (gallons)', { min: 0.5, step: 0.25 })}
          <label>Drinking-water reserve
            <select value={p.waterReserveDays} onChange={(e) => setP((x) => ({ ...x, waterReserveDays: e.target.value }))}>
              <option value="3">3 days (minimum)</option>
              <option value="14">14 days</option>
            </select>
          </label>
        </div>
      </section>

      <section className="card stack">
        <h2>Long-term food</h2>
        <label className="row" style={{ gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={noCanned} onChange={(e) => setNoCanned(e.target.checked)} style={{ width: 'auto' }} />
          Use freeze-dried and dry foods instead of canned in long-term plans
        </label>
        <span className="small muted">Applies when cooking is possible. The no-cook long-term plan still uses canned food, since freeze-dried meals mostly need hot water.</span>
      </section>

      <section className="card stack">
        <h2>Limits (optional)</h2>
        <div className="grid">
          {field('storageSpaceLiters', 'Storage space available (liters)', { optional: true, help: 'Plans warn if they won’t fit' })}
          {field('budget', 'Budget', { optional: true, step: 0.01, help: 'Only used for foods where you’ve entered a price' })}
        </div>
      </section>

      <section className="card stack">
        <h2>Inventory</h2>
        <div className="grid">
          <label>Warn about food expiring within (days)<input type="number" min={1} max={365} value={s.expiryWarningDays} onChange={(e) => setS((x) => ({ ...x, expiryWarningDays: e.target.value }))} />
            <span className="small muted" style={{ fontWeight: 400 }}>Shows on Home and Inventory so you can use it in everyday meals first.</span></label>
        </div>
      </section>

      <section className="card stack">
        <h2>Security &amp; backups</h2>
        <div className="grid">
          <label>Auto-lock Admin after (minutes idle)<input type="number" min={1} max={60} value={s.autoLockMinutes} onChange={(e) => setS((x) => ({ ...x, autoLockMinutes: e.target.value }))} /></label>
          <label>Remind me to back up every (days)<input type="number" min={1} max={90} value={s.backupReminderDays} onChange={(e) => setS((x) => ({ ...x, backupReminderDays: e.target.value }))} /></label>
        </div>
        <p className="small muted" style={{ margin: 0 }}>A new auto-lock time takes effect the next time the app is opened.</p>
      </section>

      {msg && <div className={`notice ${msg.ok ? 'ok' : 'danger'}`} role={msg.ok ? 'status' : 'alert'}>{msg.text}</div>}
      <div><button className="primary big">Save settings</button></div>
    </form>
  );
}

const TYPES: { v: CustomFieldType; l: string }[] = [
  { v: 'text', l: 'Text' }, { v: 'number', l: 'Number' }, { v: 'checkbox', l: 'Yes / no' },
  { v: 'single-select', l: 'Pick one' }, { v: 'multi-select', l: 'Pick several' },
];

function CustomFields() {
  const defs = useLiveQuery(() => db.customFields.toArray(), []);
  const [editing, setEditing] = useState<CustomFieldDefinition | 'new' | null>(null);
  return (
    <section className="card stack">
      <div className="spread">
        <h2 style={{ margin: 0 }}>Custom profile fields</h2>
        {!editing && <button onClick={() => setEditing('new')}>+ Add field</button>}
      </div>
      <p className="small muted" style={{ margin: 0 }}>Extra details to record on each person’s profile. Private fields are encrypted and left out of shared reports. Only collect what you need.</p>
      {defs?.length === 0 && !editing && <p className="muted">No custom fields yet.</p>}
      <div className="list">
        {defs?.map((d) => editing !== 'new' && editing?.id === d.id ? null : (
          <div key={d.id} className="spread">
            <span>
              <strong>{d.label}</strong> <span className="badge">{TYPES.find((t) => t.v === d.dataType)?.l}</span>{' '}
              <span className={`badge ${d.sensitivity === 'private' ? 'warn' : 'ok'}`}>{d.sensitivity === 'private' ? 'private' : 'can appear in reports'}</span>{' '}
              {!d.enabled && <span className="badge">hidden</span>}
              {d.options && <div className="small muted">{d.options.join(' · ')}</div>}
            </span>
            <button onClick={() => setEditing(d)}>Edit</button>
          </div>
        ))}
      </div>
      {editing && <FieldForm key={editing === 'new' ? 'new' : editing.id} def={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
    </section>
  );
}

function FieldForm({ def, onDone }: { def?: CustomFieldDefinition; onDone: () => void }) {
  const [label, setLabel] = useState(def?.label ?? '');
  const [dataType, setType] = useState<CustomFieldType>(def?.dataType ?? 'text');
  const [options, setOptions] = useState((def?.options ?? []).join(', '));
  const [sensitivity, setSens] = useState<CustomFieldDefinition['sensitivity']>(def?.sensitivity ?? 'private');
  const [enabled, setEnabled] = useState(def?.enabled ?? true);
  const [err, setErr] = useState('');
  const needsOptions = dataType === 'single-select' || dataType === 'multi-select';

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      await saveFieldDefinition({ id: def?.id, label, dataType, options: options.split(','), sensitivity, enabled });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <form className="card stack" style={{ background: 'var(--surface-2)' }} onSubmit={save}>
      <div className="grid">
        <label>Label<input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Favorite comfort food" autoFocus /></label>
        <label>Type
          <select value={dataType} onChange={(e) => setType(e.target.value as CustomFieldType)} disabled={!!def}>
            {TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
          {def && <span className="small muted" style={{ fontWeight: 400 }}>The type can’t change after values are entered.</span>}
        </label>
      </div>
      {needsOptions && <label>Options (comma-separated)<input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="e.g. Small, Medium, Large" /></label>}
      <label className="inline"><input type="checkbox" checked={sensitivity === 'private'} onChange={(e) => setSens(e.target.checked ? 'private' : 'reportable')} /> Private (encrypted; never in shared reports)</label>
      <label className="inline"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Show on profiles</label>
      {def && sensitivity !== def.sensitivity && <div className="notice small">Changing privacy applies to values saved from now on. Re-save existing values on each profile to convert them.</div>}
      {err && <div className="notice danger">{err}</div>}
      <div className="row"><button className="primary">Save field</button><button type="button" className="ghost" onClick={onDone}>Cancel</button></div>
    </form>
  );
}
