// Deals: for everything still to buy, one-tap searches at the family's stores and in local
// weekly flyers. The zip stays on this device; "Use my location" looks it up once.
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/session';
import { db } from '../../data/db';
import { computePlan, defaultScenario, SCENARIO_LABEL, TIER_LABEL } from '../../data/planRepo';
import { EXPIRING_SOON_DAYS, inventoryStatus } from '../../domain/inventory';
import { CLEARANCE_FINDER, couponerSearch, flyerSearch, searchTerms, STORES, validZip } from '../../domain/deals';
import type { Scenario, Tier } from '../../domain/types';

const TIERS: Tier[] = ['short', 'medium', 'long'];
const SCENARIOS: Scenario[] = ['no-cook', 'limited-cook'];
const ZIP_KEY = 'deals.zip';
const num = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });

function loadZip(): string {
  try { return localStorage.getItem(ZIP_KEY) ?? ''; } catch { return ''; }
}
function saveZip(z: string) {
  try { if (z) localStorage.setItem(ZIP_KEY, z); else localStorage.removeItem(ZIP_KEY); } catch { /* storage blocked: zip just isn't remembered */ }
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

  const [zip, setZip] = useState(loadZip);
  const [draft, setDraft] = useState(zip);
  const [locating, setLocating] = useState(false);
  const [err, setErr] = useState('');
  const applyZip = (z: string) => { setZip(z); setDraft(z); saveZip(z); setErr(''); };

  const toBuy = status?.rows.filter((r) => r.toBuy > 0) ?? [];
  const kindsOf = (foodId: string) => plan?.result.items.find((i) => i.foodId === foodId)?.kinds;

  return (
    <div className="stack">
      <div className="spread">
        <h1 style={{ margin: 0 }}>Deals</h1>
        <Link to={`/admin/inventory?tier=${tier}&scenario=${scenario}`} className="small">Back to inventory</Link>
      </div>
      <p className="muted" style={{ margin: 0 }}>Search for sales on everything still to buy. <strong>Local flyers</strong> shows this week’s sale prices from stores near your zip code. The store buttons open that store’s own search, which uses the store you’ve picked on its site.</p>

      <div className="row">
        <span className="small muted">Shopping list for:</span>
        {TIERS.map((t) => (
          <button key={t} role="tab" aria-selected={tier === t} className={tier === t ? 'primary' : ''} onClick={() => setParams({ tier: t, scenario: defaultScenario(t) }, { replace: true })}>{TIER_LABEL[t]}</button>
        ))}
        <select aria-label="Scenario" value={scenario} onChange={(e) => setParams({ tier, scenario: e.target.value }, { replace: true })} style={{ maxWidth: 200 }}>
          {SCENARIOS.map((s) => <option key={s} value={s}>{SCENARIO_LABEL[s]}</option>)}
        </select>
      </div>

      <section className="card stack">
        <h2 style={{ margin: 0 }}>Where you shop</h2>
        <form className="row" style={{ alignItems: 'flex-end' }} onSubmit={(e) => { e.preventDefault(); if (!draft.trim()) return applyZip(''); if (!validZip(draft)) return setErr('Enter a 5-digit zip code.'); applyZip(draft.trim()); }}>
          <label style={{ maxWidth: 160 }}>Zip code<input inputMode="numeric" autoComplete="postal-code" maxLength={5} value={draft} onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))} /></label>
          <button className="primary" disabled={draft.trim() === zip}>Save</button>
          <button type="button" disabled={locating} onClick={async () => { setErr(''); setLocating(true); try { applyZip(await zipFromDevice()); } catch (x) { setErr(x instanceof Error ? x.message : String(x)); } finally { setLocating(false); } }}>
            {locating ? 'Finding you…' : 'Use my location'}
          </button>
        </form>
        {err && <span className="small" style={{ color: 'var(--danger)' }}>{err}</span>}
        <p className="small muted" style={{ margin: 0 }}>The zip code is saved only on this device. “Use my location” sends your approximate location once to BigDataCloud to look up the zip; the location itself isn’t saved.</p>
        <div className="list">
          {STORES.map((s) => (
            <div key={s.id} className="spread">
              <strong>{s.name}</strong>
              <span className="row" style={{ gap: 6 }}>
                <a className="btn" href={s.weeklyAd} target="_blank" rel="noopener noreferrer">Weekly ad</a>
                {s.couponers.map((c) => <a key={c.url} className="btn" href={c.url} target="_blank" rel="noopener noreferrer">{c.name}</a>)}
                <a className="btn ghost" href={s.finder(zip || undefined)} target="_blank" rel="noopener noreferrer">{zip ? `Stores near ${zip}` : 'Find a store'}</a>
              </span>
            </div>
          ))}
        </div>
        <p className="small muted" style={{ margin: 0 }}><strong>Couponer sites</strong> (Krazy Coupon Lady, I Heart Kroger) round up each store’s best deals and coupon matchups every week. For clearance and mismarked prices, <a href={CLEARANCE_FINDER.url} target="_blank" rel="noopener noreferrer">{CLEARANCE_FINDER.name}</a> searches markdowns at stores near you (free account needed; Walmart coverage is best).</p>
      </section>

      {!status || !plan ? <p className="muted">Loading…</p> : plan.input.members.length === 0 ? (
        <div className="notice">Add your family on <Link to="/admin/members">Members</Link> first; the plan sets what you need.</div>
      ) : (
        <section className="card stack">
          <h2 style={{ margin: 0 }}>Still to buy</h2>
          {toBuy.length === 0 && status.water.toBuyGallons <= 0 ? <div className="notice ok">Everything in this plan is on hand.</div> : (
            <div className="list">
              {toBuy.map((r) => <DealRow key={r.foodId} name={r.name} need={`Buy ${r.toBuy} × ${r.packageDesc}`} reserved={r.reserved} terms={searchTerms(r.name, kindsOf(r.foodId))} zip={zip} />)}
              {status.water.toBuyGallons > 0 && <DealRow name="Water" need={`Buy ${num(status.water.toBuyGallons)} gallons`} terms={{ main: 'gallon water', kinds: ['case bottled water'] }} zip={zip} />}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function DealRow({ name, need, reserved, terms, zip }: { name: string; need: string; reserved?: boolean; terms: { main: string; kinds: string[] }; zip: string }) {
  const [q, setQ] = useState(terms.main);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div>
        <strong>{name}</strong>{reserved && <span className="badge" style={{ marginLeft: 6 }}>individual need</span>}
        <div className="small muted">{need}</div>
      </div>
      {terms.kinds.length > 0 && (
        <div className="row small" style={{ gap: 6 }}>
          <span className="muted">Search for:</span>
          {[terms.main, ...terms.kinds].map((t) => (
            <button key={t} aria-pressed={q === t} className={q === t ? 'primary' : ''} style={{ minHeight: 32, padding: '0 12px' }} onClick={() => setQ(t)}>{t}</button>
          ))}
        </div>
      )}
      <div className="row" style={{ gap: 6 }}>
        <a className="btn primary" href={flyerSearch(q, zip || undefined)} target="_blank" rel="noopener noreferrer">{zip ? `Local flyers (${zip})` : 'Local flyers'}</a>
        {STORES.map((s) => <a key={s.id} className="btn" href={s.search(q)} target="_blank" rel="noopener noreferrer">{s.name}</a>)}
        <a className="btn ghost" href={couponerSearch(q)} target="_blank" rel="noopener noreferrer">Couponer posts</a>
      </div>
    </div>
  );
}
