import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/session';
import { db } from '../../data/db';
import { computePlan, defaultScenario, SCENARIO_LABEL, TIER_LABEL } from '../../data/planRepo';
import { EXPIRING_SOON_DAYS, stockStatus } from '../../domain/inventory';
import { buildMealIdeas, type MealIdea, type MealType } from '../../domain/meals';
import type { ID, Scenario, Tier } from '../../domain/types';

const TIERS: Tier[] = ['short', 'medium', 'long'];
const SCENARIOS: Scenario[] = ['no-cook', 'limited-cook'];
const MEALS: (MealType | 'All')[] = ['All', 'Breakfast', 'Lunch', 'Dinner'];
const today = () => new Date().toISOString().slice(0, 10);

export default function Meals() {
  const { dek } = useSession();
  const [params, setParams] = useSearchParams();
  const tier = (TIERS.includes(params.get('tier') as Tier) ? params.get('tier') : 'long') as Tier;
  const scenario = (SCENARIOS.includes(params.get('scenario') as Scenario) ? params.get('scenario') : defaultScenario(tier)) as Scenario;
  const source = params.get('source') === 'stock' ? 'stock' : 'plan';
  const meal = (MEALS.includes(params.get('meal') as MealType) ? params.get('meal') : 'All') as MealType | 'All';
  const set = (patch: Record<string, string>) => setParams({ tier, scenario, source, meal, ...patch }, { replace: true });

  const plan = useLiveQuery(() => computePlan(tier, scenario, dek), [tier, scenario, dek]);
  const stock = useLiveQuery(() => db.stock.toArray(), []);
  const hh = useLiveQuery(() => db.households.toCollection().first(), []);

  const result = useMemo(() => {
    if (!plan || !stock) return undefined;
    const { input, result: r } = plan;
    const available = new Map<ID, number>();
    if (source === 'plan') {
      for (const i of r.items) available.set(i.foodId, (available.get(i.foodId) ?? 0) + i.packages * i.servingsPerPackage);
    } else {
      // On hand, minus anything kept out of the plan for someone's allergy or restriction.
      const unsafe = new Set(r.excluded.filter((e) => e.reasons.length).map((e) => e.foodId));
      const warn = hh?.settings.expiryWarningDays ?? EXPIRING_SOON_DAYS;
      for (const e of stock) {
        if (e.kind !== 'food' || !e.foodId || unsafe.has(e.foodId) || stockStatus(e, today(), warn) === 'expired') continue;
        const f = input.foods.find((x) => x.id === e.foodId);
        if (f) available.set(f.id, (available.get(f.id) ?? 0) + e.quantity * f.package.servingsPerPackage);
      }
    }
    return buildMealIdeas({
      available, foods: input.foods,
      dailyCalories: input.members.map((m) => m.dailyCalories ?? input.defaults.defaultDailyCalories),
      mealsPerDay: input.defaults.mealsPerDay, noCook: scenario === 'no-cook',
    });
  }, [plan, stock, hh, source, scenario]);

  const flags = useMemo(() => new Map(plan?.result.items.map((i) => [i.foodId, i.flags]) ?? []), [plan]);
  const shown = result?.ideas.filter((i) => meal === 'All' || i.recipe.meal === meal) ?? [];
  const people = plan?.input.members.length ?? 0;

  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>Meal ideas</h1>
      <p className="muted" style={{ margin: 0 }}>Simple recipes from your stored food, with amounts for one sitting for everyone. Fresh food is optional: add it when you have it.</p>
      <div className="row">
        <span className="small muted">Using:</span>
        <button className={source === 'plan' ? 'primary' : ''} aria-pressed={source === 'plan'} onClick={() => set({ source: 'plan' })}>Foods in the plan</button>
        <button className={source === 'stock' ? 'primary' : ''} aria-pressed={source === 'stock'} onClick={() => set({ source: 'stock' })}>What’s on hand</button>
      </div>
      <div className="row">
        {TIERS.map((t) => (
          <button key={t} role="tab" aria-selected={tier === t} className={tier === t ? 'primary' : ''} onClick={() => set({ tier: t, scenario: defaultScenario(t) })}>{TIER_LABEL[t]}</button>
        ))}
        <select aria-label="Scenario" value={scenario} onChange={(e) => set({ scenario: e.target.value })} style={{ maxWidth: 200 }}>
          {SCENARIOS.map((s) => <option key={s} value={s}>{SCENARIO_LABEL[s]}</option>)}
        </select>
      </div>
      <div className="row">
        {MEALS.map((m) => <button key={m} className={meal === m ? 'primary' : 'ghost'} aria-pressed={meal === m} onClick={() => set({ meal: m })}>{m}</button>)}
      </div>

      {!result || !plan ? <p className="muted">Loading…</p> : people === 0 ? (
        <div className="notice">Add your family on <Link to="/admin/members">Members</Link> first; amounts are sized for everyone on the roster.</div>
      ) : (
        <>
          <p className="small muted" style={{ margin: 0 }}>
            Sized for {people} {people === 1 ? 'person' : 'people'} and their daily calories, split over {plan.input.defaults.mealsPerDay} meals a day.
            {source === 'stock' ? ' Uses unexpired food you’ve logged on Inventory.' : ` Uses the foods in the ${TIER_LABEL[tier].toLowerCase()} plan.`}
            {' '}Fresh add-ins aren’t checked against anyone’s allergies.
          </p>
          {shown.length === 0 && <div className="notice">{source === 'stock' ? <>Nothing on hand makes these meals yet. Log food on <Link to="/admin/inventory">Inventory</Link>, or switch to “Foods in the plan”.</> : 'No meal ideas fit this plan’s foods.'}</div>}
          {shown.map((idea) => <IdeaCard key={idea.recipe.id} idea={idea} flags={flags} source={source} />)}
          {result.missing.length > 0 && (
            <details className="card">
              <summary>{result.missing.length} more recipe{result.missing.length === 1 ? '' : 's'} need foods that aren’t {source === 'stock' ? 'on hand' : 'in this plan'}</summary>
              <ul className="small">{result.missing.filter((m) => meal === 'All' || m.recipe.meal === meal).map((m) => <li key={m.recipe.id}><strong>{m.recipe.name}</strong>: needs {m.needs.join(', ')}</li>)}</ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

function IdeaCard({ idea, flags, source }: { idea: MealIdea; flags: Map<ID, string[]>; source: 'plan' | 'stock' }) {
  const { recipe } = idea;
  const notes = [...new Set(idea.lines.flatMap((l) => flags.get(l.foodId) ?? []).filter((f) => !f.startsWith('Keeps up to')))];
  return (
    <section className="card stack">
      <div className="spread">
        <h2 style={{ margin: 0 }}>{recipe.name}</h2>
        <span className="row" style={{ gap: 6 }}>
          <span className="badge">{recipe.meal}</span>
          <span className={`badge ${recipe.heat ? 'warn' : 'ok'}`}>{recipe.heat ? 'Needs heat' : 'No cooking needed'}</span>
        </span>
      </div>
      <div className="small muted">
        Serves {idea.people} · about {idea.caloriesPerPerson.toLocaleString()} calories each
        {idea.waterCups > 0 && <> · {idea.waterCups} cups of water to cook</>}
        {' · '}{source === 'stock' ? 'enough on hand' : 'the plan has enough'} for {idea.sittings === 1 ? '1 sitting' : `${idea.sittings} sittings`}
      </div>
      <table className="table">
        <tbody>
          {idea.lines.map((l) => (
            <tr key={l.label}>
              <td><strong>{l.amount}</strong>{l.packageNote && <div className="small muted">{l.packageNote}</div>}</td>
              <td>{l.name}{l.optional && <span className="small muted"> (optional)</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ol style={{ margin: 0, paddingLeft: 20 }}>{recipe.steps.map((s) => <li key={s}>{s}</li>)}</ol>
      {recipe.freshAddIns.length > 0 && <div className="small"><strong>If you have fresh food:</strong> {recipe.freshAddIns.join(' · ')}</div>}
      {notes.length > 0 && <div className="small muted">Heads up: {notes.join(' · ')}</div>}
    </section>
  );
}
