// Forms for adding, editing and using stock, shared by Inventory and the Shopping list.
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { fmtDate } from '../../app/ui';
import { DateField, readTypedDate, typedDate } from '../../app/DateField';
import { db } from '../../data/db';
import { addStock, removeStock, updateStock } from '../../data/inventoryRepo';
import { EXPIRING_SOON_DAYS, stockStatus } from '../../domain/inventory';
import { packagesPer, parsePackageSize, SIZE_UNITS, unitLabel, type SizeUnit } from '../../domain/packageSize';
import type { FoodItem, StockEntry } from '../../domain/types';

export const num = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });
export const today = () => new Date().toISOString().slice(0, 10);
export const STATUS_BADGE = { ok: { t: '', c: 'ok' }, expiring: { t: 'use soon', c: 'warn' }, expired: { t: 'expired', c: 'danger' } } as const;

/** Days of warning before best-by (from Settings). */
export function useWarnDays(): number {
  return useLiveQuery(async () => (await db.households.toCollection().first())?.settings.expiryWarningDays ?? EXPIRING_SOON_DAYS, []) ?? EXPIRING_SOON_DAYS;
}

export function Entries({ entries, unit, foodId }: { entries: StockEntry[]; unit: string; foodId?: string }) {
  const warnDays = useWarnDays();
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div className="stack" style={{ gap: 6, paddingLeft: 12, borderLeft: '3px solid var(--border)' }}>
      {entries.map((e) => {
        const s = stockStatus(e, today(), warnDays);
        if (editing === e.id) {
          return foodId
            ? <FoodStockForm key={e.id} foodId={foodId} entry={e} defaultQty={e.quantity} onDone={() => setEditing(null)} />
            : <AddForm key={e.id} unit={unit === 'gal' ? 'gallons' : unit} defaultQty={e.quantity} defaultBestBy={e.bestBy} submitLabel="Save" dateLabel="Replace by (optional)"
                onAdd={async (q, bestBy) => { await updateStock(e.id, { quantity: q, bestBy }); setEditing(null); }} onCancel={() => setEditing(null)} />;
        }
        return (
          <div key={e.id} className="spread small">
            <span>{e.variety && <strong>{e.variety} · </strong>}{num(e.quantity)} {unit}{e.bought && <span className="muted"> (bought as {num(e.bought.count)} × {num(e.bought.size)} {unitLabel(e.bought.unit)})</span>} · {e.bestBy ? `best by ${fmtDate(e.bestBy)}` : 'no date'} · added {fmtDate(e.addedAt)} {s !== 'ok' && <span className={`badge ${STATUS_BADGE[s].c}`}>{STATUS_BADGE[s].t}</span>}</span>
            <span className="row" style={{ gap: 4 }}>
              <button aria-label="One fewer" style={{ minHeight: 36, padding: '0 12px' }} onClick={() => updateStock(e.id, { quantity: Math.max(0, e.quantity - 1) })}>−</button>
              <button aria-label="One more" style={{ minHeight: 36, padding: '0 12px' }} onClick={() => updateStock(e.id, { quantity: e.quantity + 1 })}>+</button>
              <button style={{ minHeight: 36 }} onClick={() => setEditing(e.id)}>Edit</button>
              <button className="ghost" style={{ minHeight: 36 }} onClick={() => removeStock(e.id)}>Remove</button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function AddForm({ unit, defaultQty, onAdd, dateLabel = 'Best-by date (optional)', defaultBestBy, submitLabel = 'Add to inventory', onCancel }: { unit: string; defaultQty: number; onAdd: (qty: number, bestBy?: string) => Promise<void>; dateLabel?: string; defaultBestBy?: string; submitLabel?: string; onCancel?: () => void }) {
  const [qty, setQty] = useState(String(defaultQty));
  const [bestBy, setBestBy] = useState(typedDate(defaultBestBy));
  const [err, setErr] = useState('');
  return (
    <form className="row" style={{ alignItems: 'flex-end', background: 'var(--surface-2)', padding: 12, borderRadius: 12 }}
      onSubmit={async (e) => { e.preventDefault(); setErr(''); try { await onAdd(Number(qty), readTypedDate(bestBy, 'date') || undefined); } catch (x) { setErr(x instanceof Error ? x.message : String(x)); } }}>
      <label style={{ maxWidth: 140 }}>How many {unit}<input type="number" min={0} step="any" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus /></label>
      <DateField label={dateLabel} value={bestBy} onChange={setBestBy} />
      <button className="primary">{submitLabel}</button>
      {onCancel && <button type="button" className="ghost" onClick={onCancel}>Cancel</button>}
      {err && <span className="small" style={{ color: 'var(--danger)' }}>{err}</span>}
    </form>
  );
}

/** Record food or water used in everyday meals; it comes off the batches that expire soonest. */
export function UseForm({ unit, max, onUse }: { unit: string; max: number; onUse: (qty: number) => Promise<void> }) {
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

/** "3 Black beans, 2 Pinto beans" when batches have kinds. */
export function varietySummary(entries: StockEntry[]): string {
  const by = new Map<string, number>();
  for (const e of entries) if (e.variety) by.set(e.variety, (by.get(e.variety) ?? 0) + e.quantity);
  return [...by].map(([v, q]) => `${num(q)} ${v}`).join(', ');
}

/**
 * Add food that was bought, or edit a batch (`entry`). Usually the plan's package ("42 oz
 * canister"); or a different size (e.g. 1 × 160 oz box), converted into plan packages (3.8).
 * Foods with kinds (Canned beans → Black, Pinto…) ask which kind; anything else can be typed.
 */
export function FoodStockForm({ foodId, entry, defaultQty, defaultVariety, onDone, onCancel, submitLabel }: { foodId: string; entry?: StockEntry; defaultQty: number; defaultVariety?: string; onDone: () => void; onCancel?: () => void; submitLabel?: string }) {
  const loaded = useLiveQuery(() => db.foods.get(foodId).then((f) => f ?? null), [foodId]);
  if (loaded === undefined) return null;
  return <FoodStockFormInner key={foodId} food={loaded ?? undefined} foodId={foodId} entry={entry} defaultQty={defaultQty} defaultVariety={defaultVariety} onDone={onDone} onCancel={onCancel} submitLabel={submitLabel} />;
}

function FoodStockFormInner({ food, foodId, entry, defaultQty, defaultVariety, onDone, onCancel, submitLabel }: { food?: FoodItem; foodId: string; entry?: StockEntry; defaultQty: number; defaultVariety?: string; onDone: () => void; onCancel?: () => void; submitLabel?: string }) {
  const pkgDesc = food?.package.description ?? 'package';
  const spp = food?.package.servingsPerPackage ?? 0;
  const parsed = parsePackageSize(pkgDesc);
  // The food's kinds, plus any typed in before for this food (so "Navy beans" is offered next time).
  const typedBefore = useLiveQuery(async () => (await db.stock.where('foodId').equals(foodId).toArray()).map((e) => e.variety).filter((v): v is string => !!v), [foodId]) ?? [];
  const kinds = [...(food?.kinds ?? []).map((k) => ({ id: k.id, name: k.name })),
    ...[...new Set(typedBefore)].filter((v) => !(food?.kinds ?? []).some((k) => k.name === v)).sort().map((v) => ({ id: `typed:${v}`, name: v }))];
  // Editing a batch bought in another size: show what's left in that size (e.g. 0.7 of the 160 oz box).
  const startBought = entry?.bought;
  const startPer = startBought ? packagesPer({ amount: startBought.size, unit: startBought.unit }, pkgDesc, spp) : undefined;
  const startCount = startBought && startPer && 'packages' in startPer ? Math.round((entry!.quantity / startPer.packages) * 100) / 100 : undefined;

  const [other, setOther] = useState(!!startBought);
  const [qty, setQty] = useState(String(startCount ?? defaultQty));
  const [size, setSize] = useState(startBought ? String(startBought.size) : '');
  const [unit, setUnit] = useState<SizeUnit>(startBought?.unit ?? (parsed && parsed.unit !== 'count' ? parsed.unit : parsed ? 'count' : 'servings'));
  const [bestBy, setBestBy] = useState(typedDate(entry?.bestBy));
  const startVariety = entry?.variety ?? defaultVariety;
  const known = !startVariety || kinds.some((k) => k.name === startVariety);
  const [variety, setVariety] = useState(startVariety && known ? startVariety : startVariety ? '__other' : '');
  const [typed, setTyped] = useState(startVariety && !known ? startVariety : '');
  const [err, setErr] = useState('');

  const count = Number(qty);
  const conv = other && size ? packagesPer({ amount: Number(size), unit }, pkgDesc, spp) : undefined;
  const total = conv && 'packages' in conv && count > 0 ? conv.packages * count : undefined;
  // A kind typed earlier shows as its own choice once the list of earlier kinds has loaded.
  const selected = variety === '__other' && kinds.some((k) => k.name === typed) ? typed : variety;
  const chosenVariety = (kinds.length ? (selected === '__other' ? typed : selected) : typed).trim() || undefined;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      const date = readTypedDate(bestBy, 'best-by date') || undefined;
      let quantity: number;
      let bought: StockEntry['bought'];
      if (!other) {
        if (!(count > 0)) throw new Error('Enter how many.');
        quantity = count;
      } else {
        if (!conv) throw new Error('Enter the size of each one.');
        if ('error' in conv) throw new Error(conv.error);
        if (!(count > 0)) throw new Error('Enter how many.');
        quantity = Math.round(total! * 1000) / 1000;
        bought = { count, size: Number(size), unit };
      }
      if (entry) await updateStock(entry.id, { quantity, bestBy: date, variety: chosenVariety, bought });
      else await addStock({ kind: 'food', foodId, quantity, bestBy: date, variety: chosenVariety, bought });
      onDone();
    } catch (x) { setErr(x instanceof Error ? x.message : String(x)); }
  }

  return (
    <form className="stack" style={{ gap: 10, background: 'var(--surface-2)', padding: 12, borderRadius: 12 }} onSubmit={submit}>
      {entry && <strong className="small">Edit this batch</strong>}
      <div className="row" style={{ alignItems: 'flex-end' }}>
        {kinds.length > 0 ? (
          <label style={{ maxWidth: 260 }}>Which kind
            <select value={selected} onChange={(e) => { setVariety(e.target.value); if (e.target.value !== '__other') setTyped(''); }}>
              <option value="">Not specified</option>
              {kinds.map((k) => <option key={k.id} value={k.name}>{k.name}</option>)}
              <option value="__other">Something else…</option>
            </select>
          </label>
        ) : null}
        {(kinds.length === 0 || selected === '__other') && (
          <label style={{ maxWidth: 260 }}>{kinds.length ? 'Kind' : 'Kind or flavor (optional)'}
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={kinds.length ? 'e.g. Navy beans' : 'e.g. Original'} />
          </label>
        )}
      </div>
      <div className="row" role="radiogroup" aria-label="Package size" style={{ gap: 6 }}>
        <button type="button" role="radio" aria-checked={!other} className={!other ? 'primary' : ''} onClick={() => setOther(false)}>{pkgDesc}</button>
        <button type="button" role="radio" aria-checked={other} className={other ? 'primary' : ''} onClick={() => setOther(true)}>Different size</button>
      </div>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label style={{ maxWidth: 160 }}>How many{entry ? ' (left)' : ''}{other ? '' : ` (${pkgDesc})`}<input type="number" min={0} step="any" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus={!entry} /></label>
        {other && (
          <>
            <label style={{ maxWidth: 140 }}>Size of each<input type="number" min={0} step="any" inputMode="decimal" value={size} onChange={(e) => setSize(e.target.value)} placeholder="e.g. 160" /></label>
            <label style={{ maxWidth: 240 }}>Unit
              <select value={unit} onChange={(e) => setUnit(e.target.value as SizeUnit)}>
                {SIZE_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            </label>
          </>
        )}
        <DateField label="Best-by date (optional)" value={bestBy} onChange={setBestBy} />
      </div>
      {other && conv && 'error' in conv && <span className="small" style={{ color: 'var(--danger)' }}>{conv.error}</span>}
      {other && total !== undefined && (
        <span className="small"><strong>= {num(total)} × {pkgDesc}</strong>{spp ? ` (about ${Math.round(total * spp)} servings)` : ''}</span>
      )}
      <div className="row">
        <button className="primary">{submitLabel ?? (entry ? 'Save' : 'Add to inventory')}</button>
        {(entry || onCancel) && <button type="button" className="ghost" onClick={onCancel ?? onDone}>Cancel</button>}
      </div>
      {err && <span className="small" style={{ color: 'var(--danger)' }}>{err}</span>}
    </form>
  );
}
