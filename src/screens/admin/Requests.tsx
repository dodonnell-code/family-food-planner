import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { setPlanOverride } from '../../data/adminRepo';
import { loadFamilyRequests, setRequestDone } from '../../data/requestsRepo';
import { matchFoods, REQUEST_LABEL, type FamilyRequest } from '../../domain/requests';
import { ADMIN_REMOVED, type PlanResult } from '../../domain/planner';
import type { FoodItem, Tier } from '../../domain/types';

const WHERE: { tier: Tier; label: string }[] = [
  { tier: 'short', label: 'All plans' },
  { tier: 'medium', label: '14- and 90-day' },
  { tier: 'long', label: '90-day only' },
];

/** What the family asked for in their surveys ("Foods we should add", "Comfort meals"). */
export function FamilyRequests({ r, foods, names }: { r: PlanResult; foods: FoodItem[]; names: Map<string, string> }) {
  const data = useLiveQuery(() => loadFamilyRequests(), []);
  const [showDone, setShowDone] = useState(false);
  if (!data) return null;
  const { open, done } = data;
  return (
    <details className="card stack" id="requests">
      <summary className="spread">
        <h2 style={{ margin: 0, display: 'inline' }}>Family requests {open.length > 0 && <span className="badge warn">{open.length}</span>}</h2>
        {done.length > 0 && <button className="ghost small" onClick={(e) => { e.preventDefault(); setShowDone((x) => !x); }}>{showDone ? 'Hide' : 'Show'} {done.length} done</button>}
      </summary>
      <p className="small muted" style={{ margin: 0 }}>Foods and comfort meals people asked for in their surveys. Add a matching catalog food to the plan, create a new catalog food, then mark it done.</p>
      {open.length === 0 && done.length === 0 && <p className="muted" style={{ margin: 0 }}>No requests yet. They’ll appear here as people finish their surveys.</p>}
      {open.length === 0 && done.length > 0 && <p className="muted" style={{ margin: 0 }}>All requests are dealt with.</p>}
      <div className="list">
        {open.map((q) => <RequestRow key={q.key} q={q} r={r} foods={foods} names={names} />)}
        {showDone && done.map((q) => (
          <div key={q.key} className="spread">
            <span className="muted"><strong>{q.memberName}</strong> · {REQUEST_LABEL[q.kind]}: “{q.text}”</span>
            <button className="ghost small" onClick={() => setRequestDone(q.key, false)}>Reopen</button>
          </div>
        ))}
      </div>
    </details>
  );
}

/** Is the request in this plan already, and if not, why not? */
function requestStatus(suggestions: FoodItem[], r: PlanResult, names: Map<string, string>): { inPlan: boolean; text: string } {
  if (!suggestions.length) return { inPlan: false, text: 'Not in the plan: no matching food in the catalog yet.' };
  const hit = suggestions.find((f) => r.items.some((i) => i.foodId === f.id));
  if (hit) return { inPlan: true, text: `In this plan as ${hit.name}.` };
  const f = suggestions[0];
  const nc = r.notChosen?.find((x) => x.foodId === f.id);
  if (nc) return { inPlan: false, text: `Not in the plan: ${f.name} wasn’t chosen (${nc.reason}).` };
  const ex = r.excluded.find((x) => x.foodId === f.id);
  if (ex?.reasons.length) return { inPlan: false, text: `Not in the plan: ${f.name} isn’t safe for ${ex.reasons.map((x) => `${names.get(x.memberId) ?? 'someone'} (${x.reasons.join(', ')})`).join(', ')}.` };
  if (ex) return { inPlan: false, text: `Not in the plan: ${f.name} ${ex.scenarioOnly === ADMIN_REMOVED ? 'was swapped out or left out by admin' : 'needs cooking, and this is a no-cook plan'}.` };
  return { inPlan: false, text: `Not in the plan: ${f.name} isn’t used in this plan.` };
}

function RequestRow({ q, r, foods, names }: { q: FamilyRequest; r: PlanResult; foods: FoodItem[]; names: Map<string, string> }) {
  const suggestions = matchFoods(q.text, foods);
  const [food, setFood] = useState(suggestions[0]?.id ?? '');
  const [tier, setTier] = useState<Tier>('short');
  const [msg, setMsg] = useState('');
  const choices = foods.filter((f) => f.active).sort((a, b) => a.name.localeCompare(b.name));
  async function add() {
    const f = foods.find((x) => x.id === food);
    if (!f) return;
    const unsafe = r.excluded.find((e) => e.foodId === f.id)?.reasons.map((x) => names.get(x.memberId) ?? 'someone').join(', ');
    if (unsafe && !window.confirm(`${f.name} isn’t safe for ${unsafe}.\n\nAdd it to the shared supply anyway? It will be flagged on the plan; store it apart and labeled.`)) return;
    await setPlanOverride(tier, f.id, true);
    setMsg(`Added ${f.name} (${WHERE.find((w) => w.tier === tier)!.label.toLowerCase()}).`);
  }
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div><strong>{q.memberName}</strong> <span className="badge">{REQUEST_LABEL[q.kind]}</span></div>
      <div>“{q.text}”</div>
      {(() => { const st = requestStatus(suggestions, r, names); return <div className="small" style={{ color: st.inPlan ? 'var(--accent)' : 'var(--warn)' }}>{st.text}</div>; })()}
      {suggestions.length > 0 && <div className="small muted">Possible matches: {suggestions.map((f) => f.name).join(', ')}</div>}
      <div className="row" style={{ gap: 8 }}>
        <select aria-label={`Catalog food for ${q.memberName}’s request`} value={food} onChange={(e) => setFood(e.target.value)} style={{ maxWidth: 300 }}>
          <option value="">Choose a catalog food…</option>
          {suggestions.length > 0 && <optgroup label="Possible matches">{suggestions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</optgroup>}
          <optgroup label="All foods">{choices.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</optgroup>
        </select>
        <select aria-label="Which plans" value={tier} onChange={(e) => setTier(e.target.value as Tier)} style={{ maxWidth: 240 }}>
          {WHERE.map((w) => <option key={w.tier} value={w.tier}>{w.label}</option>)}
        </select>
        <button className="primary" disabled={!food} onClick={add}>Add to plan</button>
      </div>
      <div className="row small" style={{ gap: 12 }}>
        <Link to={`/admin/catalog/new?name=${encodeURIComponent(q.text.split(/[,;\n]/)[0].trim().slice(0, 60))}`}>Not in the catalog? Create it</Link>
        <button className="ghost small" onClick={() => setRequestDone(q.key, true)}>Mark done</button>
      </div>
      {msg && <div className="notice ok small" role="status">{msg} Mark it done when you’re finished.</div>}
    </div>
  );
}
