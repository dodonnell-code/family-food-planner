import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '../data/db';
import { clearStock, consumeStock, undoStockChange } from '../data/inventoryRepo';
import { EXPIRING_SOON_DAYS, stockStatus, type StockStatus } from '../domain/inventory';
import { fmtDate, ThemeButton } from '../app/ui';
import type { StockEntry } from '../domain/types';

const num = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });
const today = () => new Date().toISOString().slice(0, 10);
const RANK: Record<StockStatus, number> = { expired: 0, expiring: 1, ok: 2 };

interface Item {
  key: string;
  name: string;
  /** "15 oz can", or "gal" for water. */
  unit: string;
  water: boolean;
  total: number;
  entries: StockEntry[];
  /** Soonest best-by among batches that aren't expired (or the expired one, if that's all). */
  bestBy?: string;
  status: StockStatus;
}

/**
 * Everything in stock, with quick "used" buttons. Open to anyone (no passphrase): it only takes
 * things out, never adds or changes plans, and shows nothing private.
 */
export function OnHandList() {
  const data = useLiveQuery(async () => {
    const [stock, foods, hh] = await Promise.all([db.stock.toArray(), db.foods.toArray(), db.households.toCollection().first()]);
    const warn = hh?.settings.expiryWarningDays ?? EXPIRING_SOON_DAYS;
    const t = today();
    const groups = new Map<string, StockEntry[]>();
    for (const e of stock) {
      if (e.kind === 'equipment') continue;
      const k = e.kind === 'water' ? 'water' : `food:${e.foodId}:${e.variety ?? ''}`;
      groups.set(k, [...(groups.get(k) ?? []), e]);
    }
    const items: Item[] = [...groups].map(([key, entries]) => {
      const water = key === 'water';
      const food = water ? undefined : foods.find((f) => f.id === entries[0].foodId);
      const variety = entries[0].variety;
      const statuses = entries.map((e) => ({ e, s: stockStatus(e, t, warn) }));
      const good = statuses.filter((x) => x.s !== 'expired');
      const pool = good.length ? good : statuses;
      const soonest = pool.filter((x) => x.e.bestBy).sort((a, b) => a.e.bestBy!.localeCompare(b.e.bestBy!))[0];
      const status = statuses.some((x) => x.s === 'expired') ? 'expired' : statuses.some((x) => x.s === 'expiring') ? 'expiring' : 'ok';
      return {
        key, water, entries,
        name: water ? 'Stored water' : `${food?.name ?? 'Food'}${variety ? `: ${variety}` : ''}`,
        unit: water ? 'gal' : food?.package.description ?? 'pkg',
        total: entries.reduce((s, e) => s + e.quantity, 0),
        bestBy: soonest?.e.bestBy,
        status,
      };
    });
    items.sort((a, b) => RANK[a.status] - RANK[b.status] || (a.status !== 'ok' ? (a.bestBy ?? '').localeCompare(b.bestBy ?? '') : 0) || a.name.localeCompare(b.name));
    return items;
  }, []);

  const [q, setQ] = useState('');
  const [usingKey, setUsingKey] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ text: string; before: StockEntry[] } | null>(null);
  const [err, setErr] = useState('');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  function done(text: string, before: StockEntry[]) {
    setErr('');
    setUndo({ text, before });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setUndo(null), 8000);
  }
  async function use(it: Item, qty: number) {
    try {
      const amount = Math.min(qty, it.total);
      const before = await consumeStock(it.entries, amount, today());
      done(`Took ${num(amount)} ${it.water ? 'gal of water' : `× ${it.name}`} out`, before);
      setUsingKey(null);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }
  async function allGone(it: Item) {
    const before = await clearStock(it.entries);
    done(`${it.name}: all gone`, before);
  }

  if (!data) return <p className="muted">Loading…</p>;
  const shown = data.filter((it) => it.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="stack">
      {data.length > 6 && (
        <label>Search<input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. chili" /></label>
      )}
      {data.length === 0 && <div className="notice">Nothing in stock yet. An adult adds food on the Inventory page as it’s bought.</div>}
      {data.length > 0 && shown.length === 0 && <p className="muted">Nothing matches “{q}”.</p>}
      {shown.length > 0 && <div className="list card" style={{ padding: '4px 16px' }}>
        {shown.map((it) => (
          <div key={it.key} className="stack" style={{ gap: 8 }}>
            <div className="spread">
              <div>
                <strong>{it.name}</strong>
                <div className="small muted">
                  {it.water ? `${num(it.total)} gallons` : `${num(it.total)} × ${it.unit}`}
                  {it.bestBy && ` · best by ${fmtDate(it.bestBy)}`}
                  {it.status !== 'ok' && <span className={`badge ${it.status === 'expired' ? 'danger' : 'warn'}`} style={{ marginLeft: 6 }}>{it.status === 'expired' ? 'expired' : 'use soon'}</span>}
                </div>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <button onClick={() => use(it, 1)}>{it.total < 1 ? 'Used it' : it.water ? 'Used 1 gal' : 'Used 1'}</button>
                <button className="ghost" aria-expanded={usingKey === it.key} onClick={() => setUsingKey(usingKey === it.key ? null : it.key)}>{usingKey === it.key ? 'Cancel' : 'More…'}</button>
              </div>
            </div>
            {usingKey === it.key && <UseSome item={it} onUse={(n) => use(it, n)} onAllGone={() => { setUsingKey(null); return allGone(it); }} />}
          </div>
        ))}
      </div>}
      {err && <div className="notice danger" role="alert">{err}</div>}
      {undo && (
        <div className="update-toast" role="status">
          <span>{undo.text}.</span>
          <button className="primary" onClick={async () => { await undoStockChange(undo.before); setUndo(null); }}>Undo</button>
        </div>
      )}
    </div>
  );
}

function UseSome({ item, onUse, onAllGone }: { item: Item; onUse: (n: number) => void; onAllGone: () => void }) {
  const [qty, setQty] = useState('');
  return (
    <form className="row" style={{ alignItems: 'flex-end', background: 'var(--surface-2)', padding: 12, borderRadius: 12 }}
      onSubmit={(e) => { e.preventDefault(); const n = Number(qty); if (n > 0) onUse(n); }}>
      <label style={{ maxWidth: 170 }}>How much was used ({item.water ? 'gallons' : 'packages'})
        <input type="number" min={0} step="any" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder={item.water ? 'e.g. 2' : 'e.g. 0.5'} autoFocus />
      </label>
      <button className="primary" disabled={!(Number(qty) > 0)}>Take out</button>
      <button type="button" className="danger" onClick={onAllGone}>All gone</button>
      <span className="small muted" style={{ flexBasis: '100%' }}>Half a package is 0.5. It comes off the batch that expires soonest.</span>
    </form>
  );
}

/** /on-hand: open to anyone from the welcome screen. */
export default function OnHand() {
  return (
    <main className="page">
      <div className="stack">
        <div className="spread">
          <h1 style={{ margin: 0 }}>What we have</h1>
          <Link to="/welcome" className="btn ghost">Done</Link>
        </div>
        <p className="muted" style={{ margin: 0 }}>When you use something from the emergency supply, mark it here so the family knows what to restock.</p>
        <OnHandList />
        <div><ThemeButton /></div>
      </div>
    </main>
  );
}
