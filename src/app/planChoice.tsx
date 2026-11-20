// Which plan (short / medium / long supply, and how it's eaten) the Dashboard and Inventory show.
// One choice shared by both pages, remembered on this device.
import { useSyncExternalStore } from 'react';
import { defaultScenario, SCENARIO_LABEL, TIER_LABEL } from '../data/planRepo';
import type { Scenario, Tier } from '../domain/types';

export const TIERS: Tier[] = ['short', 'medium', 'long'];
export const SCENARIOS: Scenario[] = ['no-cook', 'limited-cook'];
const KEY = 'planChoice';

interface Choice { tier: Tier; scenario: Scenario }
const listeners = new Set<() => void>();
let cached: { raw: string | null; value: Choice } | undefined;

function read(): Choice {
  let raw: string | null = null;
  try { raw = localStorage.getItem(KEY); } catch { /* storage blocked */ }
  if (cached && cached.raw === raw) return cached.value;
  let value: Choice = { tier: 'short', scenario: defaultScenario('short') };
  try {
    const p = JSON.parse(raw ?? '') as Partial<Choice>;
    if (TIERS.includes(p.tier as Tier)) value = { tier: p.tier!, scenario: SCENARIOS.includes(p.scenario as Scenario) ? p.scenario! : defaultScenario(p.tier!) };
  } catch { /* nothing saved */ }
  cached = { raw, value };
  return value;
}

export function setPlanChoice(c: Choice) {
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* not remembered */ }
  cached = { raw: JSON.stringify(c), value: c };
  listeners.forEach((l) => l());
}

export function usePlanChoice(): Choice {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, read, read);
}

/** The three supply buttons plus the how-it's-eaten choice. */
export function PlanPicker() {
  const { tier, scenario } = usePlanChoice();
  return (
    <div className="row" role="group" aria-label="Which plan">
      {TIERS.map((t) => (
        <button key={t} aria-pressed={tier === t} className={tier === t ? 'primary' : ''} onClick={() => setPlanChoice({ tier: t, scenario: defaultScenario(t) })}>{TIER_LABEL[t]}</button>
      ))}
      <select aria-label="How food is eaten" value={scenario} onChange={(e) => setPlanChoice({ tier, scenario: e.target.value as Scenario })} style={{ maxWidth: 200 }}>
        {SCENARIOS.map((s) => <option key={s} value={s}>{SCENARIO_LABEL[s]}</option>)}
      </select>
    </div>
  );
}
