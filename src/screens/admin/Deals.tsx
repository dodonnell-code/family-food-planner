// Deals: what's on sale this week, near you, for everything still to buy. Flyer data comes
// from Flipp by zip code. The zip stays on this device; "Use my location" looks it up once.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { useSession } from '../../app/session';
import { fmtDay } from '../../app/ui';
import { PlanPicker, usePlanChoice } from '../../app/planChoice';
import type { Scenario, Tier } from '../../domain/types';
import { addToShopping, removeSale, saleOf } from '../../data/shoppingRepo';
import { db } from '../../data/db';
import { clearFlyerCache, runPooled, searchFlyers, storeProducts } from '../../data/flyers';
import { computePlan } from '../../data/planRepo';
import { EXPIRING_SOON_DAYS, inventoryStatus } from '../../domain/inventory';
import { bestSale, flyerTerms, isMyStore, MY_STORES, ONLINE_STORES, onlineSales, salesFor, unitText, validZip, WATER_TERMS, type FlyerItem, type OnlineSale, type Sale } from '../../domain/deals';
const ZIP_KEY = 'deals.zip';
const MINE_KEY = 'deals.myStoresOnly';
const num = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });

function load(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function save(key: string, v: string | null) {
  try { if (v) localStorage.setItem(key, v); else localStorage.removeItem(key); } catch { /* storage blocked: just not remembered */ }
}

/** Ask the device where it is, then look up the zip (BigDataCloud's free client-side lookup). */
async function zipFromDevice(): Promise<string> {
  if (!('geolocation' in navigator)) throw new Error('This device can’t share its location. Type a zip code instead.');
  const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, (e) => reject(new Error(e.code === e.PERMISSION_DENIED ? 'Location permission was turned down. Type a zip code instead.' : 'Couldn’t get your location. Type a zip code instead.')), { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 }));
  const { latitude, longitude } = pos.coords;
  const res = await fetch(`https://api-bdc.io/data/reverse-geocode-client?latitude=${latitude.toFixed(3)}&longitude=${longitude.toFixed(3)}&localityLanguage=en`);
  if (!res.ok) throw new Error('Couldn’t look up the zip code. Type it instead.');
  const data = (await res.json()) as { countryCode?: string; postcode?: string };
  const zip = (data.postcode ?? '').slice(0, 5);
  if (data.countryCode !== 'US' || !validZip(zip)) throw new Error('Couldn’t find a US zip code for this location. Type it instead.');
  return zip;
}

interface Need { key: string; name: string; need: string; reserved?: boolean; terms: string[]; qty: number; packageDesc?: string }
type Results = Record<string, Sale[]>;

/** A different plan means different foods to search: start the page over. */
export default function Deals() {
  const { tier, scenario } = usePlanChoice();
  return <DealsFor key={`${tier}:${scenario}`} tier={tier} scenario={scenario} />;
}

function DealsFor({ tier, scenario }: { tier: Tier; scenario: Scenario }) {
  const { dek } = useSession();

  const plan = useLiveQuery(() => computePlan(tier, scenario, dek), [tier, scenario, dek]);
  const stock = useLiveQuery(() => db.stock.toArray(), []);
  const foods = useLiveQuery(() => db.foods.toArray(), []);
  const hh = useLiveQuery(() => db.households.toCollection().first(), []);
  const status = useMemo(() => (plan && stock && foods ? inventoryStatus(plan.result, stock, foods, new Date().toISOString().slice(0, 10), hh?.settings.expiryWarningDays ?? EXPIRING_SOON_DAYS) : undefined), [plan, stock, foods, hh]);

  const needs: Need[] = useMemo(() => {
    if (!status) return [];
    const rows: Need[] = status.rows.filter((r) => r.toBuy > 0).map((r) => ({
      key: r.foodId, name: r.name, need: `Buy ${r.toBuy} × ${r.packageDesc}`, reserved: r.reserved,
      terms: flyerTerms(r.foodId, r.name), qty: r.toBuy, packageDesc: r.packageDesc,
    }));
    if (status.water.toBuyGallons > 0) rows.push({ key: 'water', name: 'Water', need: `Buy ${num(status.water.toBuyGallons)} gallons`, terms: WATER_TERMS, qty: Math.ceil(status.water.toBuyGallons) });
    return rows;
  }, [status]);

  const [zip, setZip] = useState(() => load(ZIP_KEY) ?? '');
  const [draft, setDraft] = useState(zip);
  const [locating, setLocating] = useState(false);
  const [zipErr, setZipErr] = useState('');
  const [mine, setMine] = useState(() => load(MINE_KEY) !== '0');
  const [results, setResults] = useState<Results>();
  const [progress, setProgress] = useState<{ done: number; total: number }>();
  const [err, setErr] = useState('');
  const abort = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => abort.current?.abort(), []);

  const applyZip = (z: string) => { setZip(z); setDraft(z); save(ZIP_KEY, z); setZipErr(''); setResults(undefined); };

  async function findSales(fresh: boolean) {
    if (!validZip(zip)) return setErr('Enter your zip code first.');
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    if (fresh) clearFlyerCache();
    setErr('');
    const queries = [...new Set(needs.flatMap((n) => n.terms))];
    setProgress({ done: 0, total: queries.length });
    const failed: string[] = [];
    try {
      const found = await runPooled(queries.map((q) => async () => {
        try { return [q, await searchFlyers(q, zip, ctl.signal)] as const; } catch (x) {
          if (ctl.signal.aborted) throw x;
          failed.push(q);
          return [q, [] as FlyerItem[]] as const;
        }
      }), 4, (done) => setProgress({ done, total: queries.length }));
      const byQuery = new Map(found);
      // Each sale is listed under the first food it matches (one emergency bucket shouldn't show up three times).
      const listed = new Set<number>();
      setResults(Object.fromEntries(needs.map((n) => {
        const sales = salesFor(n.terms.map((q) => ({ query: q, items: byQuery.get(q) ?? [] })), { foodId: n.key }).filter((s) => !listed.has(s.id));
        sales.forEach((s) => listed.add(s.id));
        return [n.key, sales];
      })));
      if (queries.length && failed.length === queries.length) setErr('Couldn’t reach the flyer service. Check the internet connection and try again.');
      else if (failed.length) setErr(`Some searches didn’t go through (${failed.length} of ${queries.length}), so a few sales may be missing. Try “Search again”.`);
    } catch {
      /* cancelled: a newer search or leaving the page */
    } finally {
      if (!ctl.signal.aborted) setProgress(undefined);
    }
  }

  const searching = !!progress;

  return (
    <div className="stack">
      <div className="spread no-print">
        <h1 style={{ margin: 0 }}>Deals</h1>
        <span className="row small" style={{ gap: 12 }}><Link to="/admin/shopping">Shopping list</Link><Link to="/admin/inventory?show=buy">Inventory</Link></span>
      </div>
      <p className="muted no-print" style={{ margin: 0 }}>This week’s sales near you on everything still to buy, from local store flyers.</p>

      <div className="no-print"><PlanPicker /></div>

      <section className="card stack no-print">
        <form className="row" style={{ alignItems: 'flex-end' }} onSubmit={(e) => { e.preventDefault(); if (!validZip(draft)) return setZipErr('Enter a 5-digit zip code.'); applyZip(draft.trim()); }}>
          <label style={{ maxWidth: 160 }}>Zip code<input inputMode="numeric" autoComplete="postal-code" maxLength={5} value={draft} onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))} /></label>
          {draft.trim() !== zip && <button className="primary">Save</button>}
          <button type="button" disabled={locating} onClick={async () => { setZipErr(''); setLocating(true); try { applyZip(await zipFromDevice()); } catch (x) { setZipErr(x instanceof Error ? x.message : String(x)); } finally { setLocating(false); } }}>
            {locating ? 'Finding you…' : 'Use my location'}
          </button>
        </form>
        {zipErr && <span className="small" style={{ color: 'var(--danger)' }}>{zipErr}</span>}
        <p className="small muted" style={{ margin: 0 }}>The zip code is saved only on this device. Searching sends the zip and generic food names (nothing about your family) to Flipp, which collects store flyers. “Use my location” sends your approximate location once to BigDataCloud to look up the zip.</p>
        <div className="row">
          <button className="primary big" disabled={!validZip(zip) || searching || !needs.length} onClick={() => findSales(!!results)}>
            {searching ? `Searching… ${progress!.done} of ${progress!.total}` : results ? 'Search again' : 'Find sales'}
          </button>
          <label className="inline"><input type="checkbox" checked={mine} onChange={(e) => { setMine(e.target.checked); save(MINE_KEY, e.target.checked ? null : '0'); }} /> Only your stores <span className="small muted">({MY_STORES.join(', ')})</span></label>
        </div>
        {err && <div className="notice danger" role="alert">{err}</div>}
      </section>

      {!status || !plan ? <p className="muted">Loading…</p> : plan.input.members.length === 0 ? (
        <div className="notice">Add your family on <Link to="/admin/members">Members</Link> first; the plan sets what you need.</div>
      ) : !needs.length ? (
        <div className="notice ok">Everything in this plan is on hand.</div>
      ) : results && (
        <Found needs={needs} results={results} mine={mine} />
      )}

      <OnlineSales />
    </div>
  );
}

function Found({ needs, results, mine }: { needs: Need[]; results: Results; mine: boolean }) {
  const shown = useMemo(() => Object.fromEntries(needs.map((n) => [n.key, (results[n.key] ?? []).filter((s) => !mine || isMyStore(s.store))])), [needs, results, mine]);
  const best = useMemo(() => Object.fromEntries(needs.map((n) => [n.key, bestSale(shown[n.key])])), [needs, shown]);
  // Sales already on the shopping list (not yet bought).
  const listed = useLiveQuery(async () => new Set((await db.shopping.filter((s) => !s.checked).toArray()).map((s) => s.sale?.saleId).filter((x): x is number => x !== undefined)), []) ?? new Set<number>();
  const toggle = (n: Need, s: Sale) => {
    const key = n.key === 'water' ? { kind: 'water' as const } : { kind: 'food' as const, foodId: n.key };
    if (listed.has(s.id)) return removeSale(key, s.id);
    return addToShopping({ ...key, name: n.name, quantity: n.qty, packageDesc: n.packageDesc, sale: saleOf(s) });
  };

  const withSales = needs.filter((n) => shown[n.key].length);
  const elsewhere = needs.filter((n) => !shown[n.key].length && (results[n.key] ?? []).length).length;
  const onList = withSales.reduce((t, n) => t + shown[n.key].filter((s) => listed.has(s.id)).length, 0);

  return (
    <>
      <div className="spread">
        <strong>{withSales.length} of {needs.length} foods on sale this week{mine ? ' at your stores' : ''}</strong>
        <Link to="/admin/shopping" className="btn">Shopping list{onList ? ` (${onList} from here)` : ''}</Link>
      </div>
      {withSales.length === 0 ? (
        <div className="notice">No sales found this week{mine ? ' at your stores' : ''}.{mine && elsewhere > 0 && ' Untick “Only your stores” to see other stores nearby.'}</div>
      ) : (
        <section className="card stack">
          <p className="small muted" style={{ margin: 0 }}><strong>Best price</strong> compares the price per ounce (or per count) when the flyers give sizes. When they don’t, the cheapest is marked <strong>lowest price</strong>, so check the sizes. Tap <strong>Add to list</strong> on a sale to put it on the shopping list with the store and price (as many as you like per food).</p>
          <div className="list">
            {withSales.map((n) => {
              const count = shown[n.key].filter((s) => listed.has(s.id)).length;
              return (
                <div key={n.key} className="stack" style={{ gap: 8 }}>
                  <div>
                    <strong>{n.name}</strong>{n.reserved && <span className="badge" style={{ marginLeft: 6 }}>individual need</span>} <span className="small muted">· {n.need}</span>
                    {count > 0 && <span className="badge ok" style={{ marginLeft: 6 }}>{count} on list</span>}
                  </div>
                  {shown[n.key].map((s) => (
                    <SaleRow key={s.id} s={s} best={best[n.key]?.id === s.id ? best[n.key]!.basis : undefined} picked={listed.has(s.id)} onPick={() => toggle(n, s)} />
                  ))}
                </div>
              );
            })}
          </div>
          {needs.length > withSales.length && (
            <p className="small muted" style={{ margin: 0 }}>
              {needs.length - withSales.length} {needs.length - withSales.length === 1 ? 'food isn’t' : 'foods aren’t'} on sale this week. Add {needs.length - withSales.length === 1 ? 'it' : 'them'} to the shopping list from Inventory.
              {mine && elsewhere > 0 && ` ${elsewhere} ${elsewhere === 1 ? 'is' : 'are'} on sale at other stores nearby (untick “Only your stores”).`}
            </p>
          )}
        </section>
      )}
    </>
  );
}

function SaleRow({ s, best, picked, onPick }: { s: Sale; best?: 'unit' | 'lowest'; picked: boolean; onPick: () => void }) {
  const extra = [s.price.includes(' for ') && s.each !== undefined && `$${s.each.toFixed(2)} each`, s.perUnit && unitText(s.perUnit)].filter(Boolean).join(' · ');
  return (
    <div className="row" style={{ gap: 10, flexWrap: 'nowrap', alignItems: 'flex-start' }}>
      {s.image ? <img src={s.image} alt="" loading="lazy" width={48} height={48} style={{ objectFit: 'contain', borderRadius: 6, background: '#fff', flex: 'none' }} /> : <span style={{ width: 48, flex: 'none' }} />}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div>
          <strong>{s.price}</strong> · {s.store}
          {best === 'unit' && <span className="badge ok" style={{ marginLeft: 6 }}>Best price</span>}
          {best === 'lowest' && <span className="badge" style={{ marginLeft: 6 }}>Lowest price · check sizes</span>}
        </div>
        {extra && <div className="small muted">{extra}</div>}
        <div className="small">{s.product}</div>
        <div className="small muted">{[s.note, s.starts && `Starts ${fmtDay(s.starts)}`, s.through && `Through ${fmtDay(s.through)}`].filter(Boolean).join(' · ')}</div>
      </div>
      <button className={picked ? 'primary' : ''} style={{ minHeight: 36, padding: '0 12px', flex: 'none' }} aria-pressed={picked} onClick={onPick}>{picked ? '✓ On list' : 'Add to list'}</button>
    </div>
  );
}

type StoreResult = { state: 'loading' } | { state: 'error' } | { state: 'done'; sales: OnlineSale[] };
const money = (n: number) => `$${n.toFixed(2)}`;

/** Markdowns at freeze-dried / emergency-food brand stores. Nothing personal is sent: just a request for each store's product list. */
function OnlineSales() {
  const [byStore, setByStore] = useState<Record<string, StoreResult>>();
  const [open, setOpen] = useState<Record<string, boolean>>({ [ONLINE_STORES[0].id]: true });
  const abort = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => abort.current?.abort(), []);

  async function check() {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setByStore(Object.fromEntries(ONLINE_STORES.map((s) => [s.id, { state: 'loading' }])));
    await Promise.all(ONLINE_STORES.map(async (s) => {
      let r: StoreResult;
      try { r = { state: 'done', sales: onlineSales(await storeProducts(s.base, ctl.signal), s.base) }; } catch { r = { state: 'error' }; }
      if (!ctl.signal.aborted) setByStore((x) => ({ ...x, [s.id]: r }));
    }));
  }
  const busy = !!byStore && Object.values(byStore).some((r) => r.state === 'loading');

  return (
    <section className="card stack no-print">
      <div className="spread">
        <h2 style={{ margin: 0 }}>Online sales: freeze-dried &amp; emergency food</h2>
        <button className={byStore ? '' : 'primary'} disabled={busy} onClick={check}>{busy ? 'Checking…' : byStore ? 'Check again' : 'Check online sales'}</button>
      </div>
      <p className="small muted" style={{ margin: 0 }}>Markdowns on the brands’ own websites (at least 5% off, in stock). Prices are before shipping.</p>
      {byStore && (
        <div className="list">
          {ONLINE_STORES.map((s) => {
            const r = byStore[s.id];
            const isOpen = !!open[s.id];
            return (
              <div key={s.id} className="stack" style={{ gap: 8 }}>
                <button className="ghost" style={{ justifyContent: 'space-between', padding: 0, minHeight: 36 }} aria-expanded={isOpen} disabled={r.state !== 'done' || !r.sales.length} onClick={() => setOpen((o) => ({ ...o, [s.id]: !isOpen }))}>
                  <strong>{s.name}</strong>
                  <span className="small muted">{r.state === 'loading' ? 'Checking…' : r.state === 'error' ? 'Couldn’t check this store' : r.sales.length ? `${r.sales.length} on sale ${isOpen ? '▴' : '▾'}` : 'Nothing on sale'}</span>
                </button>
                {r.state === 'done' && isOpen && r.sales.map((x) => (
                  <a key={x.key} href={x.url} target="_blank" rel="noopener noreferrer" className="row" style={{ gap: 10, flexWrap: 'nowrap', color: 'inherit', textDecoration: 'none' }}>
                    {x.image ? <img src={x.image} alt="" loading="lazy" width={48} height={48} style={{ objectFit: 'contain', borderRadius: 6, background: '#fff', flex: 'none' }} /> : <span style={{ width: 48, flex: 'none' }} />}
                    <span style={{ minWidth: 0 }}>
                      <span><strong>{money(x.price)}</strong> <s className="small muted">{money(x.was)}</s> <span className="badge ok">{x.pctOff}% off</span></span>
                      <span className="small" style={{ display: 'block' }}>{x.product}{x.option && <span className="muted"> · {x.option}</span>}</span>
                    </span>
                  </a>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
