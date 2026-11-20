// Inventory: every food the plan needs and everything on hand, in one list. Add what was bought,
// mark what was used, edit or remove batches. Progress and rotation are on the Dashboard.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/session';
import { PlanPicker, usePlanChoice } from '../../app/planChoice';
import { db } from '../../data/db';
import { computePlan } from '../../data/planRepo';
import { addStock, clearStock, consumeStock, setEquipmentHave, undoStockChange } from '../../data/inventoryRepo';
import { addToShopping, removeShopping } from '../../data/shoppingRepo';
import { inventoryStatus, type NeedRow } from '../../domain/inventory';
import type { ShoppingItem, StockEntry } from '../../domain/types';
import { AddForm, Entries, FoodStockForm, num, today, UseForm, useWarnDays, varietySummary } from './stock';

type Show = 'all' | 'buy' | 'have';
const SHOWS: [Show, string][] = [['all', 'All'], ['buy', 'To buy'], ['have', 'On hand']];

export default function Inventory() {
  const { dek } = useSession();
  const { tier, scenario } = usePlanChoice();
  const [params, setParams] = useSearchParams();
  const show = (SHOWS.some(([k]) => k === params.get('show')) ? params.get('show') : 'all') as Show;

  const plan = useLiveQuery(() => computePlan(tier, scenario, dek), [tier, scenario, dek]);
  const stock = useLiveQuery(() => db.stock.toArray(), []);
  const foods = useLiveQuery(() => db.foods.toArray(), []);
  const warnDays = useWarnDays();
  const status = useMemo(() => (plan && stock && foods ? inventoryStatus(plan.result, stock, foods, today(), warnDays) : undefined), [plan, stock, foods, warnDays]);
  const [q, setQ] = useState('');
  const undo = useUndo();
  // What's on the shopping list (not yet bought), by food id ('water' for water).
  const shopping = useLiveQuery(() => db.shopping.filter((s) => !s.checked).toArray(), []);
  const onList = useMemo(() => { const m = new Map<string, ShoppingItem[]>(); for (const s of shopping ?? []) { const k = s.kind === 'water' ? 'water' : s.foodId ?? ''; m.set(k, [...(m.get(k) ?? []), s]); } return m; }, [shopping]);

  const all = useMemo(() => (status ? [...status.rows, ...status.extras].sort((a, b) => a.name.localeCompare(b.name)) : []), [status]);
  const counts: Record<Show, number> = { all: all.length, buy: all.filter((r) => r.toBuy > 0).length, have: all.filter((r) => r.entries.length > 0).length };
  const shown = all.filter((r) => (show === 'buy' ? r.toBuy > 0 : show === 'have' ? r.entries.length > 0 : true) && r.name.toLowerCase().includes(q.trim().toLowerCase()));
  const emptyText = q ? `Nothing matches “${q}”.` : show === 'buy' ? 'Everything in this plan is on hand.' : 'Nothing here yet.';

  return (
    <div className="stack">
      <div className="spread">
        <h1 style={{ margin: 0 }}>Inventory</h1>
        <span className="row small" style={{ gap: 12 }}><Link to="/admin/shopping">Shopping list{shopping?.length ? ` (${shopping.length})` : ''}</Link><Link to={`/admin/deals?tier=${tier}&scenario=${scenario}`}>Find deals</Link><Link to={`/admin/reports?tier=${tier}&scenario=${scenario}&stillToBuy=1`}>Print what’s still to buy</Link></span>
      </div>
      <PlanPicker />

      {!status || !plan ? <p className="muted">Loading…</p> : plan.input.members.length === 0 ? (
        <div className="notice">Add your family on <Link to="/admin/members">Members</Link> first; the plan sets what you need.</div>
      ) : (
        <>
          <section className="card stack">
            <div className="row" role="tablist" aria-label="Show" style={{ gap: 6 }}>
              {SHOWS.map(([k, label]) => (
                <button key={k} role="tab" aria-selected={show === k} className={show === k ? 'primary' : ''} onClick={() => setParams(k === 'all' ? {} : { show: k }, { replace: true })}>{label} ({counts[k]})</button>
              ))}
            </div>
            <label>Search<input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. beans" /></label>
            {shown.length === 0 ? <p className="muted" style={{ margin: 0 }}>{emptyText}</p> : (
              <div className="list">{shown.map((r) => <FoodRow key={r.foodId} r={r} undo={undo.show} listed={onList.get(r.foodId)} />)}</div>
            )}
            <AddOther foods={(foods ?? []).filter((f) => f.active).sort((a, b) => a.name.localeCompare(b.name))} />
          </section>

          <Water need={status.water.needGallons} toBuy={status.water.toBuyGallons} entries={status.water.entries} listed={onList.get('water')} />

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
      {undo.toast}
    </div>
  );
}

/** Taking stock out can be undone for a few seconds. */
function useUndo() {
  const [state, setState] = useState<{ text: string; before: StockEntry[] } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const show = (text: string, before: StockEntry[]) => {
    setState({ text, before });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState(null), 8000);
  };
  const toast = state && (
    <div className="update-toast" role="status">
      <span>{state.text}.</span>
      <button className="primary" onClick={async () => { await undoStockChange(state.before); setState(null); }}>Undo</button>
    </div>
  );
  return { show, toast };
}

/** "Add to list" / "On list" (tap again to take it off). */
function ListButton({ listed, add }: { listed?: ShoppingItem[]; add: () => Promise<unknown> }) {
  return listed?.length
    ? <button className="primary" aria-pressed onClick={() => Promise.all(listed.map((s) => removeShopping(s.id)))} title="On the shopping list. Tap to take it off.">✓ On list</button>
    : <button aria-pressed={false} onClick={add}>+ List</button>;
}

function FoodRow({ r, undo, listed }: { r: NeedRow; undo: (text: string, before: StockEntry[]) => void; listed?: ShoppingItem[] }) {
  const [mode, setMode] = useState<'add' | 'details' | null>(null);
  const onHand = r.entries.reduce((t, e) => t + e.quantity, 0);
  const kinds = varietySummary(r.entries);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="spread">
        <div>
          <strong>{r.name}</strong>{r.reserved && <span className="badge" style={{ marginLeft: 6 }}>individual need</span>}
          <div className="small muted">
            {r.need > 0 ? `Need ${r.need} × ${r.packageDesc} · have ${num(r.have)}` : `${num(onHand)} × ${r.packageDesc} on hand · not in this plan`}
            {r.expiring > 0 && <span className="badge warn" style={{ marginLeft: 6 }}>{num(r.expiring)} use soon</span>}
            {r.expired > 0 && <span className="badge danger" style={{ marginLeft: 6 }}>{num(r.expired)} expired</span>}
          </div>
          {kinds && <div className="small muted">{kinds}</div>}
        </div>
        <div className="row" style={{ gap: 6 }}>
          {r.toBuy > 0 ? <strong style={{ fontSize: '1.1rem' }}>Buy {r.toBuy}</strong> : r.need > 0 && <span className="badge ok">✓ stocked</span>}
          <button onClick={() => setMode(mode === 'add' ? null : 'add')}>{mode === 'add' ? 'Cancel' : 'Add'}</button>
          <ListButton listed={listed} add={() => addToShopping({ kind: 'food', foodId: r.foodId, name: r.name, quantity: r.toBuy || 1, packageDesc: r.packageDesc })} />
          {onHand > 0 && <button onClick={async () => { const amt = Math.min(1, onHand); undo(`Took ${num(amt)} × ${r.name} out`, await consumeStock(r.entries, amt, today())); }}>Used 1</button>}
          {onHand > 0 && <button className="ghost" aria-expanded={mode === 'details'} onClick={() => setMode(mode === 'details' ? null : 'details')}>{mode === 'details' ? 'Hide' : `Details (${r.entries.length})`}</button>}
        </div>
      </div>
      {mode === 'add' && <FoodStockForm foodId={r.foodId} defaultQty={r.toBuy || 1} onDone={() => setMode(null)} />}
      {mode === 'details' && (
        <div className="stack" style={{ gap: 8 }}>
          <UseForm unit="packages" max={onHand} onUse={async (q) => { undo(`Took ${num(q)} × ${r.name} out`, await consumeStock(r.entries, q, today())); }} />
          <Entries entries={r.entries} unit="pkg" foodId={r.foodId} />
          <div><button className="danger" onClick={async () => { setMode(null); undo(`${r.name}: all gone`, await clearStock(r.entries)); }}>All gone (remove every batch)</button></div>
        </div>
      )}
    </div>
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
      <span className="small muted">Not in the list? <Link to="/admin/catalog/new">Add it to the Catalog</Link>, then add it here.</span>
      {foodId && <FoodStockForm key={foodId} foodId={foodId} defaultQty={1} onDone={() => setFoodId('')} />}
    </div>
  );
}

function Water({ need, toBuy, entries, listed }: { need: number; toBuy: number; entries: StockEntry[]; listed?: ShoppingItem[] }) {
  const [mode, setMode] = useState<'add' | 'use' | null>(null);
  const onHand = entries.reduce((t, e) => t + e.quantity, 0);
  return (
    <section className="card stack">
      <div className="spread">
        <h2 style={{ margin: 0 }}>Water</h2>
        <span className="row" style={{ gap: 6 }}>
          <button onClick={() => setMode(mode === 'add' ? null : 'add')}>{mode === 'add' ? 'Cancel' : 'Add water'}</button>
          <ListButton listed={listed} add={() => addToShopping({ kind: 'water', name: 'Water', quantity: Math.max(1, Math.ceil(toBuy)) })} />
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
