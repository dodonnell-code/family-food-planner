// Deals: what's on sale this week, near you, for everything still to buy. Flyer data comes
// from Flipp by zip code. The zip stays on this device; "Use my location" looks it up once.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/session';
import { fmtDay } from '../../app/ui';
import { db } from '../../data/db';
import { clearFlyerCache, runPooled, searchFlyers } from '../../data/flyers';
import { computePlan, defaultScenario, SCENARIO_LABEL, TIER_LABEL } from '../../data/planRepo';
import { EXPIRING_SOON_DAYS, inventoryStatus } from '../../domain/inventory';
import { flyerTerms, isMyStore, MY_STORES, salesFor, validZip, WATER_TERMS, type FlyerItem, type Sale } from '../../domain/deals';
import type { Scenario, Tier } from '../../domain/types';

const TIERS: Tier[] = ['short', 'medium', 'long'];
const SCENARIOS: Scenario[] = ['no-cook', 'limited-cook'];
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

interface Need { key: string; name: string; need: string; reserved?: boolean; terms: string[] }
type Results = Record<string, Sale[]>;

export default function Deals() {
  const { dek } = useSession();
  const [params, setParams] = useSearchParams();
  const tier = (TIERS.includes(params.get('tier') as Tier) ? params.get('tier') : 'short') as Tier;
  const scenario = (SCENARIOS.includes(params.get('scenario') as Scenario) ? params.get('scenario') : defaultScenario(tier)) as Scenario;

  const plan = useLiveQuery(() => computePlan(tier, scenario, dek), [tier, scenario, dek]);
  const stock = useLiveQuery(() => db.stock.toArray(), []);
  const foods = useLiveQuery(() => db.foods.toArray(), []);
  const hh = useLiveQuery(() => db.households.toCollection().first(), []);
  const status = useMemo(() => (plan && stock && foods ? inventoryStatus(plan.result, stock, foods, new Date().toISOString().slice(0, 10), hh?.settings.expiryWarningDays ?? EXPIRING_SOON_DAYS) : undefined), [plan, stock, foods, hh]);

  const needs: Need[] = useMemo(() => {
    if (!status) return [];
    const rows: Need[] = status.rows.filter((r) => r.toBuy > 0).map((r) => ({
      key: r.foodId, name: r.name, need: `Buy ${r.toBuy} × ${r.packageDesc}`, reserved: r.reserved,
      terms: flyerTerms(r.foodId, r.name),
    }));
    if (status.water.toBuyGallons > 0) rows.push({ key: 'water', name: 'Water', need: `Buy ${num(status.water.toBuyGallons)} gallons`, terms: WATER_TERMS });
    return rows;
  }, [status]);

  const [zip, setZip] = useState(() => load(ZIP_KEY) ?? '');
  const [draft, setDraft] = useState(zip);
  const [locating, setLocating] = useState(false);
  const [zipErr, setZipErr] = useState('');
  const [mine, setMine] = useState(() => load(MINE_KEY) !== '0');
  const [view, setView] = useState<'item' | 'store'>('item');
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
      setResults(Object.fromEntries(needs.map((n) => [n.key, salesFor(n.terms.map((q) => ({ query: q, items: byQuery.get(q) ?? [] })), { foodId: n.key })])));
      if (queries.length && failed.length === queries.length) setErr('Couldn’t reach the flyer service. Check the internet connection and try again.');
      else if (failed.length) setErr(`Some searches didn’t go through (${failed.length} of ${queries.length}), so a few sales may be missing. Try “Search again”.`);
    } catch {
      /* cancelled: a newer search or leaving the page */
    } finally {
      if (!ctl.signal.aborted) setProgress(undefined);
    }
  }

  const resetResults = () => { abort.current?.abort(); setProgress(undefined); setResults(undefined); };
  const searching = !!progress;

  return (
    <div className="stack">
      <div className="spread">
        <h1 style={{ margin: 0 }}>Deals</h1>
        <Link to={`/admin/inventory?tier=${tier}&scenario=${scenario}`} className="small">Back to inventory</Link>
      </div>
      <p className="muted" style={{ margin: 0 }}>This week’s sales near you on everything still to buy, from local store flyers.</p>

      <div className="row">
        <span className="small muted">Shopping list for:</span>
        {TIERS.map((t) => (
          <button key={t} role="tab" aria-selected={tier === t} className={tier === t ? 'primary' : ''} onClick={() => { resetResults(); setParams({ tier: t, scenario: defaultScenario(t) }, { replace: true }); }}>{TIER_LABEL[t]}</button>
        ))}
        <select aria-label="Scenario" value={scenario} onChange={(e) => { resetResults(); setParams({ tier, scenario: e.target.value }, { replace: true }); }} style={{ maxWidth: 200 }}>
          {SCENARIOS.map((s) => <option key={s} value={s}>{SCENARIO_LABEL[s]}</option>)}
        </select>
      </div>

      <section className="card stack">
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
          <label className="inline"><input type="checkbox" checked={mine} onChange={(e) => { setMine(e.target.checked); save(MINE_KEY, e.target.checked ? null : '0'); }} /> Only {MY_STORES.slice(0, -1).join(', ')} &amp; {MY_STORES[MY_STORES.length - 1]}</label>
        </div>
        {err && <div className="notice danger" role="alert">{err}</div>}
      </section>

      {!status || !plan ? <p className="muted">Loading…</p> : plan.input.members.length === 0 ? (
        <div className="notice">Add your family on <Link to="/admin/members">Members</Link> first; the plan sets what you need.</div>
      ) : !needs.length ? (
        <div className="notice ok">Everything in this plan is on hand.</div>
      ) : results && (
        <Found needs={needs} results={results} mine={mine} view={view} setView={setView} />
      )}
    </div>
  );
}

function Found({ needs, results, mine, view, setView }: { needs: Need[]; results: Results; mine: boolean; view: 'item' | 'store'; setView: (v: 'item' | 'store') => void }) {
  const shown = useMemo(() => Object.fromEntries(needs.map((n) => [n.key, (results[n.key] ?? []).filter((s) => !mine || isMyStore(s.store))])), [needs, results, mine]);
  const withSales = needs.filter((n) => shown[n.key].length);
  const without = needs.filter((n) => !shown[n.key].length);
  const elsewhere = without.filter((n) => (results[n.key] ?? []).length).length;
  const byStore = useMemo(() => {
    const m = new Map<string, { sale: Sale; food: string }[]>();
    for (const n of needs) for (const s of shown[n.key]) m.set(s.store, [...(m.get(s.store) ?? []), { sale: s, food: n.name }]);
    return [...m].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [needs, shown]);

  return (
    <>
      <div className="spread">
        <strong>{withSales.length} of {needs.length} foods on sale this week{mine ? ' at your stores' : ''}</strong>
        <span className="row" style={{ gap: 6 }} role="tablist">
          <button role="tab" aria-selected={view === 'item'} className={view === 'item' ? 'primary' : ''} onClick={() => setView('item')}>By food</button>
          <button role="tab" aria-selected={view === 'store'} className={view === 'store' ? 'primary' : ''} onClick={() => setView('store')}>By store</button>
        </span>
      </div>

      {withSales.length === 0 ? (
        <div className="notice">No sales found this week{mine ? ' at your stores' : ''}.{mine && elsewhere > 0 && ' Untick “Only …” to see other stores nearby.'}</div>
      ) : view === 'item' ? (
        <section className="card stack">
          <div className="list">
            {withSales.map((n) => (
              <div key={n.key} className="stack" style={{ gap: 8 }}>
                <div><strong>{n.name}</strong>{n.reserved && <span className="badge" style={{ marginLeft: 6 }}>individual need</span>} <span className="small muted">· {n.need}</span></div>
                {shown[n.key].map((s) => <SaleRow key={s.id} s={s} showStore />)}
              </div>
            ))}
          </div>
        </section>
      ) : byStore.map(([store, list]) => (
        <section key={store} className="card stack">
          <h2 style={{ margin: 0 }}>{store} <span className="small muted">({list.length})</span></h2>
          <div className="list">{list.map(({ sale, food }) => <SaleRow key={`${food}-${sale.id}`} s={sale} food={food} />)}</div>
        </section>
      ))}

      {without.length > 0 && (
        <details className="card">
          <summary><strong>Not on sale this week</strong> ({without.length})</summary>
          <p className="small muted">{without.map((n) => n.name).join(' · ')}</p>
          {mine && elsewhere > 0 && <p className="small muted">{elsewhere} of these {elsewhere === 1 ? 'is' : 'are'} on sale at other stores nearby. Untick “Only …” to see them.</p>}
          {without.some((n) => !n.terms.length) && <p className="small muted">Freeze-dried and specialty foods rarely show up in store flyers, so they aren’t searched.</p>}
        </details>
      )}
    </>
  );
}

function SaleRow({ s, showStore, food }: { s: Sale; showStore?: boolean; food?: string }) {
  return (
    <div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
      {s.image ? <img src={s.image} alt="" loading="lazy" width={48} height={48} style={{ objectFit: 'contain', borderRadius: 6, background: '#fff', flex: 'none' }} /> : <span style={{ width: 48, flex: 'none' }} />}
      <div style={{ minWidth: 0 }}>
        <div><strong>{s.price}</strong>{showStore && <> · {s.store}</>}</div>
        <div className="small">{s.product}{food && <span className="muted"> (for {food})</span>}</div>
        <div className="small muted">{[s.note, s.starts && `Starts ${fmtDay(s.starts)}`, s.through && `Through ${fmtDay(s.through)}`].filter(Boolean).join(' · ')}</div>
      </div>
    </div>
  );
}
