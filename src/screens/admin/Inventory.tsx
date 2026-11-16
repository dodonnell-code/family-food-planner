import { createContext, useContext, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/session';
import { fmtDate } from '../../app/ui';
import { db } from '../../data/db';
import { computePlan, defaultScenario, SCENARIO_LABEL, TIER_LABEL } from '../../data/planRepo';
import { addStock, consumeStock, removeStock, setEquipmentHave, updateStock } from '../../data/inventoryRepo';
import { EXPIRING_SOON_DAYS, inventoryStatus, stockStatus, type NeedRow } from '../../domain/inventory';

/** Days of warning before best-by (from Settings). */
const WarnDays = createContext(EXPIRING_SOON_DAYS);
import type { FoodItem, Scenario, StockEntry, Tier } from '../../domain/types';

const TIERS: Tier[] = ['short', 'medium', 'long'];
const SCENARIOS: Scenario[] = ['no-cook', 'limited-cook'];
const num = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });
const today = () => new Date().toISOString().slice(0, 10);
const STATUS_BADGE = { ok: { t: '', c: 'ok' }, expiring: { t: 'use soon', c: 'warn' }, expired: { t: 'expired', c: 'danger' } } as const;

export default function Inventory() {
  const { dek } = useSession();
  const [params, setParams] = useSearchParams();
  const tier = (TIERS.includes(params.get('tier') as Tier) ? params.get('tier') : 'short') as Tier;
  const scenario = (SCENARIOS.includes(params.get('scenario') as Scenario) ? params.get('scenario') : defaultScenario(tier)) as Scenario;

  const plan = useLiveQuery(() => computePlan(tier, scenario, dek), [tier, scenario, dek]);
  const stock = useLiveQuery(() => db.stock.toArray(), []);
  const foods = useLiveQuery(() => db.foods.toArray(), []);
  const hh = useLiveQuery(() => db.households.toCollection().first(), []);
  const warnDays = hh?.settings.expiryWarningDays ?? EXPIRING_SOON_DAYS;
  const status = useMemo(() => (plan && stock && foods ? inventoryStatus(plan.result, stock, foods, today(), warnDays) : undefined), [plan, stock, foods, warnDays]);
  const [showStocked, setShowStocked] = useState(false);

  const toBuy = status?.rows.filter((r) => r.toBuy > 0) ?? [];
  const stocked = status?.rows.filter((r) => r.toBuy === 0) ?? [];

  return (
    <WarnDays.Provider value={warnDays}>
    <div className="stack">
      <div className="spread">
        <h1 style={{ margin: 0 }}>Inventory</h1>
        <Link to={`/admin/reports?tier=${tier}&scenario=${scenario}&stillToBuy=1`} className="small">Print what’s still to buy</Link>
      </div>
      <div className="row">
        <span className="small muted">Compare with:</span>
        {TIERS.map((t) => (
          <button key={t} role="tab" aria-selected={tier === t} className={tier === t ? 'primary' : ''} onClick={() => setParams({ tier: t, scenario: defaultScenario(t) }, { replace: true })}>{TIER_LABEL[t]}</button>
        ))}
        <select aria-label="Scenario" value={scenario} onChange={(e) => setParams({ tier, scenario: e.target.value }, { replace: true })} style={{ maxWidth: 200 }}>
          {SCENARIOS.map((s) => <option key={s} value={s}>{SCENARIO_LABEL[s]}</option>)}
        </select>
      </div>

      {!status || !plan ? <p className="muted">Loading…</p> : plan.input.members.length === 0 ? (
        <div className="notice">Add your family on <Link to="/admin/members">Members</Link> first; the plan sets what you need.</div>
      ) : (
        <>
          <Stages stock={stock!} foods={foods!} warnDays={warnDays} dek={dek} />
          <div className="stats">
            <div className="card stat"><span className="small muted">Calories on hand</span><strong>{Math.round((status.totals.coveredCalories / Math.max(1, status.totals.plannedCalories)) * 100)}%</strong><span className="small muted">of the {plan.result.days}-day plan</span></div>
            <div className="card stat"><span className="small muted">Packages</span><strong>{status.totals.havePackages} / {status.totals.needPackages}</strong><span className="small muted">on hand / needed</span></div>
            <div className="card stat"><span className="small muted">Still to buy</span><strong>{status.totals.toBuyPackages}</strong><span className="small muted">packages, {toBuy.length} foods</span></div>
            <div className="card stat"><span className="small muted">Water</span><strong>{num(status.water.haveGallons)} / {num(status.water.needGallons)} gal</strong><span className="small muted">{status.water.toBuyGallons > 0 ? `${num(status.water.toBuyGallons)} gal to go` : 'covered'}</span></div>
          </div>

          {status.rotation.length > 0 && (
            <section className="card stack">
              <h2 style={{ margin: 0 }}>Rotate or replace</h2>
              <p className="small muted" style={{ margin: 0 }}>Items within {warnDays} days of their best-by date, or past it (change the warning time in Settings). Expired items don’t count as on hand. Use soon-to-expire food in everyday meals and buy replacements.</p>
              <div className="list">
                {status.rotation.map(({ entry, name, status: s }) => (
                  <div key={entry.id} className="spread">
                    <span><strong>{name}</strong> · {num(entry.quantity)} {entry.kind === 'water' ? 'gal' : 'pkg'} · best by {fmtDate(entry.bestBy!)} <span className={`badge ${STATUS_BADGE[s].c}`}>{STATUS_BADGE[s].t}</span></span>
                    <button className="ghost" onClick={() => removeStock(entry.id)}>Used or thrown out</button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="card stack">
            <h2 style={{ margin: 0 }}>Still to buy</h2>
            {toBuy.length === 0 ? <div className="notice ok">Everything in this plan is on hand.</div> : (
              <div className="list">{toBuy.map((r) => <FoodRow key={r.foodId} r={r} />)}</div>
            )}
          </section>

          {stocked.length > 0 && (
            <section className="card stack">
              <button className="ghost" style={{ justifyContent: 'space-between' }} aria-expanded={showStocked} onClick={() => setShowStocked(!showStocked)}>
                <span><strong>Fully stocked</strong> ({stocked.length})</span><span aria-hidden>{showStocked ? '▴' : '▾'}</span>
              </button>
              {showStocked && <div className="list">{stocked.map((r) => <FoodRow key={r.foodId} r={r} />)}</div>}
            </section>
          )}

          <section className="card stack">
            <h2 style={{ margin: 0 }}>Also on hand</h2>
            <p className="small muted" style={{ margin: 0 }}>Food you have that this plan doesn’t use. It may be in another plan, or something to use up.</p>
            {status.extras.length > 0 && <div className="list">{status.extras.map((r) => <FoodRow key={r.foodId} r={r} />)}</div>}
            <AddOther foods={(foods ?? []).filter((f) => f.active).sort((a, b) => a.name.localeCompare(b.name))} />
          </section>

          <Water need={status.water.needGallons} entries={status.water.entries} />

          <section className="card stack">
            <h2 style={{ margin: 0 }}>Equipment</h2>
            <div className="list">
              {status.equipment.map((e) => (
                <label key={e.item} className="inline" style={{ alignItems: 'flex-start' }}>
                  <input type="checkbox" checked={e.have} onChange={(ev) => setEquipmentHave(e.item, ev.target.checked)} />
                  <span>{e.item}{e.foods.length > 0 && <span className="small muted"> (for {e.foods.length > 3 ? `${e.foods.slice(0, 3).join(', ')} and ${e.foods.length - 3} more` : e.foods.join(', ')})</span>}</span>
                </label>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
    </WarnDays.Provider>
  );
}

function FoodRow({ r }: { r: NeedRow }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'add' | 'use' | null>(null);
  const onHand = r.entries.reduce((t, e) => t + e.quantity, 0);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="spread">
        <div>
          <strong>{r.name}</strong>{r.reserved && <span className="badge" style={{ marginLeft: 6 }}>individual need</span>}
          <div className="small muted">
            {r.need > 0 ? `Need ${r.need} × ${r.packageDesc} · have ${num(r.have)}` : `${num(r.have)} × ${r.packageDesc} on hand`}
            {r.expiring > 0 && <span className="badge warn" style={{ marginLeft: 6 }}>{num(r.expiring)} use soon</span>}
            {r.expired > 0 && <span className="badge danger" style={{ marginLeft: 6 }}>{num(r.expired)} expired</span>}
          </div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {r.toBuy > 0 && <strong style={{ fontSize: '1.1rem' }}>Buy {r.toBuy}</strong>}
          <button onClick={() => setMode(mode === 'add' ? null : 'add')}>{mode === 'add' ? 'Cancel' : r.toBuy > 0 ? 'Bought some' : 'Add'}</button>
          {onHand > 0 && <button onClick={() => setMode(mode === 'use' ? null : 'use')}>{mode === 'use' ? 'Cancel' : 'Used some'}</button>}
          {r.entries.length > 0 && <button className="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide' : `Batches (${r.entries.length})`}</button>}
        </div>
      </div>
      {mode === 'add' && <AddForm unit="packages" defaultQty={r.toBuy || 1} onAdd={async (q, bestBy) => { await addStock({ kind: 'food', foodId: r.foodId, quantity: q, bestBy }); setMode(null); }} />}
      {mode === 'use' && <UseForm unit="packages" max={onHand} onUse={async (q) => { await consumeStock(r.entries, q, today()); setMode(null); }} />}
      {open && <Entries entries={r.entries} unit="pkg" />}
    </div>
  );
}

function Entries({ entries, unit }: { entries: StockEntry[]; unit: string }) {
  const warnDays = useContext(WarnDays);
  return (
    <div className="stack" style={{ gap: 6, paddingLeft: 12, borderLeft: '3px solid var(--border)' }}>
      {entries.map((e) => {
        const s = stockStatus(e, today(), warnDays);
        return (
          <div key={e.id} className="spread small">
            <span>{num(e.quantity)} {unit} · {e.bestBy ? `best by ${fmtDate(e.bestBy)}` : 'no date'} · added {fmtDate(e.addedAt)} {s !== 'ok' && <span className={`badge ${STATUS_BADGE[s].c}`}>{STATUS_BADGE[s].t}</span>}</span>
            <span className="row" style={{ gap: 4 }}>
              <button aria-label="One fewer" style={{ minHeight: 36, padding: '0 12px' }} onClick={() => updateStock(e.id, { quantity: Math.max(0, e.quantity - 1) })}>−</button>
              <button aria-label="One more" style={{ minHeight: 36, padding: '0 12px' }} onClick={() => updateStock(e.id, { quantity: e.quantity + 1 })}>+</button>
              <button className="ghost" style={{ minHeight: 36 }} onClick={() => removeStock(e.id)}>Remove</button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function AddForm({ unit, defaultQty, onAdd, dateLabel = 'Best-by date (optional)' }: { unit: string; defaultQty: number; onAdd: (qty: number, bestBy?: string) => Promise<void>; dateLabel?: string }) {
  const [qty, setQty] = useState(String(defaultQty));
  const [bestBy, setBestBy] = useState('');
  const [err, setErr] = useState('');
  return (
    <form className="row" style={{ alignItems: 'flex-end', background: 'var(--surface-2)', padding: 12, borderRadius: 12 }}
      onSubmit={async (e) => { e.preventDefault(); setErr(''); try { await onAdd(Number(qty), bestBy || undefined); } catch (x) { setErr(x instanceof Error ? x.message : String(x)); } }}>
      <label style={{ maxWidth: 140 }}>How many {unit}<input type="number" min={0} step="any" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus /></label>
      <label style={{ maxWidth: 220 }}>{dateLabel}<input type="date" value={bestBy} onChange={(e) => setBestBy(e.target.value)} /></label>
      <button className="primary">Add to inventory</button>
      {err && <span className="small" style={{ color: 'var(--danger)' }}>{err}</span>}
    </form>
  );
}

/** Record food or water used in everyday meals; it comes off the batches that expire soonest. */
function UseForm({ unit, max, onUse }: { unit: string; max: number; onUse: (qty: number) => Promise<void> }) {
  const [qty, setQty] = useState('1');
  const [err, setErr] = useState('');
  return (
    <form className="row" style={{ alignItems: 'flex-end', background: 'var(--surface-2)', padding: 12, borderRadius: 12 }}
      onSubmit={async (e) => { e.preventDefault(); setErr(''); try { await onUse(Number(qty)); } catch (x) { setErr(x instanceof Error ? x.message : String(x)); } }}>
      <label style={{ maxWidth: 160 }}>How many {unit} used<input type="number" min={0} max={max} step="any" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus /></label>
      <button className="primary">Take out of inventory</button>
      <span className="small muted">{num(max)} on hand. Comes off the batch that expires soonest.</span>
      {err && <span className="small" style={{ color: 'var(--danger)' }}>{err}</span>}
    </form>
  );
}

function AddOther({ foods }: { foods: { id: string; name: string }[] }) {
  const [foodId, setFoodId] = useState('');
  return (
    <div className="stack" style={{ gap: 8 }}>
      <label style={{ maxWidth: 420 }}>Add another food
        <select value={foodId} onChange={(e) => setFoodId(e.target.value)}>
          <option value="">Choose a catalog food…</option>
          {foods.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </label>
      {foodId && <AddForm key={foodId} unit="packages" defaultQty={1} onAdd={async (q, bestBy) => { await addStock({ kind: 'food', foodId, quantity: q, bestBy }); setFoodId(''); }} />}
    </div>
  );
}

function Water({ need, entries }: { need: number; entries: StockEntry[] }) {
  const [mode, setMode] = useState<'add' | 'use' | null>(null);
  const onHand = entries.reduce((t, e) => t + e.quantity, 0);
  return (
    <section className="card stack">
      <div className="spread">
        <h2 style={{ margin: 0 }}>Water</h2>
        <span className="row" style={{ gap: 6 }}>
          <button onClick={() => setMode(mode === 'add' ? null : 'add')}>{mode === 'add' ? 'Cancel' : 'Add water'}</button>
          {onHand > 0 && <button onClick={() => setMode(mode === 'use' ? null : 'use')}>{mode === 'use' ? 'Cancel' : 'Used some'}</button>}
        </span>
      </div>
      <p className="small muted" style={{ margin: 0 }}>This plan needs about {num(need)} gallons (drinking plus preparing food). Store-bought water: use the date on the label. Water you bottle yourself: replace about every 6 months.</p>
      {mode === 'add' && <AddForm unit="gallons" defaultQty={Math.max(1, Math.ceil(need))} dateLabel="Replace by (optional)" onAdd={async (q, bestBy) => { await addStock({ kind: 'water', quantity: q, bestBy }); setMode(null); }} />}
      {mode === 'use' && <UseForm unit="gallons" max={onHand} onUse={async (q) => { await consumeStock(entries, q, today()); setMode(null); }} />}
      {entries.length > 0 && <Entries entries={entries} unit="gal" />}
    </section>
  );
}

/** Progress toward each supply. They're nested, so food on hand counts toward all three. */
function Stages({ stock, foods, warnDays, dek }: { stock: StockEntry[]; foods: FoodItem[]; warnDays: number; dek: CryptoKey | null }) {
  const plans = useLiveQuery(() => Promise.all(TIERS.map((t) => computePlan(t, defaultScenario(t), dek))), [dek]);
  if (!plans) return null;
  return (
    <section className="card stack" aria-label="Progress by supply">
      <h2 style={{ margin: 0 }}>Progress</h2>
      <p className="small muted" style={{ margin: 0 }}>The supplies build on each other: the {plans[0].result.days}-day supply is part of the {plans[1].result.days}-day one, and both are part of the {plans[2].result.days}-day one. Everything on hand counts toward all three, so fill them in order.</p>
      {plans.map(({ result }, i) => {
        const st = inventoryStatus(result, stock, foods, today(), warnDays);
        const pct = Math.min(100, Math.round((st.totals.coveredCalories / Math.max(1, st.totals.plannedCalories)) * 100));
        return (
          <div key={TIERS[i]} className="stack" style={{ gap: 4 }}>
            <div className="spread small"><strong>{TIER_LABEL[TIERS[i]]} · {result.days} days</strong><span className="muted">{pct}% of calories on hand · {st.totals.toBuyPackages} packages to go</span></div>
            <div style={{ height: 10, borderRadius: 5, background: 'var(--surface-2)', overflow: 'hidden' }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${TIER_LABEL[TIERS[i]]} progress`}>
              <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)' }} />
            </div>
          </div>
        );
      })}
    </section>
  );
}
