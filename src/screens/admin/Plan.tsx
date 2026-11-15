import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/session';
import { db } from '../../data/db';
import { allergenLine, fmtDate, nutritionFacts } from '../../app/ui';
import { setHandPick, setPlanOverride, setPlanPicks, setPlanQuantity, setPlanSubstitution } from '../../data/adminRepo';
import { CATEGORY_LABELS } from './Catalog';
import { FamilyRequests } from './Requests';
import { computePlan, defaultScenario, savePlanSnapshot, savedPlans, SCENARIO_LABEL, TIER_LABEL } from '../../data/planRepo';
import { ADMIN_REMOVED, BUCKET_LABEL, diffPlans, NEEDS_COOKING, TIER_WEIGHTS, type Bucket, type PlanDiffRow, type PlannedItem, type PlanResult } from '../../domain/planner';
import type { FoodCategory, FoodItem, Scenario, Tier } from '../../domain/types';

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
          <div className="row" role="radiogroup" aria-label="How foods are chosen">
            <span className="small muted">Foods:</span>
            <button role="radio" aria-checked={!plan.result.handPick} className={!plan.result.handPick ? 'primary' : ''} style={{ minHeight: 40 }} onClick={() => setHandPick(tier, false)}>Planner chooses</button>
            <button role="radio" aria-checked={!!plan.result.handPick} className={plan.result.handPick ? 'primary' : ''} style={{ minHeight: 40 }} onClick={() => setHandPick(tier, true)}>I pick</button>
          </div>
          <CalorieGoal r={plan.result} tier={tier} />
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

          {plan.result.handPick && <HandPicker r={plan.result} tier={tier} foods={plan.input.foods} names={names} picks={hh?.planOverrides?.[tier] ?? []} />}
          <ShoppingList r={plan.result} names={names} foods={plan.input.foods} />
          {plan.result.reserved.length > 0 && <Reserved r={plan.result} names={names} />}
          <Coverage r={plan.result} />
          <WaterFuel r={plan.result} />
          <FamilyRequests r={plan.result} foods={plan.input.foods} names={names} />
          <Additions r={plan.result} tier={tier} foods={plan.input.foods} names={names} subs={hh?.planSubstitutions ?? {}} />
          <Excluded r={plan.result} names={names} tier={tier} />
          <p className="small muted">
            How foods are chosen: first, anything unsafe for someone is left out. Then, in each group (main dishes, grains, fruit &amp; vegetables, snacks, drinks), the plan takes preparedness staples (rice, beans, potatoes), your admin additions, and family favorites (everyone rated it 3+ and the average is 4+), best-loved first. The rest is filled by score, keeping a mix of fruit and vegetables and no more than two foods of the same kind (e.g. two fish). Longer plans get more variety. Calories are split so main dishes and grains carry most of them, with fruit, vegetables and snacks for nutrition and morale.{' '}
            Scores for this horizon: family acceptance {TIER_WEIGHTS[tier].acceptance}%, nutrition {TIER_WEIGHTS[tier].nutrition}%, ease of preparation {TIER_WEIGHTS[tier].prep}%, storage life {TIER_WEIGHTS[tier].storage}%, cost &amp; space {TIER_WEIGHTS[tier].cost}%, convenience {TIER_WEIGHTS[tier].convenience}%.
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
  if (r.diet) stats.push(
    ['Variety', `${r.diet.distinct.total} foods`, `${r.diet.distinct.mains} main dishes · ${r.diet.distinct.fruits} fruits · ${r.diet.distinct.vegetables} vegetables`],
    ['Protein', `${r.diet.proteinPct}% of calories`, `about ${r.diet.proteinGPerPersonDay} g per person a day (aim 10%+)`],
    ['Fruit & vegetables', `${num(r.diet.produceServingsPerPersonDay)} a day`, 'servings per person (aim 2+)'],
  );
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
          <div className="list">{r.items.filter((i) => i.bucket === b).map((i) => <ItemRow key={i.foodId} i={i} names={names} r={r} foods={foods} tier={r.tier} />)}</div>
        </div>
      ))}
    </section>
  );
}

function ItemRow({ i, names, r, foods, tier }: { i: PlannedItem; names: Map<string, string>; r: PlanResult; foods: FoodItem[]; tier: Tier }) {
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
      <NutritionLine i={i} foods={foods} />
      {(allergenLine(i.allergens) || i.safetyNotes) && (
        <div className="small muted">{allergenLine(i.allergens) && <><strong>Check labels:</strong> {allergenLine(i.allergens)}. </>}{i.safetyNotes}</div>
      )}
      {swapping ? <SwapPicker i={i} r={r} foods={foods} names={names} done={() => setSwapping(false)} />
        : (
          <div className="row" style={{ gap: 6 }}>
            {r.handPick && !i.fromBase
              ? <button className="ghost small" onClick={() => setPlanOverride(tier, i.foodId, false)}>Remove</button>
              : <button className="ghost small" onClick={() => setSwapping(true)}>Swap or leave out…</button>}
            <QtyControl key={`${i.foodId}:${i.packages}`} i={i} tier={tier} />
          </div>
        )}
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

/** Stored water: drinking (people × gallons × days) and cooking water, listed separately. */
export function WaterStored({ r }: { r: PlanResult }) {
  const perPerson = r.people && r.water.drinkingDays ? r.water.drinkingGallons / r.people / r.water.drinkingDays : 0;
  return (
    <div className="stack" style={{ gap: 2 }}>
      <div><strong>{num(r.water.drinkingGallons)} gal drinking water</strong> to store</div>
      <div className="small muted">{num(perPerson)} gal × {r.people} {r.people === 1 ? 'person' : 'people'} × {r.water.drinkingDays} days</div>
      {r.water.prepGallons > 0 && <div>+ {num(r.water.prepGallons)} gal for cooking <span className="small muted">(rice, beans, freeze-dried meals over those {r.water.drinkingDays} days)</span></div>}
      <div className="small muted">Total to store: {num(r.water.totalGallons)} gal</div>
    </div>
  );
}

export function WaterTreatmentNote({ t }: { t: NonNullable<PlanResult['water']['treatment']> }) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div><strong>Make {num(t.gallons)} gal safe</strong> from day {t.fromDay} (about {num(t.gallonsPerDay)} gal a day for {t.days} days)</div>
      <ol className="small" style={{ margin: 0, paddingLeft: 20 }}>
        <li><strong>Collect</strong> from a source you’ve picked ahead of time (rain barrel, well, spring, stream or lake). Not from pools, floodwater or anything near chemicals or fuel.</li>
        <li><strong>Pre-filter:</strong> let cloudy water settle, then pour it through a coffee filter or clean cloth.</li>
        <li><strong>Disinfect:</strong> a 1-minute rolling boil (3 minutes above 6,500 ft), or chlorine dioxide purification tablets (follow the package). Boiling all of it would take about {t.boilHours} hours of stove time, so tablets save a lot of fuel.</li>
        <li><strong>Filter</strong> through the gravity filter (Berkey or similar). It removes much of what’s left and the chemical taste. Check its elements are rated for at least {num(t.gallons)} gal, and keep a spare set. If it fails, use the portable squeeze filter.</li>
        <li><strong>Last resort</strong> if you run out of tablets and fuel: 8 drops of unscented 6% bleach per gallon (6 drops if 8.25%), double if cloudy; stir and wait 30 minutes. About {t.bleachOz} fl oz would cover it all; bleach weakens, so replace it every 6–12 months.</li>
      </ol>
      <div className="small muted">Why disinfect as well as filter: gravity filters like Berkey aren’t independently certified (NSF/ANSI) to remove viruses, Berkey advises disinfecting questionable water, and the CDC notes many filters may not remove viruses and bacteria. Sources: CDC, “Making Water Safe in an Emergency” and “Choosing Home Water Filters”. Follow your filter maker’s instructions for cleaning and replacing elements.</div>
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
          <WaterStored r={r} />
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

/** Prominent alert when the plan can't reach the calorie goal, and what was added to get there. */
function CalorieGoal({ r, tier }: { r: PlanResult; tier: Tier }) {
  const t = r.topUp;
  if (!r.people || !t) return null;
  if (t.shortCalories > 0) {
    const days = r.dailyCaloriesTotal ? Math.round((t.shortCalories / r.dailyCaloriesTotal) * 10) / 10 : 0;
    return (
      <div className="notice danger stack" style={{ gap: 8, fontSize: '1.05rem' }} role="alert">
        <strong>This plan is {num(t.shortCalories)} calories short of the goal (about {num(days)} days of food for everyone).</strong>
        <span>{r.handPick ? 'Pick more foods below, or raise the amounts of foods you picked.' : 'Add foods from the suggestions, or raise the amounts of foods in the plan.'}</span>
        <Suggestions r={r} tier={tier} />
      </div>
    );
  }
  if (!t.increased.length) return null;
  return (
    <div className="notice stack" style={{ gap: 6 }} role="status">
      <strong>To reach the calorie goal, the plan increased: {t.increased.join(', ')}.</strong>
      <span className="small muted">No new foods were added. Change any amount on its row below.</span>
    </div>
  );
}

/** Foods the admin could add, one at a time. */
function Suggestions({ r, tier, only }: { r: PlanResult; tier: Tier; only?: (n: NonNullable<PlanResult['notChosen']>[number]) => boolean }) {
  const list = (only ? (r.notChosen ?? []).filter(only).slice(0, 8) : r.topUp?.suggestions ?? []);
  if (!list.length) return <span className="small muted">No suggestions: every safe food the family accepts is already in. Add new foods in the Catalog.</span>;
  return (
    <div className="list" style={{ background: 'var(--surface, transparent)' }}>
      {list.map((n) => (
        <div key={n.foodId} className="spread">
          <div>
            <strong>{n.name}</strong> <span className="small muted">· {BUCKET_LABEL[n.bucket]}</span>
            <div className="small muted">{n.reason}</div>
          </div>
          <button className="small" onClick={() => setPlanOverride(tier, n.foodId, true)}>Add</button>
        </div>
      ))}
    </div>
  );
}

/** Nutrition facts per serving, or a note that they aren't available (with a link to enter them). */
function NutritionLine({ i, foods }: { i: PlannedItem; foods: FoodItem[] }) {
  const f = foods.find((x) => x.id === i.foodId);
  if (!f) return null;
  const n = nutritionFacts(f.nutrition);
  return (
    <div className="small">
      <strong>Nutrition</strong> <span className="muted">per {f.nutrition.servingDesc}:</span> {n.text}.
      {n.missing.length > 0 && <> <span style={{ color: 'var(--warn)' }}>{n.missing.length === 7 ? 'Other nutrition facts not available' : `Not available: ${n.missing.join(', ')}`}.</span> <Link to={`/admin/catalog/${f.id}`}>Enter them</Link></>}
      {f.nutrition.source && <span className="muted"> {f.nutrition.source}</span>}
    </div>
  );
}

/** Change how many packages of a food this plan stores. */
function QtyControl({ i, tier }: { i: PlannedItem; tier: Tier }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(i.packages));
  const [err, setErr] = useState('');
  const set = i.why.some((w) => w.startsWith('Amount set by admin'));
  async function save() {
    const n = Number(val);
    if (!Number.isFinite(n) || n < 0) { setErr('Enter 0 or more'); return; }
    await setPlanQuantity(tier, i.foodId, Math.round(n));
    setEditing(false);
  }
  if (!editing) return (
    <>
      <button className="ghost small" onClick={() => { setVal(String(i.packages)); setErr(''); setEditing(true); }}>Change amount</button>
      {set && <button className="ghost small" onClick={() => setPlanQuantity(tier, i.foodId, undefined)}>Use planner’s amount</button>}
    </>
  );
  return (
    <span className="row" style={{ gap: 6 }}>
      <label className="small">Packages <input type="number" min={0} step={1} inputMode="numeric" value={val} onChange={(e) => setVal(e.target.value)} style={{ width: 90 }} aria-label={`Packages of ${i.name}`} /></label>
      <span className="small muted">× {i.packageDesc || 'package'}</span>
      <button className="primary small" onClick={save}>Save</button>
      <button className="ghost small" onClick={() => setEditing(false)}>Cancel</button>
      {i.fromBase && <span className="small muted">At least {i.fromBase.packages} (the {i.fromBase.days}-day supply’s amount).</span>}
      {err && <span className="small" style={{ color: 'var(--danger)' }}>{err}</span>}
    </span>
  );
}

/** Hand-picked plan: tick foods from the whole catalog. */
function HandPicker({ r, tier, foods, names, picks }: { r: PlanResult; tier: Tier; foods: FoodItem[]; names: Map<string, string>; picks: string[] }) {
  const [q, setQ] = useState('');
  // Open at first when nothing is picked yet; after that, stays as the admin leaves it.
  const [open, setOpen] = useState(picks.length === 0);
  const picked = new Set(picks);
  const active = foods.filter((f) => f.active && (!q || f.name.toLowerCase().includes(q.toLowerCase())));
  const cats = (Object.keys(CATEGORY_LABELS) as FoodCategory[]).filter((c) => active.some((f) => f.category === c));
  const unsafe = (id: string) => r.excluded.find((e) => e.foodId === id && e.reasons.length)?.reasons.map((x) => names.get(x.memberId) ?? 'someone').join(', ');
  const cook = (id: string) => r.excluded.some((e) => e.foodId === id && e.scenarioOnly === NEEDS_COOKING);
  const fromCarry = new Set(r.items.filter((i) => i.fromBase).map((i) => i.foodId));
  async function toggle(f: FoodItem, on: boolean) {
    if (on) { await addAnyway(tier, f.id, f.name, unsafe(f.id) ?? ''); return; }
    await setPlanOverride(tier, f.id, false);
  }
  return (
    <details className="card stack" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary><h2 style={{ margin: 0, display: 'inline' }}>Pick foods for this plan</h2> <span className="badge">{picks.length} picked</span></summary>
      <p className="small muted" style={{ margin: '8px 0' }}>Tick what you want. The plan works out how much of each to store for everyone (change any amount on its row), and warns you if it falls short of the calorie goal. Foods marked “planner pick” are what the planner would have chosen.</p>
      <div className="row" style={{ gap: 8 }}>
        <input type="search" placeholder="Search foods" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 260 }} aria-label="Search foods" />
        <button className="small" onClick={() => setPlanPicks(tier, [...new Set([...picks, ...(r.plannerPicks ?? [])])])}>Add the planner’s picks</button>
        {picks.length > 0 && <button className="ghost small" onClick={() => window.confirm('Clear every pick from this plan?') && setPlanPicks(tier, [])}>Clear all</button>}
      </div>
      {cats.map((c) => (
        <div key={c} className="stack" style={{ gap: 4 }}>
          <h3 style={{ margin: '10px 0 0' }}>{CATEGORY_LABELS[c]}</h3>
          {active.filter((f) => f.category === c).sort((a, b) => a.name.localeCompare(b.name)).map((f) => (
            <label key={f.id} className="row" style={{ gap: 10, alignItems: 'center', minHeight: 40 }}>
              <input type="checkbox" checked={picked.has(f.id)} disabled={fromCarry.has(f.id)} onChange={(e) => toggle(f, e.target.checked)} style={{ width: 22, height: 22 }} />
              <span>{f.name}</span>
              {r.plannerPicks?.includes(f.id) && <span className="badge ok">planner pick</span>}
              {unsafe(f.id) && <span className="badge danger">not safe for {unsafe(f.id)}</span>}
              {cook(f.id) && <span className="badge warn">needs cooking</span>}
              {fromCarry.has(f.id) && <span className="badge">in the smaller supply</span>}
            </label>
          ))}
        </div>
      ))}
    </details>
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
      {swaps.some(([, to]) => !to) && !r.handPick && (
        <>
          <h3 style={{ margin: 0 }}>Suggestions to replace what you took out</h3>
          <p className="small muted" style={{ margin: 0 }}>Taking a food out doesn’t add anything new by itself; the foods still in the plan cover its calories. Add any of these one at a time.</p>
          <Suggestions r={r} tier={tier} only={(n) => swaps.some(([from, to]) => !to && foods.find((f) => f.id === from)?.category === foods.find((f) => f.id === n.foodId)?.category) && !n.reason.includes('like it')} />
        </>
      )}
      {!r.handPick && <>
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
      </>}
    </section>
  );
}

function Excluded({ r, names, tier }: { r: PlanResult; names: Map<string, string>; tier: Tier }) {
  const people = r.excluded.filter((e) => e.reasons.length);
  const scenario = r.excluded.filter((e) => !e.reasons.length);
  const notChosen = r.notChosen ?? [];
  return (
    <section className="card stack" id="left-out">
      <h2 style={{ margin: 0 }}>Left out</h2>
      <p className="small muted" style={{ margin: 0 }}>Survey foods that aren’t in this plan, and why. Tap Add to put one in.</p>
      {notChosen.length > 0 && !r.handPick && (
        <details>
          <summary>{notChosen.length} safe food{notChosen.length === 1 ? '' : 's'} not chosen (variety, ratings or score)</summary>
          <div className="list" style={{ marginTop: 8 }}>
            {notChosen.map((e) => (
              <div key={e.foodId} className="spread">
                <div>
                  <strong>{e.name}</strong>
                  <div className="small muted">{e.reason}</div>
                </div>
                <button className="ghost small" onClick={() => addAnyway(tier, e.foodId, e.name, '')}>Add</button>
              </div>
            ))}
          </div>
        </details>
      )}
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
