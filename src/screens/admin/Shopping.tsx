// Shopping list: one list shared by Inventory, Deals and every linked device. Check things off at
// the store; when done, each checked item is put into inventory with its details.
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { useSession } from '../../app/session';
import { fmtDay } from '../../app/ui';
import { usePlanChoice } from '../../app/planChoice';
import { db } from '../../data/db';
import { computePlan, TIER_LABEL } from '../../data/planRepo';
import { addStock } from '../../data/inventoryRepo';
import { addToShopping, clearChecked, removeShopping, updateShopping } from '../../data/shoppingRepo';
import { inventoryStatus } from '../../domain/inventory';
import type { ShoppingItem } from '../../domain/types';
import { AddForm, FoodStockForm, num, today, useWarnDays } from './stock';

const amount = (s: ShoppingItem) => (s.quantity === undefined ? '' : s.kind === 'water' ? `${num(s.quantity)} gal` : s.kind === 'other' ? num(s.quantity) : `${num(s.quantity)} × ${s.packageDesc || 'package'}`);

export default function Shopping() {
  const items = useLiveQuery(() => db.shopping.toArray(), []);
  const [putAway, setPutAway] = useState(false);
  const [msg, setMsg] = useState('');

  const groups = useMemo(() => {
    const list = [...(items ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    const m = new Map<string, ShoppingItem[]>();
    for (const s of list) { const k = s.sale?.store ?? ''; m.set(k, [...(m.get(k) ?? []), s]); }
    return [...m].sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : a[0].localeCompare(b[0])));
  }, [items]);
  const checked = (items ?? []).filter((s) => s.checked);

  const text = ['Shopping list', ...groups.flatMap(([store, ls]) => ['', (store || 'Any store').toUpperCase(),
    ...ls.map((s) => `- ${s.checked ? '[x] ' : ''}${s.name}${s.variety ? ` (${s.variety})` : ''}${amount(s) ? `: ${amount(s)}` : ''}${s.sale ? ` · ${s.sale.product} ${s.sale.price}` : ''}${s.note ? ` · ${s.note}` : ''}`)])].join('\n');
  async function share() {
    setMsg('');
    try {
      if (navigator.share) { await navigator.share({ title: 'Shopping list', text }); return; }
      await navigator.clipboard.writeText(text);
      setMsg('Copied. Paste it into a text or note.');
    } catch (x) {
      if (x instanceof Error && x.name === 'AbortError') return;
      setMsg('Couldn’t share from this device. Try Print instead.');
    }
  }

  if (!items) return <p className="muted">Loading…</p>;
  if (putAway && checked.length) return <PutAway items={checked} onClose={() => setPutAway(false)} />;

  return (
    <div className="stack">
      <div className="spread">
        <h1 style={{ margin: 0 }}>Shopping list</h1>
        <span className="row no-print" style={{ gap: 6 }}>
          {items.length > 0 && <button onClick={() => window.print()}>Print</button>}
          {items.length > 0 && <button onClick={share}>Share or copy</button>}
        </span>
      </div>
      {msg && <span className="small muted no-print">{msg}</span>}
      <p className="small muted no-print" style={{ margin: 0 }}>Add foods from <Link to="/admin/inventory?show=buy">Inventory</Link> or sales from <Link to="/admin/deals">Deals</Link>, or below. Check things off as you buy them; when you’re done, put them into inventory. The list is shared by every linked device.</p>

      {checked.length > 0 && (
        <div className="notice ok no-print">
          <div className="spread">
            <span><strong>{checked.length} checked off.</strong> Done shopping? Add {checked.length === 1 ? 'it' : 'them'} to inventory with best-by dates and kinds.</span>
            <button className="primary" onClick={() => setPutAway(true)}>Done shopping</button>
          </div>
        </div>
      )}

      {items.length === 0 && <div className="notice">The list is empty.</div>}
      {groups.map(([store, ls]) => (
        <section key={store} className="card stack" style={{ breakInside: 'avoid' }}>
          <h2 style={{ margin: 0 }}>{store || 'Any store'} <span className="small muted">({ls.length})</span></h2>
          <div className="list">{ls.map((s) => <Line key={s.id} s={s} />)}</div>
        </section>
      ))}

      <AddItem />
    </div>
  );
}

function Line({ s }: { s: ShoppingItem }) {
  return (
    <div className="spread" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', opacity: s.checked ? 0.6 : 1 }}>
      <label className="inline" style={{ alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
        <input type="checkbox" checked={s.checked} onChange={(e) => updateShopping(s.id, { checked: e.target.checked })} />
        <span>
          <strong style={{ textDecoration: s.checked ? 'line-through' : undefined }}>{s.name}</strong>
          {s.variety && <span> · {s.variety}</span>}
          {amount(s) && <span className="small muted"> · {amount(s)}</span>}
          {s.sale && <span className="small" style={{ display: 'block' }}>{s.sale.product} · <strong>{s.sale.price}</strong>{s.sale.through && <span className="muted"> · through {fmtDay(s.sale.through)}</span>}</span>}
          {s.note && <span className="small muted" style={{ display: 'block' }}>{s.note}</span>}
        </span>
      </label>
      <button className="ghost no-print" aria-label={`Take ${s.name} off the list`} style={{ minHeight: 36, padding: '0 10px', flex: 'none' }} onClick={() => removeShopping(s.id)}>✕</button>
    </div>
  );
}

/** Add a catalog food, water, something typed, or everything the chosen plan still needs. */
function AddItem() {
  const { dek } = useSession();
  const { tier, scenario } = usePlanChoice();
  const warnDays = useWarnDays();
  const foods = useLiveQuery(() => db.foods.toArray().then((f) => f.filter((x) => x.active).sort((a, b) => a.name.localeCompare(b.name))), []);
  const [what, setWhat] = useState('');
  const [typed, setTyped] = useState('');
  const [qty, setQty] = useState('1');
  const [err, setErr] = useState('');
  const [added, setAdded] = useState('');

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      const q = qty.trim() ? Number(qty) : undefined;
      if (what === 'water') await addToShopping({ kind: 'water', name: 'Water', quantity: q }, db);
      else if (what === 'other') await addToShopping({ kind: 'other', name: typed, quantity: q }, db);
      else {
        const f = foods?.find((x) => x.id === what);
        if (!f) throw new Error('Choose what to add');
        await addToShopping({ kind: 'food', foodId: f.id, name: f.name, quantity: q, packageDesc: f.package.description }, db);
      }
      setWhat(''); setTyped(''); setQty('1');
    } catch (x) { setErr(x instanceof Error ? x.message : String(x)); }
  }

  async function addAllToBuy() {
    setErr(''); setAdded('');
    const [plan, stock, all] = await Promise.all([computePlan(tier, scenario, dek), db.stock.toArray(), db.foods.toArray()]);
    const st = inventoryStatus(plan.result, stock, all, today(), warnDays);
    const rows = st.rows.filter((r) => r.toBuy > 0);
    for (const r of rows) await addToShopping({ kind: 'food', foodId: r.foodId, name: r.name, quantity: r.toBuy, packageDesc: r.packageDesc }, db);
    if (st.water.toBuyGallons > 0) await addToShopping({ kind: 'water', name: 'Water', quantity: Math.ceil(st.water.toBuyGallons) }, db);
    setAdded(rows.length || st.water.toBuyGallons > 0 ? `Added what the ${TIER_LABEL[tier].toLowerCase()} plan still needs (${rows.length} foods${st.water.toBuyGallons > 0 ? ' and water' : ''}).` : `The ${TIER_LABEL[tier].toLowerCase()} plan doesn’t need anything.`);
  }

  return (
    <section className="card stack no-print">
      <h2 style={{ margin: 0 }}>Add to the list</h2>
      <form className="row" style={{ alignItems: 'flex-end' }} onSubmit={add}>
        <label style={{ maxWidth: 320 }}>What
          <select value={what} onChange={(e) => setWhat(e.target.value)}>
            <option value="">Choose…</option>
            <option value="other">Something else (type it)</option>
            <option value="water">Water</option>
            {(foods ?? []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
        {what === 'other' && <label style={{ maxWidth: 260 }}>Item<input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="e.g. Paper towels" autoFocus /></label>}
        <label style={{ maxWidth: 140 }}>{what === 'water' ? 'Gallons' : what === 'other' ? 'How many (optional)' : 'Packages'}<input type="number" min={0} step="any" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></label>
        <button className="primary" disabled={!what}>Add</button>
      </form>
      <div className="row">
        <button onClick={addAllToBuy}>Add everything the {TIER_LABEL[tier].toLowerCase()} plan still needs</button>
        {added && <span className="small muted">{added}</span>}
      </div>
      {err && <span className="small" style={{ color: 'var(--danger)' }}>{err}</span>}
    </section>
  );
}

/** After shopping: each checked item gets a form to add it to inventory (amount, kind, size, best-by). */
function PutAway({ items, onClose }: { items: ShoppingItem[]; onClose: () => void }) {
  return (
    <div className="stack">
      <div className="spread">
        <h1 style={{ margin: 0 }}>Put it away</h1>
        <button className="ghost" onClick={onClose}>Back to the list</button>
      </div>
      <p className="muted" style={{ margin: 0 }}>Add each item to inventory with its best-by date (and kind, or the size you actually bought). Each one comes off the shopping list once it’s added.</p>
      {items.map((s) => (
        <section key={s.id} className="card stack">
          <div className="spread">
            <div><strong>{s.name}</strong>{s.variety && ` · ${s.variety}`} <span className="small muted">{amount(s)}{s.sale ? ` · ${s.sale.store}` : ''}</span></div>
            <button className="ghost small" onClick={() => updateShopping(s.id, { checked: false })}>Didn’t buy it</button>
          </div>
          {s.kind === 'food' && s.foodId ? (
            <FoodStockForm foodId={s.foodId} defaultQty={s.quantity ?? 1} defaultVariety={s.variety} onDone={() => removeShopping(s.id)} />
          ) : s.kind === 'water' ? (
            <AddForm unit="gallons" defaultQty={s.quantity ?? 1} dateLabel="Replace by (optional)" onAdd={async (q, bestBy) => { await addStock({ kind: 'water', quantity: q, bestBy }); await removeShopping(s.id); }} />
          ) : (
            <div className="row"><span className="small muted">Not tracked in inventory.</span><button onClick={() => removeShopping(s.id)}>Done, take it off the list</button></div>
          )}
        </section>
      ))}
      <div className="row">
        <button className="ghost" onClick={async () => { if (confirm('Take every checked item off the list without adding it to inventory?')) { await clearChecked(); onClose(); } }}>Clear checked items without adding</button>
      </div>
    </div>
  );
}
