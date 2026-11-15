// Hard safety matching between a food and a person's restrictions. Shared by the survey
// (to hide unsafe items) and the planning engine (hard exclusions — scope §7 step 2).
import type { FoodItem, FoodKind, MemberRestriction } from './types';
import { subjectLabel } from '../app/ui';

export interface SafetyResult {
  /** Reasons this food must never be served to the person (so never in a group meal they eat). */
  blocked: string[];
  /** Reasons the admin should double-check (e.g. "may contain" without a cross-contact concern). */
  warnings: string[];
  /** Preferences ("Don't like"): count against the food when choosing group meals; not a safety issue. */
  disliked: string[];
  /** Non-strict intolerances: 'avoid' (heavy penalty, flagged) and 'minor' (small penalty). */
  avoid: string[];
  minor: string[];
}

/** Allergen codes a restriction subject covers (gluten implies wheat-containing items). */
const ALLERGEN_ALIASES: Record<string, string[]> = {
  gluten: ['gluten', 'wheat'],
  fish: ['fish'],
  shellfish: ['shellfish'],
};

const norm = (s: string) => s.toLowerCase().trim();

/** One kind of a generic food, as a food of its own (its allergens and tags). */
export function kindFood(food: FoodItem, k: FoodKind): FoodItem {
  return {
    ...food, kinds: undefined, name: `${food.name}: ${k.name}`, examples: k.name, tags: k.tags ?? food.tags,
    allergens: {
      ...food.allergens,
      contains: [...new Set([...food.allergens.contains, ...(k.contains ?? [])])],
      mayContain: [...new Set([...(food.allergens.mayContain ?? []), ...(k.mayContain ?? [])])],
    },
  };
}

/** Each kind of a food with what makes it unsafe (blocked) or disliked for this person. */
export function checkKinds(food: FoodItem, restrictions: MemberRestriction[]): { kind: FoodKind; result: SafetyResult }[] {
  return (food.kinds ?? []).map((kind) => ({ kind, result: checkOne(kindFood(food, kind), restrictions) }));
}

/**
 * Safety for a food. A generic food with kinds (e.g. canned soups) is safe for someone when
 * at least one kind is: the shopping list then says which kinds to skip for them.
 */
export function checkFood(food: FoodItem, restrictions: MemberRestriction[]): SafetyResult {
  const base = checkOne(food, restrictions);
  if (!food.kinds?.length) return base;
  // Each kind carries the food's own allergens plus its own, and its own diet tags.
  const kinds = checkKinds(food, restrictions);
  const safe = kinds.filter((x) => !x.result.blocked.length);
  if (!safe.length) return { ...base, blocked: [...new Set(kinds.flatMap((x) => x.result.blocked))] };
  const skip = kinds.filter((x) => x.result.blocked.length).map((x) => x.kind.name);
  // A dislike of one kind (e.g. tuna) doesn't count against the whole food unless every safe kind is disliked.
  const disliked = safe.every((x) => x.result.disliked.length) ? [...new Set(safe.flatMap((x) => x.result.disliked))] : [];
  return { ...base, blocked: [], disliked, warnings: skip.length ? [...base.warnings, `Only some kinds are safe (skip: ${skip.join(', ')})`] : base.warnings };
}

function checkOne(food: FoodItem, restrictions: MemberRestriction[]): SafetyResult {
  const blocked: string[] = [];
  const warnings: string[] = [];
  const disliked: string[] = [];
  const avoid: string[] = [];
  const minor: string[] = [];
  const contains = new Set<string>(food.allergens.contains);
  const mayContain = new Set<string>(food.allergens.mayContain ?? []);
  const tags = new Set(food.tags);

  for (const r of restrictions) {
    if (!r.active) continue;
    const s = r.subject;
    const label = subjectLabel(s);

    if (r.type === 'dislike') {
      const term = norm(s.replace(/^food:/, ''));
      if (term && norm(`${food.name} ${food.examples ?? ''}`).includes(term)) disliked.push(`Doesn’t like ${label}`);
      continue;
    }

    if (s.startsWith('diet:')) {
      if (s === 'diet:vegan' && !tags.has('vegan')) blocked.push(`Not vegan`);
      if (s === 'diet:vegetarian' && !tags.has('vegetarian') && !tags.has('vegan')) blocked.push(`Not vegetarian`);
      continue;
    }
    if (s.startsWith('no:')) {
      const what = s.slice(3);
      if (tags.has(what) || (what === 'fish' && (contains.has('fish') || contains.has('shellfish')))) blocked.push(`Contains ${what}`);
      continue;
    }
    if (s.startsWith('texture:')) {
      if (!tags.has('soft-texture')) warnings.push(`Check texture (${label})`);
      continue;
    }
    if (s.startsWith('food:')) {
      const term = norm(s.slice(5));
      const hay = norm(`${food.name} ${food.examples ?? ''}`);
      if (term && hay.includes(term)) blocked.push(`${label} (can't eat)`);
      continue;
    }
    // Allergen code
    const codes = ALLERGEN_ALIASES[s] ?? [s];
    const lenient = r.type === 'intolerance' && (r.strictness === 'avoid' || r.strictness === 'minor');
    if (lenient) {
      // Non-strict intolerance: only what the food contains matters; "may contain" is ignored.
      if (codes.some((c) => contains.has(c))) (r.strictness === 'avoid' ? avoid : minor).push(`Contains ${label}`);
    } else if (codes.some((c) => contains.has(c))) {
      blocked.push(`Contains ${label}`);
    } else if (codes.some((c) => mayContain.has(c))) {
      if (r.cautionCrossContact || r.type === 'allergy') blocked.push(`May contain ${label}`);
      else warnings.push(`May contain ${label}`);
    }
  }
  return { blocked, warnings, disliked, avoid, minor };
}

export const isBlocked = (food: FoodItem, restrictions: MemberRestriction[]) => checkFood(food, restrictions).blocked.length > 0;

/** Unsafe or disliked for this person (used e.g. to skip foods in their survey). */
export const isExcluded = (food: FoodItem, restrictions: MemberRestriction[]) => {
  const r = checkFood(food, restrictions);
  return r.blocked.length > 0 || r.disliked.length > 0;
};
