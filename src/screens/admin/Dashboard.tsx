// Dashboard: how ready the family is for the chosen plan, progress on all three supplies, and
// what needs rotating. Stock is changed on Inventory.
import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { useSession } from '../../app/session';
import { fmtDate } from '../../app/ui';
import { PlanPicker, TIERS, usePlanChoice } from '../../app/planChoice';
import { db } from '../../data/db';
import { computePlan, defaultScenario, TIER_LABEL } from '../../data/planRepo';
import { removeStock } from '../../data/inventoryRepo';
import { inventoryStatus } from '../../domain/inventory';
import type { FoodItem, StockEntry } from '../../domain/types';
import { num, STATUS_BADGE, today, useWarnDays } from './stock';

export default function Dashboard() {
  const { dek } = useSession();
  const { tier, scenario } = usePlanChoice();
  const plan = useLiveQuery(() => computePlan(tier, scenario, dek), [tier, scenario, dek]);
  const stock = useLiveQuery(() => db.stock.toArray(), []);
  const foods = useLiveQuery(() => db.foods.toArray(), []);
  const warnDays = useWarnDays();
  const status = useMemo(() => (plan && stock && foods ? inventoryStatus(plan.result, stock, foods, today(), warnDays) : undefined), [plan, stock, foods, warnDays]);
  const toBuyFoods = status?.rows.filter((r) => r.toBuy > 0).length ?? 0;

  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>Dashboard</h1>
      <PlanPicker />
      {!status || !plan ? <p className="muted">Loading…</p> : plan.input.members.length === 0 ? (
        <div className="notice">Add your family on <Link to="/admin/members">Members</Link> first; the plan sets what you need.</div>
      ) : (
        <>
          <div className="stats">
            <div className="card stat"><span className="small muted">Calories on hand</span><strong>{Math.round((status.totals.coveredCalories / Math.max(1, status.totals.plannedCalories)) * 100)}%</strong><span className="small muted">of the {plan.result.days}-day plan</span></div>
            <div className="card stat"><span className="small muted">Packages</span><strong>{num(status.totals.havePackages)} / {num(status.totals.needPackages)}</strong><span className="small muted">on hand / needed</span></div>
            <Link to="/admin/inventory?show=buy" className="card stat" style={{ color: 'inherit', textDecoration: 'none' }}><span className="small muted">Still to buy</span><strong>{status.totals.toBuyPackages}</strong><span className="small muted">packages, {toBuyFoods} foods ›</span></Link>
            <div className="card stat"><span className="small muted">Water</span><strong>{num(status.water.haveGallons)} / {num(status.water.needGallons)} gal</strong><span className="small muted">{status.water.toBuyGallons > 0 ? `${num(status.water.toBuyGallons)} gal to go` : 'covered'}</span></div>
          </div>
          <Stages stock={stock!} foods={foods!} warnDays={warnDays} dek={dek} />
          <Rotation rotation={status.rotation} warnDays={warnDays} />
        </>
      )}
    </div>
  );
}

/** Progress toward each supply. They're nested, so food on hand counts toward all three. */
function Stages({ stock, foods, warnDays, dek }: { stock: StockEntry[]; foods: FoodItem[]; warnDays: number; dek: CryptoKey | null }) {
  const plans = useLiveQuery(() => Promise.all(TIERS.map((t) => computePlan(t, defaultScenario(t), dek))), [dek]);
  if (!plans) return null;
  return (
    <section className="card stack" aria-label="Progress by supply">
      <h2 style={{ margin: 0 }}>Progress</h2>
      <p className="small muted" style={{ margin: 0 }}>The supplies build on each other: the {plans[0].result.days}-day supply is part of the {plans[1].result.days}-day one, and both are part of the {plans[2].result.days}-day one. Everything on hand counts toward all three, so fill them in order.</p>
      {plans.map(({ result }, i) => {
        const st = inventoryStatus(result, stock, foods, today(), warnDays);
        const pct = Math.min(100, Math.round((st.totals.coveredCalories / Math.max(1, st.totals.plannedCalories)) * 100));
        return (
          <div key={TIERS[i]} className="stack" style={{ gap: 4 }}>
            <div className="spread small"><strong>{TIER_LABEL[TIERS[i]]} · {result.days} days</strong><span className="muted">{pct}% of calories on hand · {st.totals.toBuyPackages} packages to go</span></div>
            <div style={{ height: 10, borderRadius: 5, background: 'var(--surface-2)', overflow: 'hidden' }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${TIER_LABEL[TIERS[i]]} progress`}>
              <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)' }} />
            </div>
          </div>
        );
      })}
    </section>
  );
}

function Rotation({ rotation, warnDays }: { rotation: ReturnType<typeof inventoryStatus>['rotation']; warnDays: number }) {
  return (
    <section className="card stack">
      <h2 style={{ margin: 0 }}>Rotate or replace</h2>
      {rotation.length === 0 ? <div className="notice ok">Nothing is within {warnDays} days of its best-by date.</div> : (
        <>
          <p className="small muted" style={{ margin: 0 }}>Items within {warnDays} days of their best-by date, or past it (change the warning time in Settings). Expired items don’t count as on hand. Use soon-to-expire food in everyday meals and buy replacements.</p>
          <div className="list">
            {rotation.map(({ entry, name, status: s }) => (
              <div key={entry.id} className="spread">
                <span><strong>{name}{entry.variety ? `: ${entry.variety}` : ''}</strong> · {num(entry.quantity)} {entry.kind === 'water' ? 'gal' : 'pkg'} · best by {fmtDate(entry.bestBy!)} <span className={`badge ${STATUS_BADGE[s].c}`}>{STATUS_BADGE[s].t}</span></span>
                <button className="ghost" onClick={() => removeStock(entry.id)}>Used or thrown out</button>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
