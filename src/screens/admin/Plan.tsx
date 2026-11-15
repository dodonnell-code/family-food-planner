import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/session';
import { db } from '../../data/db';
import { allergenLine, fmtDate } from '../../app/ui';
import { setPlanOverride, setPlanSubstitution } from '../../data/adminRepo';
import { computePlan, defaultScenario, savePlanSnapshot, savedPlans, SCENARIO_LABEL, TIER_LABEL } from '../../data/planRepo';
import { ADMIN_REMOVED, BUCKET_LABEL, diffPlans, NEEDS_COOKING, TIER_WEIGHTS, type Bucket, type PlanDiffRow, type PlannedItem, type PlanResult } from '../../domain/planner';
import type { FoodItem, Scenario, Tier } from '../../domain/types';

const TIERS: Tier[] = ['short', 'medium', 'long'];
const SCENARIOS: Scenario[] = ['no-cook', 'limited-cook'];
const VERDICT: Record<string, { text: string; tone: string }> = {
  ok: { text: 'fine', tone: 'ok' }, dislike: { text: 'doesn’t like', tone: 'warn' }, refuse: { text: 'would refuse', tone: 'warn' },
  avoid: { text: 'avoid when possible', tone: 'danger' }, minor: { text: 'minor intolerance', tone: '' }, prep: { text: 'prep concern', tone: 'warn' }, unsafe: { text: 'NOT SAFE for them', tone: 'danger' },
};
const num = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });

export default function Plan() {
  const { dek } = useSession();
  const [params, setParams] = useSearchParams();
  const tier = (TIERS.includes(params.get('tier') as Tier) ? params.get('tier') : 'short') as Tier;
  const scenario = (SCENARIOS.includes(params.get('scenario') as Scenario) ? params.get('scenario') : defaultScenario(tier)) as Scenario;

  const plan = useLiveQuery(() => computePlan(tier, scenario, dek), [tier, scenario, dek]);
  const saved = useLiveQuery(() => savedPlans({ tier, scenario }), [tier, scenario]);
  const hh = useLiveQuery(() => db.households.toCollection().first(), []);
  const [msg, setMsg] = useState('');
  const set = (t: Tier, s: Scenario) => { setMsg(''); setParams({ tier: t, scenario: s }, { replace: true }); };

  const names = useMemo(() => new Map(plan?.input.members.map((m) => [m.id, m.name]) ?? []), [plan]);
  const last = saved?.[0];
  const diff = useMemo(() => (plan && last ? diffPlans(last.result, plan.result) : undefined), [plan, last]);

  async function save() {
    if (!plan) return;
    await savePlanSnapshot(plan.input, plan.result);
    setMsg('Plan saved. Future changes will be compared with this one.');
    window.setTimeout(() => setMsg(''), 3000);
  }

  const days = (t: Tier) => (hh ? (t === 'short' ? hh.planningDefaults.shortDays : t === 'medium' ? hh.planningDefaults.mediumDays : hh.planningDefaults.longDays) : undefined);

  return (
    <div className="stack">
      <div className="spread">
        <h1 style={{ margin: 0 }}>Food plan</h1>
        <Link to="/admin/settings" className="small">Change horizons &amp; assumptions</Link>
      </div>

      <div className="stack" style={{ gap: 10 }}>
        <div className="row" role="tablist" aria-label="Planning horizon">
          {TIERS.map((t) => (
            <button key={t} role="tab" aria-selected={tier === t} className={tier === t ? 'primary' : ''} onClick={() => set(t, defaultScenario(t))}>
              {TIER_LABEL[t]}{days(t) ? ` · ${days(t)} days` : ''}
            </button>
          ))}
        </div>
        <div className="row" role="radiogroup" aria-label="Cooking scenario">
          <span className="small muted">Scenario:</span>
          {SCENARIOS.map((s) => (
            <button key={s} role="radio" aria-checked={scenario === s} className={scenario === s ? 'primary' : ''} style={{ minHeight: 40 }} onClick={() => set(tier, s)}>
              {SCENARIO_LABEL[s]}
            </button>
          ))}
          <span className="small muted">{scenario === 'no-cook' ? 'No power, stove or refrigerator. Only food you can eat as-is or mix with water.' : 'Some cooking with a camp stove; fuel and prep water are estimated.'}</span>
        </div>
      </div>

      {!plan ? <p className="muted">Working out the plan…</p> : plan.input.members.length === 0 ? (
        <div className="notice">No active members yet. <Link to="/admin/members">Add your family</Link> to get a plan.</div>
      ) : (
        <>
          <Summary r={plan.result} />
          <p className="small muted" style={{ margin: 0 }}>
            {plan.result.base
              ? `Builds on the ${plan.result.base.days}-day supply: everything in it is part of this plan (marked “Includes the ${plan.result.base.days}-day supply’s…”), and this plan adds what’s still needed for ${plan.result.days} days.`
              : `This is the first supply. The ${days('medium') ?? 14}-day plan builds on it, and the ${days('long') ?? 90}-day plan builds on both.`}
          </p>
          {plan.result.warnings.length > 0 && (
            <div className="notice stack" style={{ gap: 6 }} role="status">
              <strong>Check these</strong>
              <ul style={{ margin: 0, paddingLeft: 20 }}>{plan.result.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </div>
          )}

          <section className="card stack">
            <div className="spread">
              <h2 style={{ margin: 0 }}>Changes since the last saved plan</h2>
              <button className="primary" onClick={save}>Save this plan</button>
            </div>
            {msg && <div className="notice ok" role="status">{msg}</div>}
            {!last ? <p className="small muted" style={{ margin: 0 }}>You haven’t saved a {TIER_LABEL[tier].toLowerCase()} {SCENARIO_LABEL[scenario].toLowerCase()} plan yet. Save it once you’ve bought what’s on the list, and later changes (new people, surveys, restrictions) will show here as things to buy or remove.</p>
              : <DiffView rows={diff ?? []} when={last.snapshot.createdAt} count={saved?.length ?? 0} />}
          </section>

          <ShoppingList r={plan.result} names={names} foods={plan.input.foods} />
          {plan.result.reserved.length > 0 && <Reserved r={plan.result} names={names} />}
          <Coverage r={plan.result} />
          <WaterFuel r={plan.result} />
          <Additions r={plan.result} tier={tier} foods={plan.input.foods} names={names} subs={hh?.planSubstitutions ?? {}} />
          <Excluded r={plan.result} names={names} tier={tier} />
          <p className="small muted">
            How foods are scored for this horizon (after safety rules): family acceptance {TIER_WEIGHTS[tier].acceptance}%, nutrition {TIER_WEIGHTS[tier].nutrition}%, ease of preparation {TIER_WEIGHTS[tier].prep}%, storage life {TIER_WEIGHTS[tier].storage}%, cost &amp; space {TIER_WEIGHTS[tier].cost}%, convenience {TIER_WEIGHTS[tier].convenience}%.
            {tier === 'long' && ' Long-term plans favor dry staples that keep for years without rotation; canned food fills in.'}
            These are starting weights, not a scientific standard. Quantities are estimates from generic catalog entries; check real package sizes and labels.
          </p>
        </>
      )}
    </div>
  );
}

function Summary({ r }: { r: PlanResult }) {
  const pct = r.targetCalories ? Math.round((r.plannedCalories / r.targetCalories) * 100) : 0;
  const packages = r.items.reduce((s, i) => s + i.packages, 0) + r.reserved.reduce((s, x) => s + (x.packages ?? 0), 0);
  const stats: [string, string, string?][] = [
    ['People', String(r.people)],
    ['Days', String(r.days)],
    ['Calories covered', `${pct}%`, `${num(r.plannedCalories)} of ${num(r.targetCalories)}`],
    ['Packages', String(packages), `${r.items.length + r.reserved.filter((x) => x.foodId).length} different foods`],
    ['Water to store', `${num(r.water.totalGallons)} gal`, `${num(r.water.drinkingGallons)} drinking + ${num(r.water.prepGallons)} for food`],
  ];
  return (
    <div className="stats">
      {stats.map(([k, v, sub]) => (
        <div key={k} className="card stat"><span className="small muted">{k}</span><strong>{v}</strong>{sub && <span className="small muted">{sub}</span>}</div>
      ))}
    </div>
  );
}

function DiffView({ rows, when, count }: { rows: PlanDiffRow[]; when: string; count: number }) {
  const label: Record<PlanDiffRow['kind'], { text: string; tone: string }> = {
    add: { text: 'Add', tone: 'ok' }, more: { text: 'Buy more', tone: 'ok' }, fewer: { text: 'Need fewer', tone: '' }, remove: { text: 'Remove', tone: 'danger' },
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      <p className="small muted" style={{ margin: 0 }}>Compared with the plan saved {fmtDate(when)}{count > 1 ? ` (${count} saved in total)` : ''}.</p>
      {rows.length === 0 ? <div className="notice ok">No changes. The current plan matches the saved one.</div> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Change</th><th>Food</th><th>Saved</th><th>Now</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.foodId}>
                  <td><span className={`badge ${label[r.kind].tone}`}>{label[r.kind].text}</span></td>
                  <td><strong>{r.name}</strong><div className="small muted">{r.packageDesc}</div></td>
                  <td>{r.before}</td>
                  <td>{r.after}{r.kind === 'more' || r.kind === 'add' ? <span className="small muted"> (+{r.after - r.before})</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.some((r) => r.kind === 'remove') && <p className="small muted" style={{ margin: 0 }}>“Remove” means it’s no longer planned. If it conflicts with someone’s allergy, store it apart or use it up elsewhere.</p>}
    </div>
  );
}

function ShoppingList({ r, names, foods }: { r: PlanResult; names: Map<string, string>; foods: FoodItem[] }) {
  const buckets = (Object.keys(BUCKET_LABEL) as Bucket[]).filter((b) => r.items.some((i) => i.bucket === b));
  return (
    <section className="card stack">
      <h2 style={{ margin: 0 }}>Group food</h2>
      <p className="small muted" style={{ margin: 0 }}>Shared meals for everyone. {r.overrides?.some((o) => o.unsafeFor.length) ? 'Nothing here conflicts with anyone’s allergies or strict restrictions, except foods an admin added on purpose (flagged in red).' : 'Nothing here conflicts with anyone’s allergies or strict restrictions.'}</p>
      {buckets.map((b) => (
        <div key={b} className="stack" style={{ gap: 6 }}>
          <h3 style={{ margin: '8px 0 0' }}>{BUCKET_LABEL[b]}</h3>
          <div className="list">{r.items.filter((i) => i.bucket === b).map((i) => <ItemRow key={i.foodId} i={i} names={names} r={r} foods={foods} />)}</div>
        </div>
      ))}
    </section>
  );
}

function ItemRow({ i, names, r, foods }: { i: PlannedItem; names: Map<string, string>; r: PlanResult; foods: FoodItem[] }) {
  const [swapping, setSwapping] = useState(false);
  const conf = { high: 'ok', medium: '', low: 'warn' }[i.confidence];
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="spread" style={{ alignItems: 'flex-start' }}>
        <div>
          <Link to={`/admin/catalog/${i.foodId}`}><strong>{i.name}</strong></Link>
          <div className="small muted">{i.why.join(' · ')}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <strong style={{ fontSize: '1.15rem' }}>{i.packages} × {i.packageDesc || 'package'}</strong>
          <div className="small muted">{num(i.servings)} servings{i.leftoverServings > 0 ? `, ${num(i.leftoverServings)} spare` : ''}{i.carbsG !== undefined ? ` · ~${i.carbsG} g carbs/serving` : ''}</div>
        </div>
      </div>
      <div className="row" style={{ gap: 6 }}>
        <span className="badge" title="0–100 after safety rules">Score {i.score}</span>
        <span className={`badge ${conf}`}>{i.confidence} confidence</span>
        <span className="badge">{i.counts.liked} liked · {i.counts.disliked} not keen · {i.counts.unknown} unrated</span>
        {i.needsFuel && <span className="badge warn">needs cooking</span>}
        {i.prepWaterGallons > 0 && <span className="badge">{num(i.prepWaterGallons)} gal water</span>}
      </div>
      {i.flags.length > 0 && <ul className="small" style={{ margin: 0, paddingLeft: 20, color: 'var(--warn)' }}>{i.flags.map((f) => <li key={f}>{f}</li>)}</ul>}
      {(allergenLine(i.allergens) || i.safetyNotes) && (
        <div className="small muted">{allergenLine(i.allergens) && <><strong>Check labels:</strong> {allergenLine(i.allergens)}. </>}{i.safetyNotes}</div>
      )}
      {swapping ? <SwapPicker i={i} r={r} foods={foods} names={names} done={() => setSwapping(false)} />
        : <div><button className="ghost small" onClick={() => setSwapping(true)}>Swap or leave out…</button></div>}
      <details>
        <summary className="small">Per person</summary>
        <div className="row small" style={{ gap: 6, marginTop: 6 }}>
          {i.verdicts.map((v) => (
            <span key={v.memberId} className={`badge ${VERDICT[v.status].tone}`}>
              {names.get(v.memberId)}: {typeof v.rating === 'number' ? `${v.rating}/5` : v.rating === 'unknown' ? 'not tried' : 'no answer'}{v.status !== 'ok' ? `, ${VERDICT[v.status].text}` : ''}
            </span>
          ))}
        </div>
        <p className="small muted" style={{ margin: '6px 0 0' }}>Shelf life {i.shelfLife} unopened. Score: acceptance {Math.round(i.factors.acceptance * 100)}, nutrition {Math.round(i.factors.nutrition * 100)}, prep {Math.round(i.factors.prep * 100)}, storage {Math.round(i.factors.storage * 100)}, cost/space {Math.round(i.factors.cost * 100)} (each out of 100).</p>
      </details>
    </div>
  );
}

function Reserved({ r, names }: { r: PlanResult; names: Map<string, string> }) {
  return (
    <section className="card stack">
      <h2 style={{ margin: 0 }}>Reserved for individual needs</h2>
      <p className="small muted" style={{ margin: 0 }}>Kept separate from group food and labeled with the person’s name. Amounts come from their profile; this isn’t medical advice.</p>
      <div className="list">
        {r.reserved.map((x) => (
          <div key={x.needId} className="stack" style={{ gap: 4 }}>
            <div className="spread">
              <span><strong>{names.get(x.memberId)}</strong> · {x.label}</span>
              {x.foodName ? <strong>{x.packages} × {x.packageDesc}</strong> : <span className="badge warn">add by hand</span>}
            </div>
            <div className="small muted">{x.foodName ? `${x.foodName}: ${x.servings} servings` : x.manual}</div>
            {x.warnings.map((w) => <div key={w} className="small" style={{ color: 'var(--warn)' }}>{w}</div>)}
          </div>
        ))}
      </div>
    </section>
  );
}

function Coverage({ r }: { r: PlanResult }) {
  return (
    <section className="card stack">
      <h2 style={{ margin: 0 }}>Everyone covered?</h2>
      <div className="list">
        {r.coverage.map((c) => (
          <div key={c.memberId} className="stack" style={{ gap: 4 }}>
            <div className="spread">
              <Link to={`/admin/members/${c.memberId}`}><strong>{c.name}</strong></Link>
              <span className="row" style={{ gap: 6 }}>
                {!c.hasSurvey && <span className="badge warn">no survey</span>}
                <span className="badge">{num(c.dailyCalories)} cal/day</span>
                <span className={`badge ${c.notes.some((n) => n.startsWith('Only')) ? 'warn' : 'ok'}`}>{c.mealOptions} main dish{c.mealOptions === 1 ? '' : 'es'} they’re happy with</span>
              </span>
            </div>
            {c.notes.map((n) => <div key={n} className="small muted">{n}</div>)}
            {c.suggestion && <div className="small">{c.suggestion}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

export function WaterTreatmentNote({ t }: { t: NonNullable<PlanResult['water']['treatment']> }) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div><strong>Make {num(t.gallons)} gal safe</strong> from day {t.fromDay} (about {num(t.gallonsPerDay)} gal a day)</div>
      <ol className="small" style={{ margin: 0, paddingLeft: 20 }}>
        <li>Collect from a source you’ve picked ahead of time (rain barrel, well, spring, stream or lake). Not from pools, floodwater or anything near chemicals or fuel.</li>
        <li>Let cloudy water settle, then pour it through a coffee filter or clean cloth.</li>
        <li>Run it through the water filter, then disinfect: 8 drops of unscented 6% bleach per gallon (6 drops if 8.25%), double if still cloudy. Stir and wait 30 minutes. Or boil for 1 minute (3 minutes above 6,500 ft).</li>
      </ol>
      <div className="small muted">Bleach for all of it: about {t.bleachOz} fl oz (doubled for cloudy water). Bleach weakens over time, so replace it every 6–12 months. Source: CDC, “Making Water Safe in an Emergency”.</div>
    </div>
  );
}

function WaterFuel({ r }: { r: PlanResult }) {
  return (
    <section className="card stack">
      <h2 style={{ margin: 0 }}>Water, fuel &amp; equipment</h2>
      <div className="grid">
        <div className="stack" style={{ gap: 4 }}>
          <h3 style={{ margin: 0 }}>Water</h3>
          <div><strong>Store {num(r.water.totalGallons)} gal</strong> for the first {r.water.drinkingDays} days</div>
          <div className="small muted">{num(r.water.drinkingGallons)} gal drinking + {num(r.water.prepGallons)} gal for preparing food</div>
          {r.water.treatment && <WaterTreatmentNote t={r.water.treatment} />}
          <div className="small muted">CDC minimum: 1 gallon per person per day. Hot climates, illness, nursing and pets need more.</div>
        </div>
        <div className="stack" style={{ gap: 4 }}>
          <h3 style={{ margin: 0 }}>Cooking fuel</h3>
          {r.fuel.burnerMinutes === 0 ? <div className="muted">None needed.</div> : (
            <>
              <div><strong>About {num(r.fuel.burnerMinutes / 60)} burner-hours</strong></div>
              <div className="small muted">Based on each food’s batch size and cook time (set in Catalog). Check your stove’s fuel use per hour and add extra.</div>
              <ul className="small" style={{ margin: 0, paddingLeft: 20 }}>{r.fuel.items.map((f) => <li key={f.name}>{f.name}: {f.minutes} min</li>)}</ul>
            </>
          )}
        </div>
        <div className="stack" style={{ gap: 4 }}>
          <h3 style={{ margin: 0 }}>Equipment</h3>
          <ul className="small" style={{ margin: 0, paddingLeft: 20 }}>
            {r.equipment.map((e) => (
              <li key={e.item}>{e.item}{e.foods.length > 0 && <span className="muted"> (for {e.foods.length > 3 ? `${e.foods.slice(0, 3).join(', ')} and ${e.foods.length - 3} more` : e.foods.join(', ')})</span>}</li>
            ))}
          </ul>
        </div>
        <div className="stack" style={{ gap: 4 }}>
          <h3 style={{ margin: 0 }}>Space &amp; cost</h3>
          <div>About {num(r.storage.knownLiters)} L of storage{r.storage.limitLiters ? ` (you have ${num(r.storage.limitLiters)} L)` : ''}</div>
          {r.storage.unknownItems > 0 && <div className="small muted">{r.storage.unknownItems} item(s) have no package size, so they aren’t counted.</div>}
          {r.cost.pricedItems > 0
            ? <div>{r.cost.total.toFixed(2)} for {r.cost.pricedItems} priced item(s){r.cost.unpricedItems ? `; ${r.cost.unpricedItems} not priced` : ''}</div>
            : <div className="small muted">No prices entered. Add them in Catalog to see a cost estimate.</div>}
        </div>
      </div>
    </section>
  );
}

async function addAnyway(tier: Tier, foodId: string, name: string, unsafe: string) {
  if (unsafe && !window.confirm(`${name} isn’t safe for ${unsafe}.

Add it to the shared supply anyway? It will be flagged on the plan; store it apart and labeled.`)) return;
  await setPlanOverride(tier, foodId, true);
}

/** Admin swap: replace a planned food with another (in every plan), or leave it out. */
function SwapPicker({ i, r, foods, names, done }: { i: PlannedItem; r: PlanResult; foods: FoodItem[]; names: Map<string, string>; done: () => void }) {
  const [to, setTo] = useState('');
  const inPlan = new Set(r.items.map((x) => x.foodId));
  const options = foods.filter((f) => f.active && f.id !== i.foodId).sort((a, b) => a.name.localeCompare(b.name));
  const same = options.filter((f) => f.category === i.category);
  const other = options.filter((f) => f.category !== i.category);
  const label = (f: FoodItem) => `${f.name}${inPlan.has(f.id) ? ' (already in plan)' : ''}${r.excluded.some((e) => e.foodId === f.id && e.reasons.length) ? ' (not safe for someone)' : ''}`;
  async function apply() {
    if (to === '') return;
    if (to === 'none') { await setPlanSubstitution(i.foodId, ''); return done(); }
    const f = foods.find((x) => x.id === to)!;
    const unsafe = r.excluded.find((e) => e.foodId === to)?.reasons.map((x) => names.get(x.memberId) ?? 'someone').join(', ');
    if (unsafe && !window.confirm(`${f.name} isn’t safe for ${unsafe}.

Use it instead of ${i.name} anyway? It will be flagged on the plan; store it apart and labeled.`)) return;
    await setPlanSubstitution(i.foodId, to);
    done();
  }
  return (
    <div className="row" style={{ gap: 8 }}>
      <select aria-label={`Swap ${i.name} for`} value={to} onChange={(e) => setTo(e.target.value)} style={{ maxWidth: 360 }}>
        <option value="">Swap {i.name} for…</option>
        <option value="none">Nothing: just leave it out</option>
        <optgroup label="Similar foods">{same.map((f) => <option key={f.id} value={f.id}>{label(f)}</option>)}</optgroup>
        <optgroup label="Other foods">{other.map((f) => <option key={f.id} value={f.id}>{label(f)}</option>)}</optgroup>
      </select>
      <button className="primary" disabled={!to} onClick={apply}>Swap</button>
      <button className="ghost" onClick={done}>Cancel</button>
      <span className="small muted">Applies to every plan. Undo it under Admin changes.</span>
    </div>
  );
}

function Additions({ r, tier, foods, names, subs }: { r: PlanResult; tier: Tier; foods: FoodItem[]; names: Map<string, string>; subs: Record<string, string> }) {
  const [pick, setPick] = useState('');
  const overrides = (r.overrides ?? []).filter((o) => !o.replaces);
  const swaps = Object.entries(subs);
  const fname = (id: string) => foods.find((f) => f.id === id)?.name ?? 'a food';
  const unsafeSwap = (id: string) => r.overrides?.find((o) => o.foodId === id && o.unsafeFor.length);
  const inPlan = new Set(r.items.map((i) => i.foodId));
  const choices = foods.filter((f) => f.active && !inPlan.has(f.id) && !(f.id in subs)).sort((a, b) => a.name.localeCompare(b.name));
  const who = (o: NonNullable<PlanResult['overrides']>[number]) => o.unsafeFor.map((x) => names.get(x.memberId) ?? 'someone').join(', ');
  async function add() {
    const f = foods.find((x) => x.id === pick);
    if (!f) return;
    const ex = r.excluded.find((e) => e.foodId === f.id);
    await addAnyway(tier, f.id, f.name, ex?.reasons.map((x) => names.get(x.memberId) ?? 'someone').join(', ') ?? '');
    setPick('');
  }
  return (
    <section className="card stack">
      <h2 style={{ margin: 0 }}>Admin changes</h2>
      {swaps.length > 0 && (
        <>
          <h3 style={{ margin: 0 }}>Swaps (all plans)</h3>
          <div className="list">
            {swaps.map(([from, to]) => (
              <div key={from} className="spread">
                <div>
                  <strong>{fname(from)}</strong> → {to ? <strong>{fname(to)}</strong> : <span className="muted">left out</span>}
                  {to && unsafeSwap(to) && <div className="small" style={{ color: 'var(--danger)' }}>Not safe for {unsafeSwap(to)!.unsafeFor.map((x) => names.get(x.memberId) ?? 'someone').join(', ')}</div>}
                </div>
                <button onClick={() => setPlanSubstitution(from, undefined)}>Undo</button>
              </div>
            ))}
          </div>
        </>
      )}
      <h3 style={{ margin: 0 }}>Additions ({TIER_LABEL[tier].toLowerCase()})</h3>
      <p className="small muted" style={{ margin: 0 }}>To replace a food, use “Swap or leave out…” on it in the list above. Add a food to the {TIER_LABEL[tier].toLowerCase()} supply list by hand, even if the planner left it out. It gets at least one package; amounts adjust with the rest of the plan. Applies to both cooking scenarios.</p>
      {overrides.length > 0 && (
        <div className="list">
          {overrides.map((o) => (
            <div key={o.foodId} className="spread">
              <div>
                <strong>{o.name}</strong>
                {o.unsafeFor.length > 0 && <div className="small" style={{ color: 'var(--danger)' }}>Not safe for {who(o)}</div>}
              </div>
              <button onClick={() => setPlanOverride(tier, o.foodId, false)}>Remove</button>
            </div>
          ))}
        </div>
      )}
      <div className="row">
        <select aria-label="Food to add" value={pick} onChange={(e) => setPick(e.target.value)} style={{ maxWidth: 360 }}>
          <option value="">Choose a food…</option>
          {choices.map((f) => <option key={f.id} value={f.id}>{f.name}{r.excluded.some((e) => e.foodId === f.id && e.reasons.length) ? ' (left out for someone’s safety)' : ''}</option>)}
        </select>
        <button className="primary" disabled={!pick} onClick={add}>Add to plan</button>
      </div>
    </section>
  );
}

function Excluded({ r, names, tier }: { r: PlanResult; names: Map<string, string>; tier: Tier }) {
  const people = r.excluded.filter((e) => e.reasons.length);
  const scenario = r.excluded.filter((e) => !e.reasons.length);
  return (
    <section className="card stack">
      <h2 style={{ margin: 0 }}>Left out</h2>
      <details>
        <summary>{people.length} food{people.length === 1 ? '' : 's'} not stocked because of someone’s allergy or restriction</summary>
        <div className="list" style={{ marginTop: 8 }}>
          {people.map((e) => (
            <div key={e.foodId} className="spread">
              <div>
                <strong>{e.name}</strong>
                <div className="small muted">{e.reasons.map((x) => `${names.get(x.memberId)}: ${x.reasons.join(', ')}`).join(' · ')}</div>
              </div>
              <button className="ghost small" onClick={() => addAnyway(tier, e.foodId, e.name, e.reasons.map((x) => names.get(x.memberId) ?? 'someone').join(', '))}>Add anyway</button>
            </div>
          ))}
        </div>
      </details>
      {[...new Set(scenario.map((e) => e.scenarioOnly ?? ''))].map((why) => {
        const list = scenario.filter((e) => (e.scenarioOnly ?? '') === why);
        return (
          <details key={why}>
            <summary>{list.length} food{list.length === 1 ? '' : 's'} not used in this plan: {why === NEEDS_COOKING ? 'they need heat or cooking' : why === ADMIN_REMOVED ? 'swapped out or left out by admin' : why || 'scenario'}</summary>
            <div className="list" style={{ marginTop: 8 }}>
              {list.map((e) => (
                <div key={e.foodId} className="spread"><span className="small">{e.name}</span>{why === ADMIN_REMOVED ? <span className="small muted">Undo under Admin changes</span> : <button className="ghost small" onClick={() => addAnyway(tier, e.foodId, e.name, '')}>Add anyway</button>}</div>
              ))}
            </div>
          </details>
        );
      })}
    </section>
  );
}
