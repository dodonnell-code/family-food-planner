import { WaterStored, WaterTreatmentNote } from './Plan';
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/session';
import { db } from '../../data/db';
import { downloadText, slug } from '../../app/download';
import { fmtDate, allergenLine } from '../../app/ui';
import { computePlan, defaultScenario, SCENARIO_LABEL, TIER_LABEL } from '../../data/planRepo';
import { loadPrivateProfiles } from '../../data/reportsRepo';
import { BUCKET_LABEL, type Bucket, type PlanResult } from '../../domain/planner';
import { planCsv, planJson, publicFlags, reservedLine, type PrivateProfile, type ReportMode } from '../../domain/reports';
import { inventoryStatus, remainingPlan } from '../../domain/inventory';
import type { Scenario, Tier } from '../../domain/types';

const TIERS: Tier[] = ['short', 'medium', 'long'];
const SCENARIOS: Scenario[] = ['no-cook', 'limited-cook'];
const num = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });

export default function Reports() {
  const { dek } = useSession();
  const [params, setParams] = useSearchParams();
  const tier = (TIERS.includes(params.get('tier') as Tier) ? params.get('tier') : 'short') as Tier;
  const scenario = (SCENARIOS.includes(params.get('scenario') as Scenario) ? params.get('scenario') : defaultScenario(tier)) as Scenario;
  const [mode, setMode] = useState<ReportMode>('family');
  const [stillToBuy, setStillToBuy] = useState(params.get('stillToBuy') === '1');

  const hh = useLiveQuery(() => db.households.toCollection().first(), []);
  const full = useLiveQuery(() => computePlan(tier, scenario, dek), [tier, scenario, dek]);
  const stock = useLiveQuery(() => db.stock.toArray(), []);
  const plan = useMemo(() => {
    if (!full || !stillToBuy) return full;
    if (!stock) return undefined;
    return { ...full, result: remainingPlan(full.result, inventoryStatus(full.result, stock, full.input.foods, new Date().toISOString().slice(0, 10), hh?.settings.expiryWarningDays)) };
  }, [full, stock, stillToBuy, hh]);
  const profiles = useLiveQuery(
    async () => (mode === 'detailed' && dek && plan ? loadPrivateProfiles(plan.input.members.map((m) => m.id), dek) : undefined),
    [mode, dek, plan],
  );
  const names = useMemo(() => new Map(plan?.input.members.map((m) => [m.id, m.name]) ?? []), [plan]);
  const generatedAt = useMemo(() => new Date().toISOString(), [plan, mode]);

  const base = `${slug(hh?.name ?? 'household')}-${tier}-${scenario}${stillToBuy ? '-to-buy' : ''}-${generatedAt.slice(0, 10)}${mode === 'detailed' ? '-PRIVATE' : ''}`;
  const csv = () => plan && downloadText(`${base}.csv`, planCsv(plan.result, mode, names), 'text/csv;charset=utf-8');
  const json = () => plan && downloadText(`${base}.json`, JSON.stringify(planJson(plan.result, mode, { household: hh?.name ?? '', generatedAt, names, profiles }), null, 2), 'application/json');

  return (
    <div className="stack">
      <div className="no-print stack">
        <h1 style={{ margin: 0 }}>Reports &amp; export</h1>
        <div className="row" role="tablist" aria-label="Planning horizon">
          {TIERS.map((t) => (
            <button key={t} role="tab" aria-selected={tier === t} className={tier === t ? 'primary' : ''} onClick={() => setParams({ tier: t, scenario: defaultScenario(t), ...(stillToBuy ? { stillToBuy: '1' } : {}) }, { replace: true })}>{TIER_LABEL[t]}</button>
          ))}
          <select aria-label="Scenario" value={scenario} onChange={(e) => setParams({ tier, scenario: e.target.value }, { replace: true })} style={{ maxWidth: 220 }}>
            {SCENARIOS.map((s) => <option key={s} value={s}>{SCENARIO_LABEL[s]}</option>)}
          </select>
        </div>
        <fieldset className="card stack" style={{ gap: 10 }}>
          <legend className="small muted" style={{ padding: '0 6px' }}>Report type</legend>
          <label className="inline"><input type="radio" name="mode" checked={mode === 'family'} onChange={() => setMode('family')} /> <span><strong>Family summary</strong><br /><span className="small muted">Shopping list, water, fuel and equipment. No one’s restrictions, health needs or notes.</span></span></label>
          <label className="inline"><input type="radio" name="mode" checked={mode === 'detailed'} onChange={() => setMode('detailed')} /> <span><strong>Detailed private report</strong><br /><span className="small muted">Adds each person’s restrictions, needs, conditions and private notes. For Admin only.</span></span></label>
          <label className="inline" style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}><input type="checkbox" checked={stillToBuy} onChange={(e) => setStillToBuy(e.target.checked)} /> <span><strong>Only what we still need to buy</strong><br /><span className="small muted">Subtracts what’s in Inventory. Expired items count as needed.</span></span></label>
          {mode === 'detailed' && <div className="notice danger small">This report contains private health information in plain text. Don’t share it, and delete printed or saved copies you no longer need.</div>}
        </fieldset>
        <div className="row">
          <button className="primary" onClick={() => window.print()} disabled={!plan}>Print / save as PDF</button>
          <button onClick={csv} disabled={!plan}>Download CSV (spreadsheet)</button>
          <button onClick={json} disabled={!plan || (mode === 'detailed' && !profiles)}>Download JSON</button>
        </div>
        <p className="small muted" style={{ margin: 0 }}>Preview below. “Print” opens the system print dialog, which can also save a PDF.</p>
      </div>

      {!plan || !hh ? <p className="muted">Preparing…</p> : (
        <article className="report card">
          <ReportBody stillToBuy={stillToBuy} r={plan.result} household={hh.name} generatedAt={generatedAt} mode={mode} names={names} profiles={profiles} />
        </article>
      )}
    </div>
  );
}

function ReportBody({ r, household, generatedAt, mode, names, profiles, stillToBuy }: { stillToBuy: boolean; r: PlanResult; household: string; generatedAt: string; mode: ReportMode; names: Map<string, string>; profiles?: PrivateProfile[] }) {
  const buckets = (Object.keys(BUCKET_LABEL) as Bucket[]).filter((b) => r.items.some((i) => i.bucket === b));
  const detailed = mode === 'detailed';
  const warnings = detailed ? r.warnings : r.warnings.filter((w) => !w.includes('“avoid when possible”'));
  return (
    <div className="stack">
      <header>
        {detailed && <p className="report-private">PRIVATE: contains health information</p>}
        <h1 style={{ marginBottom: 4 }}>{household}: {TIER_LABEL[r.tier].toLowerCase()} {stillToBuy ? 'shopping list (still to buy)' : 'food plan'}</h1>
        <p className="muted" style={{ margin: 0 }}>{r.days} days · {SCENARIO_LABEL[r.scenario].toLowerCase()} · {r.people} {r.people === 1 ? 'person' : 'people'} ({[...names.values()].join(', ')}) · made {fmtDate(generatedAt)}</p>
      </header>

      <div className="report-kpis">
        <div><strong>{Math.round((r.plannedCalories / Math.max(1, r.targetCalories)) * 100)}%</strong><span>of calories</span></div>
        <div><strong>{num(r.water.totalGallons)} gal</strong><span>{stillToBuy ? 'water still to store' : 'water to store'}</span></div>
        <div><strong>{r.fuel.burnerMinutes ? `${num(r.fuel.burnerMinutes / 60)} h` : 'None'}</strong><span>cooking fuel</span></div>
        <div><strong>{num(r.storage.knownLiters)} L</strong><span>storage space</span></div>
      </div>

      <section>
        <h2>Shopping list</h2>
        {stillToBuy && r.items.length === 0 && <p>Everything in this plan is on hand.</p>}
        <table className="table">
          <thead><tr><th>Food</th><th>Buy</th><th>Servings</th><th>Keeps</th>{detailed && <th>Notes</th>}</tr></thead>
          {buckets.map((b) => (
            <tbody key={b}>
              <tr className="report-group"><td colSpan={detailed ? 5 : 4}>{BUCKET_LABEL[b]}</td></tr>
              {r.items.filter((i) => i.bucket === b).map((i) => {
                const flags = detailed ? i.flags : publicFlags(i.flags);
                return (
                  <tr key={i.foodId}>
                    <td><span className="report-box" aria-hidden /> {i.name}{!detailed && flags.length > 0 && <div className="small muted">{flags.join('; ')}</div>}{allergenLine(i.allergens) && <div className="small muted">{allergenLine(i.allergens)}</div>}{i.safetyNotes && <div className="small muted">{i.safetyNotes}</div>}</td>
                    <td><strong>{i.packages}</strong> × {i.packageDesc}</td>
                    <td>{num(i.servings)}{i.carbsG !== undefined ? <div className="small muted">~{i.carbsG} g carbs each</div> : null}</td>
                    <td>{i.shelfLife}</td>
                    {detailed && <td className="small">{flags.join('; ') || '—'}<div className="muted">score {i.score}, {i.confidence} confidence</div></td>}
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </section>

      {r.reserved.length > 0 && (
        <section>
          <h2>Individual needs</h2>
          <table className="table">
            <thead><tr><th>Item</th><th>Buy</th><th>Note</th></tr></thead>
            <tbody>
              {r.reserved.map((x) => { const l = reservedLine(x, mode, names); return <tr key={x.needId}><td><span className="report-box" aria-hidden /> {l.what}</td><td>{l.buy}</td><td className="small">{l.note}{detailed && x.warnings.length ? <div className="muted">{x.warnings.join(' ')}</div> : null}</td></tr>; })}
            </tbody>
          </table>
        </section>
      )}

      <section className="report-cols">
        <div>
          <h2>Water</h2>
          {stillToBuy ? <p>{r.water.totalGallons > 0 ? <><strong>{num(r.water.totalGallons)} gal</strong> still to store</> : 'Enough water stored.'}</p> : <ul>
          </ul>}
          {!stillToBuy && <WaterStored r={r} />}
          {r.water.treatment && <WaterTreatmentNote t={r.water.treatment} />}
          <h2>Cooking fuel</h2>
          {r.fuel.burnerMinutes === 0 ? <p>None needed.</p> : <ul>{r.fuel.items.map((f) => <li key={f.name}>{f.name}: {f.minutes} min</li>)}<li><strong>About {num(r.fuel.burnerMinutes / 60)} burner-hours</strong>, plus extra</li></ul>}
        </div>
        <div>
          <h2>{stillToBuy ? 'Equipment still needed' : 'Equipment'}</h2>
          {stillToBuy && r.equipment.length === 0 && <p>All checked off in Inventory.</p>}
          <ul>{r.equipment.map((e) => <li key={e.item}><span className="report-box" aria-hidden /> {e.item}</li>)}</ul>
        </div>
      </section>

      {warnings.length > 0 && (
        <section>
          <h2>Notes</h2>
          <ul>{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </section>
      )}

      {detailed && (
        <>
          <section>
            <h2>People</h2>
            {!profiles ? <p className="muted">Loading private details…</p> : profiles.map((p) => {
              const c = r.coverage.find((x) => x.memberId === p.memberId);
              return (
                <div key={p.memberId} className="report-person">
                  <h3>{p.name}</h3>
                  <ul>
                    {p.details.map((d) => <li key={d.label}>{d.label}: {d.value}</li>)}
                    {c && <li>{c.dailyCalories} cal/day; {c.mealOptions} planned main dishes they’re happy with{c.hasSurvey ? '' : ' (no survey yet)'}</li>}
                    {c?.notes.map((n) => <li key={n}>{n}</li>)}
                    {c?.suggestion && <li>{c.suggestion}</li>}
                    <li>Restrictions and dislikes: {p.restrictions.length ? p.restrictions.join('; ') : 'none'}</li>
                    <li>Food needs: {p.needs.length ? p.needs.join('; ') : 'none'}</li>
                    {p.conditions.length > 0 && <li>Conditions: {p.conditions.join('; ')}</li>}
                    {p.notes && <li>Private notes: {p.notes}</li>}
                  </ul>
                </div>
              );
            })}
          </section>
          <section>
            <h2>Foods left out</h2>
            <ul>{r.excluded.filter((e) => e.reasons.length).map((e) => <li key={e.foodId}>{e.name}: {e.reasons.map((x) => `${names.get(x.memberId)} (${x.reasons.join(', ')})`).join('; ')}</li>)}</ul>
          </section>
        </>
      )}

      <footer className="small muted">
        Catalog entries are generic: check every product label for allergens and storage instructions. Shelf life is guidance, not a guarantee. Water: CDC minimum is 1 gallon per person per day; hot weather, illness, nursing and pets need more.
      </footer>
    </div>
  );
}
