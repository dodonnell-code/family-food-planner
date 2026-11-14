// Hard safety matching between a food and a person's restrictions. Shared by the survey
// (to hide unsafe items) and the planning engine (hard exclusions — scope §7 step 2).
import type { FoodItem, MemberRestriction } from './types';
import { subjectLabel } from '../app/ui';

export interface SafetyResult {
  /** Reasons this food must never be served to the person (so never in a group meal they eat). */
  blocked: string[];
  /** Reasons the admin should double-check (e.g. "may contain" without a cross-contact concern). */
  warnings: string[];
  /** Preferences ("Don't like"): count against the food when choosing group meals; not a safety issue. */
  disliked: string[];
}

/** Allergen codes a restriction subject covers (gluten implies wheat-containing items). */
const ALLERGEN_ALIASES: Record<string, string[]> = {
  gluten: ['gluten', 'wheat'],
  fish: ['fish'],
  shellfish: ['shellfish'],
};

const norm = (s: string) => s.toLowerCase().trim();

export function checkFood(food: FoodItem, restrictions: MemberRestriction[]): SafetyResult {
  const blocked: string[] = [];
  const warnings: string[] = [];
  const disliked: string[] = [];
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
    if (codes.some((c) => contains.has(c))) {
      blocked.push(`Contains ${label}`);
    } else if (codes.some((c) => mayContain.has(c))) {
      if (r.cautionCrossContact || r.type === 'allergy') blocked.push(`May contain ${label}`);
      else warnings.push(`May contain ${label}`);
    }
  }
  return { blocked, warnings, disliked };
}

export const isBlocked = (food: FoodItem, restrictions: MemberRestriction[]) => checkFood(food, restrictions).blocked.length > 0;

/** Unsafe or disliked for this person (used e.g. to skip foods in their survey). */
export const isExcluded = (food: FoodItem, restrictions: MemberRestriction[]) => {
  const r = checkFood(food, restrictions);
  return r.blocked.length > 0 || r.disliked.length > 0;
};
