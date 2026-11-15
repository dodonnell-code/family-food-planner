// Planning engine — scope §7. Pure and deterministic: same inputs → same plan, so saved
// snapshots can be reproduced and compared. Decision order:
//   1. hard safeguards (allergies, diets, strict intolerances, "can't eat") keep a food out
//      of the stockpile entirely — we plan shared group meals, so a food unsafe for anyone
//      is not stocked at all;
//   2. medical food needs are reserved per person, separate from group food;
//   3. remaining foods are scored (acceptance, nutrition, prep, storage, cost, convenience)
//      and a varied set is chosen to cover everyone's calories for the horizon.
// Dislikes, "would refuse" answers and lenient intolerances count against a food; they never
// make an unsafe food safe or vice versa.
import { checkFood } from './safety';
import { BASIC_EQUIPMENT, equipmentFor } from './equipment';
import type { FoodCategory, FoodItem, ID, MemberNeed, MemberRestriction, PlanningDefaults, PrepMethod, PrepTolerance, RatingCode, Scenario, Tier } from './types';

export const ENGINE_VERSION = 'engine-4';
export const NEEDS_COOKING = 'Needs heat or cooking';
export const ADMIN_REMOVED = 'Swapped out or left out by admin';
/** Default cap on canned food in long-term plans with cooking (% of calories). */
export const LONG_TERM_CANNED_MAX_PERCENT = 20;

/** Starter weights from the scope (not scientifically validated). Sum = 100. */
export const WEIGHTS = { acceptance: 40, nutrition: 20, prep: 15, storage: 10, cost: 10, convenience: 5 } as const;
export type Weights = Record<keyof typeof WEIGHTS, number>;
/**
 * Weights by tier. A long-term reserve values shelf life and cost/space far more than
 * convenience: it's the dry-staples base (rice, beans, wheat, oats) that canned food tops up.
 */
export const TIER_WEIGHTS: Record<Tier, Weights> = {
  short: WEIGHTS,
  medium: WEIGHTS,
  long: { acceptance: 35, nutrition: 15, prep: 5, storage: 22, cost: 18, convenience: 5 },
};
/** Long-term reserves are judged on how long food keeps without rotation (in months). */
const LONG_TERM_TARGET_MONTHS = 60;

export interface PlanMember {
  id: ID;
  name: string;
  dailyCalories?: number;
  restrictions: MemberRestriction[];
  /** Active needs; `details` are the decrypted free-text params (product names etc.). */
  needs: (MemberNeed & { details?: Record<string, string> })[];
  /** Latest submitted survey (undefined = no survey yet). */
  surveyId?: ID;
  surveyCompletedAt?: string;
  ratings: Record<ID, RatingCode>;
  /** "Would refuse" answers the admin chose to stop applying. */
  ignoredRefusals: ID[];
  prep?: PrepTolerance;
}

export interface PlanInput {
  tier: Tier;
  scenario: Scenario;
  days: number;
  defaults: PlanningDefaults;
  members: PlanMember[];
  foods: FoodItem[];
  /** Admin override: always include these foods, even if the planner would leave them out. */
  include?: ID[];
  /** Admin swaps (all plans): food → replacement, or '' to leave it out. */
  substitutions?: Record<ID, ID | ''>;
  /** The next-smaller plan. Plans are nested: everything in it counts toward this one, and
   *  this plan only adds what's still needed on top. */
  base?: PlanResult;
}

export interface WaterTreatment {
  /** First day that relies on treated water. */
  fromDay: number;
  days: number;
  gallonsPerDay: number;
  gallons: number;
  /** Unscented bleach to treat it all, doubled for cloudy water (fl oz). */
  bleachOz: number;
}

/** Supplies to make water safe once stored water runs out (CDC: filter, then disinfect, or boil). */
export const WATER_TREATMENT_EQUIPMENT = [
  'Water filter (gravity or pump; removes bacteria and protozoa)',
  'Unscented household bleach (6–8.25%) and a medicine dropper',
  'Food-grade buckets or jugs to collect and treat water',
  'Coffee filters or clean cloth to pre-filter cloudy water',
];

export interface PlanOverride {
  foodId: ID;
  name: string;
  /** People it isn't safe for (empty when it was only left out by choice). */
  unsafeFor: ExcludedFood['reasons'];
  /** Set when it's in the plan as a swap for these foods (rather than an addition). */
  replaces?: { foodId: ID; name: string }[];
}

export interface MemberVerdict {
  memberId: ID;
  rating?: RatingCode;
  /** 'ok' or the strongest thing counting against it for this person. */
  /** 'unsafe' only appears on foods an admin added despite this person's allergy or restriction. */
  status: 'ok' | 'dislike' | 'refuse' | 'avoid' | 'minor' | 'prep' | 'unsafe';
  notes: string[];
}

export interface PlannedItem {
  foodId: ID;
  name: string;
  category: FoodCategory;
  bucket: Bucket;
  score: number;
  factors: Record<keyof typeof WEIGHTS, number>;
  servings: number;
  packages: number;
  /** Servings left over after rounding up to whole packages. */
  leftoverServings: number;
  calories: number;
  packageDesc: string;
  servingsPerPackage: number;
  prepWaterGallons: number;
  needsFuel: boolean;
  carbsG?: number;
  why: string[];
  flags: string[];
  confidence: 'high' | 'medium' | 'low';
  counts: { eligible: number; liked: number; neutral: number; disliked: number; unknown: number };
  verdicts: MemberVerdict[];
  /** Allergens on the generic catalog entry, and its label/safety note, to check when buying. */
  allergens?: { contains: string[]; mayContain: string[] };
  safetyNotes?: string;
  /** How much of this item comes from the smaller plan this one builds on. */
  fromBase?: { tier: Tier; days: number; packages: number };
  volumeL?: number;
  cost?: number;
  shelfLife: string;
}

export interface ReservedItem {
  memberId: ID;
  needId: ID;
  kind: string;
  label: string;
  foodId?: ID;
  foodName?: string;
  servings?: number;
  packages?: number;
  packageDesc?: string;
  /** Things the admin must add by hand (formula, specialty products…). */
  manual?: string;
  warnings: string[];
}

export interface ExcludedFood {
  foodId: ID;
  name: string;
  reasons: { memberId: ID; reasons: string[] }[];
  /** True when excluded only because of the scenario (e.g. needs cooking), not a person. */
  scenarioOnly?: string;
}

export interface MemberCoverage {
  memberId: ID;
  name: string;
  dailyCalories: number;
  mealOptions: number;
  mealOptionNames: string[];
  hasSurvey: boolean;
  suggestion?: string;
  notes: string[];
}

/** A piece of equipment and the planned foods that need it (empty = general use). */
export interface EquipmentNeed { item: string; foods: string[] }

export interface PlanResult {
  engineVersion: string;
  tier: Tier;
  scenario: Scenario;
  days: number;
  people: number;
  dailyCaloriesTotal: number;
  targetCalories: number;
  plannedCalories: number;
  items: PlannedItem[];
  reserved: ReservedItem[];
  excluded: ExcludedFood[];
  coverage: MemberCoverage[];
  /** Foods the admin added by hand (missing on plans saved before this existed). */
  overrides?: PlanOverride[];
  /** The smaller plan this one builds on (its food is included here). */
  base?: { tier: Tier; days: number; calories: number };
  /** Stored water covers the first `drinkingDays` days (drinking + food prep). After that, `treatment` says how much water to make safe. */
  water: { drinkingGallons: number; drinkingDays: number; prepGallons: number; totalGallons: number; fullHorizonGallons: number; treatment?: WaterTreatment };
  fuel: { burnerMinutes: number; items: { name: string; minutes: number }[] };
  equipment: EquipmentNeed[];
  storage: { knownLiters: number; unknownItems: number; limitLiters?: number };
  cost: { total: number; pricedItems: number; unpricedItems: number; budget?: number };
  warnings: string[];
}

// ---------------- Buckets (menu structure) ----------------
export type Bucket = 'mains' | 'starches' | 'produce' | 'snacks' | 'drinks';
const BUCKET_SHARE: Record<Bucket, number> = { mains: 0.42, starches: 0.25, produce: 0.13, snacks: 0.12, drinks: 0.08 };
const BUCKET_OF: Record<FoodCategory, Bucket> = {
  meal: 'mains', protein: 'mains', legume: 'mains',
  grain: 'starches',
  fruit: 'produce', vegetable: 'produce',
  'fat-snack': 'snacks',
  'dairy-alt': 'drinks', beverage: 'drinks',
};
export const BUCKET_LABEL: Record<Bucket, string> = {
  mains: 'Main dishes & proteins', starches: 'Grains & starches', produce: 'Fruit & vegetables', snacks: 'Snacks & spreads', drinks: 'Drinks & milk',
};
/** How many different foods to choose per bucket, by tier (more variety for longer horizons). */
/**
 * Core preparedness staples every plan with cooking should have, unless they're unsafe for
 * someone, the family doesn't want them, or an admin swaps them out. Each group lists foods in
 * order of preference; the first suitable one is used.
 */
export const STAPLES: Record<Tier, { label: string; options: ID[] }[]> = {
  short: [],
  medium: [
    { label: 'rice', options: ['white-rice', 'rice-pouch-rte'] },
    { label: 'beans', options: ['black-beans-canned', 'kidney-beans-canned', 'pinto-beans-dry', 'refried-beans-canned'] },
    { label: 'potatoes', options: ['potato-flakes'] },
  ],
  long: [
    { label: 'rice', options: ['white-rice'] },
    { label: 'beans', options: ['pinto-beans-dry', 'black-beans-canned', 'kidney-beans-canned'] },
    { label: 'potatoes', options: ['potato-flakes'] },
  ],
};

const PICKS: Record<Tier, Record<Bucket, number>> = {
  short: { mains: 3, starches: 2, produce: 2, snacks: 2, drinks: 1 },
  medium: { mains: 5, starches: 3, produce: 4, snacks: 3, drinks: 2 },
  long: { mains: 6, starches: 4, produce: 4, snacks: 3, drinks: 2 },
};

const PREP_EASE: Record<PrepMethod, number> = { 'ready-to-eat': 1, 'add-cold-water': 0.85, 'add-hot-water': 0.6, heat: 0.5, simmer: 0.4, boil: 0.3 };
const ROLE_UTILITY: Record<FoodItem['mealRole'], number> = { main: 1, staple: 0.8, side: 0.6, snack: 0.5, drink: 0.35 };
const NO_HEAT: PrepMethod[] = ['ready-to-eat', 'add-cold-water'];
/** Most servings of any one food per person per day, by category, so no single food dominates. */
const SERVING_CAP: Record<FoodCategory, number> = {
  protein: 0.5, legume: 1, meal: 1, grain: 2, fruit: 1.5, vegetable: 1.5, 'fat-snack': 1, 'dairy-alt': 1, beverage: 1,
};
/** Most servings per person per day from a whole group (Infinity = calorie carriers). */
const BUCKET_SERVINGS: Record<Bucket, number> = { mains: Infinity, starches: Infinity, produce: 2.5, snacks: 1.5, drinks: 1.5 };
/** No single food may supply more than this share of its group's calories (variety). */
const MAX_ITEM_SHARE: Record<Tier, number> = { short: 0.5, medium: 0.35, long: 0.3 };
const PROTEIN_KINDS = ['fish', 'beef', 'poultry', 'pork'];
const proteinKind = (f: FoodItem) => PROTEIN_KINDS.find((t) => f.tags.includes(t));

/** Rapid-carb treatments (glucose tabs/gel, candy) are reserved for medical needs, not meals. */
export const isMedicalOnly = (f: FoodItem) => f.tags.includes('rapid-carb') && f.category === 'fat-snack';

/** Servings cooked per batch; 4 when the food doesn't say. */
export const batchSize = (f: FoodItem) => Math.max(1, f.prep.batchServings ?? 4);
const round1 = (n: number) => Math.round(n * 10) / 10;
const fmtMonths = (m: number) => (m >= 24 ? `${round1(m / 12)} yr` : `${m} mo`);

/** Does this person's survey say they won't do what the food's preparation needs? */
function prepConflict(food: FoodItem, t?: PrepTolerance): string | undefined {
  if (!t) return undefined;
  const m = food.prep.method;
  if (m === 'ready-to-eat' && !t.cold && food.category !== 'beverage' && food.category !== 'fat-snack') return 'Prefers not to eat food cold';
  if (m === 'add-cold-water' && !t.addWater) return 'Prefers not to add water to food';
  if (m === 'add-hot-water' && food.form === 'freeze-dried' && !t.rehydrate) return 'Prefers not to eat rehydrated food';
  if ((m === 'simmer' || m === 'boil' || m === 'heat' || m === 'add-hot-water') && !t.boilSimmer && !t.campStove) return 'Prefers not to cook';
  return undefined;
}

function verdictFor(food: FoodItem, m: PlanMember): MemberVerdict & { value: number | undefined } {
  const safety = checkFood(food, m.restrictions);
  const rating = m.ratings[food.id];
  const refused = rating === 1 && !m.ignoredRefusals.includes(food.id);
  const notes: string[] = [];
  let status: MemberVerdict['status'] = 'ok';
  // Acceptance value 0..1, undefined = unknown (excluded from the average, not scored zero).
  let value: number | undefined = typeof rating === 'number' ? rating / 5 : undefined;
  if (refused) { status = 'refuse'; value = 0.05; notes.push('Would refuse'); }
  if (safety.disliked.length) { if (status === 'ok') status = 'dislike'; value = Math.min(value ?? 1, 0.1); notes.push(...safety.disliked); }
  if (safety.avoid.length) { if (status === 'ok') status = 'avoid'; value = Math.min(value ?? 1, 0.15); notes.push(...safety.avoid.map((s) => `${s} (avoid when possible)`)); }
  if (safety.minor.length) { if (status === 'ok') status = 'minor'; value = Math.max(0, (value ?? 0.7) - 0.15); notes.push(...safety.minor.map((s) => `${s} (minor)`)); }
  const pc = prepConflict(food, m.prep);
  if (pc) { if (status === 'ok') status = 'prep'; notes.push(pc); }
  if (safety.warnings.length) notes.push(...safety.warnings);
  // Only reachable through an admin override: this person can't eat it, so their opinion
  // doesn't count and it never counts as one of their meal options.
  if (safety.blocked.length || rating === 'blocked') { status = 'unsafe'; value = undefined; notes.unshift(...(safety.blocked.length ? safety.blocked : ['Said they can’t eat it'])); }
  return { memberId: m.id, rating, status, notes, value };
}

export function scoreFood(food: FoodItem, members: PlanMember[], tier: Tier, days: number) {
  const verdicts = members.map((m) => verdictFor(food, m));
  const known = verdicts.map((v) => v.value).filter((v): v is number => v !== undefined);
  // Acceptance: mostly the average, but the least-happy person pulls it down (scope: a group
  // favourite must not override one person's needs). Unknown answers are excluded, not zero.
  const mean = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 0.6;
  const min = known.length ? Math.min(...known) : 0.6;
  const acceptance = 0.7 * mean + 0.3 * min;

  const proteinScore = Math.min(1, (food.nutrition.proteinG ?? 0) / 12);
  const nutrition = 0.6 * ROLE_UTILITY[food.mealRole] + 0.4 * proteinScore;

  const prepIssues = verdicts.filter((v) => v.status === 'prep').length;
  const prep = Math.max(0, PREP_EASE[food.prep.method] - (members.length ? 0.4 * (prepIssues / members.length) : 0));

  const horizonMonths = days / 30;
  // Short/medium: does it comfortably outlast the plan? Long: how long does it keep without
  // rotation (conservative end of the range), measured against a multi-year reserve.
  const shelfFit = tier === 'long'
    ? Math.min(1, food.shelfLife.unopenedMonthsMin / Math.max(LONG_TERM_TARGET_MONTHS, horizonMonths))
    : Math.min(1, food.shelfLife.unopenedMonthsMax / Math.max(12, horizonMonths + 12));
  const storage = 0.75 * shelfFit + 0.25 * ((food.packagingDurability - 1) / 2);

  const costScore = food.relativeCost === 1 ? 1 : food.relativeCost === 2 ? 0.6 : 0.3;
  const kcalPerL = food.package.volumeL ? (food.nutrition.caloriesPerServing * food.package.servingsPerPackage) / food.package.volumeL : undefined;
  const space = kcalPerL === undefined ? 0.5 : Math.min(1, kcalPerL / 2500);
  const cost = 0.6 * costScore + 0.4 * space;

  // Short kits favour small packages you can open and finish; long reserves favour bulk.
  const spp = food.package.servingsPerPackage;
  const convenience = tier === 'short' ? (spp <= 4 ? 1 : spp <= 12 ? 0.6 : 0.2) : tier === 'long' ? (spp >= 8 ? 1 : 0.6) : 0.8;

  const factors = { acceptance, nutrition, prep, storage, cost, convenience };
  const w = TIER_WEIGHTS[tier];
  const score = Math.round((Object.keys(w) as (keyof Weights)[]).reduce((s, k) => s + w[k] * factors[k], 0));
  const rated = verdicts.filter((v) => typeof v.rating === 'number').length;
  const confidence: PlannedItem['confidence'] = !members.length || rated === 0 ? 'low' : rated / members.length >= 2 / 3 ? 'high' : 'medium';
  const counts = {
    eligible: members.length,
    liked: verdicts.filter((v) => v.status === 'ok' && typeof v.rating === 'number' && v.rating >= 4).length,
    neutral: verdicts.filter((v) => v.status === 'ok' && (v.rating === 3 || v.rating === 2)).length,
    disliked: verdicts.filter((v) => v.status === 'dislike' || v.status === 'refuse' || v.status === 'avoid').length,
    unknown: verdicts.filter((v) => v.rating === undefined || v.rating === 'unknown').length,
  };
  return { score, factors, verdicts, confidence, counts, mean: known.length ? mean : undefined };
}

export const TIER_ORDER: Tier[] = ['short', 'medium', 'long'];

/**
 * Plans are nested: the short-term supply is part of the medium-term one, and both are part
 * of the long-term one. Builds each smaller plan first and adds on top of it.
 */
export function buildNestedPlan(input: PlanInput, chain: { days: Record<Tier, number>; include?: Partial<Record<Tier, ID[]>> }): PlanResult {
  let base: PlanResult | undefined;
  for (const t of TIER_ORDER.slice(0, TIER_ORDER.indexOf(input.tier))) {
    // The smaller supplies keep their usual scenario, except that a no-cook plan is no-cook all the way down.
    const scenario: Scenario = input.scenario === 'no-cook' || t === 'short' ? 'no-cook' : 'limited-cook';
    base = buildPlan({ ...input, tier: t, scenario, days: chain.days[t], include: chain.include?.[t] ?? [], base });
  }
  return buildPlan({ ...input, base });
}

export function buildPlan(input: PlanInput): PlanResult {
  const { tier, scenario, days, defaults, members } = input;
  const warnings: string[] = [];
  const foods = input.foods.filter((f) => f.active).sort((a, b) => a.id.localeCompare(b.id));
  const nameOf = (id: ID) => members.find((m) => m.id === id)?.name ?? 'Someone';
  const subs = input.substitutions ?? {};
  // Replacement food → the foods it replaces.
  const replacing = new Map<ID, ID[]>();
  for (const [from, to] of Object.entries(subs)) if (to && to !== from) replacing.set(to, [...(replacing.get(to) ?? []), from]);
  const forced = new Set([...(input.include ?? []), ...replacing.keys()].filter((id) => !(id in subs)));
  const overrides: PlanOverride[] = [];
  const foodName = (id: ID) => input.foods.find((f) => f.id === id)?.name ?? 'a food';
  const staples = new Set<ID>();
  // Food from the smaller plan this one builds on is already counted, so it always stays.
  const carried = new Map((input.base?.items ?? []).map((i) => [i.foodId, i]));
  const carriedUnsafe = new Map<ID, ExcludedFood['reasons']>();
  const baseInfo = input.base ? { tier: input.base.tier, days: input.base.days } : undefined;

  if (!members.length) warnings.push('No active members, so there is nothing to plan yet.');
  const noSurvey = members.filter((m) => !m.surveyId);
  if (noSurvey.length) warnings.push(`No survey yet for ${noSurvey.map((m) => m.name).join(', ')}: their likes and dislikes aren’t reflected.`);

  // ---- 1. Hard safeguards ----
  const excluded: ExcludedFood[] = [];
  const eligible: FoodItem[] = [];
  for (const f of foods) {
    const reasons = members
      .map((m) => {
        const s = checkFood(f, m.restrictions);
        const r = [...s.blocked];
        if (m.ratings[f.id] === 'blocked') r.push('Said they can’t eat it');
        return { memberId: m.id, reasons: r };
      })
      .filter((x) => x.reasons.length);
    if (f.id in subs) { excluded.push({ foodId: f.id, name: f.name, reasons: [], scenarioOnly: ADMIN_REMOVED }); continue; }
    if (forced.has(f.id)) {
      const rep = replacing.get(f.id);
      overrides.push({ foodId: f.id, name: f.name, unsafeFor: reasons, replaces: rep?.map((id) => ({ foodId: id, name: foodName(id) })) });
      eligible.push(f); continue;
    }
    if (carried.has(f.id)) { if (reasons.length) carriedUnsafe.set(f.id, reasons); eligible.push(f); continue; }
    if (reasons.length) { excluded.push({ foodId: f.id, name: f.name, reasons }); continue; }
    if (scenario === 'no-cook' && !NO_HEAT.includes(f.prep.method)) { excluded.push({ foodId: f.id, name: f.name, reasons: [], scenarioOnly: NEEDS_COOKING }); continue; }
    eligible.push(f);
  }

  // ---- 2. Medical food needs (individual) ----
  const reserved: ReservedItem[] = [];
  for (const m of members) {
    for (const n of m.needs.filter((x) => x.active && x.domain === 'food')) {
      if (n.kind === 'rapid-carbs') {
        const perDay = Number(n.params?.servingsPerDay) || 3;
        const w: string[] = [];
        if (!n.confirmed) w.push('Amount is a placeholder; confirm it from their care plan.');
        // Safe for this person; prefer purpose-made treatments, then anything tagged rapid-carb.
        const options = foods.filter((f) => f.tags.includes('rapid-carb') && checkFood(f, m.restrictions).blocked.length === 0 && m.ratings[f.id] !== 'blocked')
          .sort((a, b) => rankRapid(a) - rankRapid(b));
        const pick = options[0];
        const servings = perDay * days;
        if (!pick) w.push('No safe fast-acting carb item in the catalog for this person. Add one in Catalog.');
        else if (scenario === 'no-cook' && !NO_HEAT.includes(pick.prep.method)) w.push('Chosen item needs preparation.');
        reserved.push({
          memberId: m.id, needId: n.id, kind: n.kind, label: 'Fast-acting carbs', foodId: pick?.id, foodName: pick?.name,
          servings, packages: pick ? Math.ceil(servings / pick.package.servingsPerPackage) : undefined, packageDesc: pick?.package.description, warnings: w,
        });
      } else if (n.kind === 'infant-formula' || n.kind === 'specialty-formula') {
        const product = String(n.details?.product ?? '').trim();
        const perDay = Number(n.params?.servingsPerDay) || undefined;
        reserved.push({
          memberId: m.id, needId: n.id, kind: n.kind, label: n.kind === 'infant-formula' ? 'Infant formula' : 'Specialty nutrition product',
          servings: perDay ? perDay * days : undefined,
          manual: `${product || 'Their specific product'}${perDay ? `: ${perDay * days} servings for ${days} days` : `: enough for ${days} days`}`,
          warnings: n.kind === 'infant-formula' ? ['Never substitute other foods or homemade formula. Also store safe water for mixing.'] : [],
        });
      } else if (n.kind === 'other-food') {
        reserved.push({ memberId: m.id, needId: n.id, kind: n.kind, label: 'Other food need', manual: String(n.details?.detail ?? 'See their profile'), warnings: [] });
      }
    }
  }

  // ---- 3. Score and choose a varied set ----
  const scored = eligible
    // Cooking oil and similar ingredients aren't meals; rapid-carb treatments are reserved above.
    .filter((f) => forced.has(f.id) || carried.has(f.id) || (!isMedicalOnly(f) && f.nutrition.caloriesPerServing > 0 && !(f.category === 'fat-snack' && f.mealRole === 'staple')))
    .map((f) => ({ f, ...scoreFood(f, members, tier, days) }));

  const dailyCaloriesTotal = members.reduce((s, m) => s + (m.dailyCalories ?? defaults.defaultDailyCalories), 0);
  const targetCalories = dailyCaloriesTotal * days;
  const items: PlannedItem[] = [];
  const people = members.length;
  // Long-term plans with cooking keep canned food to a small share of calories (household
  // setting) so the bulk is freeze-dried and dry food. Without cooking, freeze-dried meals
  // (which mostly need hot water) can't fill in, so canned isn't limited there.
  const cannedPct = tier === 'long' && scenario === 'limited-cook' ? (defaults.longTermCannedMaxPercent ?? LONG_TERM_CANNED_MAX_PERCENT) : 100;
  const cannedBudget = { left: cannedPct >= 100 ? Infinity : (targetCalories * cannedPct) / 100 };
  // Canned food carried over from the smaller plans uses up the canned budget first.
  for (const i of carried.values()) if (foods.find((f) => f.id === i.foodId)?.form === 'canned') cannedBudget.left -= i.calories;
  // Fill side groups first; whatever any group can't place goes to grains & staples (last).
  const ORDER: Bucket[] = ['produce', 'snacks', 'drinks', 'mains', 'starches'];
  let carry = 0;
  for (const b of ORDER) {
    const pool = scored.filter((x) => BUCKET_OF[x.f.category] === b)
      .sort((a, z) => z.score - a.score || a.f.name.localeCompare(z.f.name));
    const chosen: typeof pool = [];
    const forms = new Map<string, number>();
    const kinds = new Set<string>();
    const fits = (x: (typeof pool)[number], strict: boolean) => {
      if (chosen.includes(x)) return false;
      if (!strict) return true;
      // Variety: at most two foods of the same category+form, one per protein type (not tuna AND sardines).
      if ((forms.get(`${x.f.category}:${x.f.form}`) ?? 0) >= 2) return false;
      const k = proteinKind(x.f);
      if (k && kinds.has(k)) return false;
      // Long-term canned cap: one canned food per group, and none once the budget is used up.
      if (x.f.form === 'canned' && cannedBudget.left !== Infinity && (cannedBudget.left < 1 || chosen.some((c) => c.f.form === 'canned'))) return false;
      // Anything the group mostly doesn't want is only a last resort.
      return !(x.factors.acceptance < 0.3 && chosen.length > 0);
    };
    const takeNext = () => {
      const x = pool.find((y) => fits(y, true)) ?? pool.find((y) => fits(y, false) && y.factors.acceptance >= 0.3) ?? (chosen.length ? undefined : pool[0]);
      if (!x) return false;
      forms.set(`${x.f.category}:${x.f.form}`, (forms.get(`${x.f.category}:${x.f.form}`) ?? 0) + 1);
      const k = proteinKind(x.f);
      if (k) kinds.add(k);
      chosen.push(x);
      return true;
    };
    // Core staples next (rice, beans, potatoes) when cooking is possible and the family is OK with them.
    if (scenario === 'limited-cook') {
      for (const g of STAPLES[tier]) {
        const x = g.options.map((id) => pool.find((y) => y.f.id === id)).find((y) => y && y.factors.acceptance >= 0.3);
        if (!x || chosen.includes(x)) continue;
        chosen.push(x);
        staples.add(x.f.id);
        forms.set(`${x.f.category}:${x.f.form}`, (forms.get(`${x.f.category}:${x.f.form}`) ?? 0) + 1);
      }
    }
    // Admin additions go in first, whatever their score.
    for (const x of pool.filter((y) => forced.has(y.f.id) && !chosen.includes(y))) {
      chosen.push(x);
      forms.set(`${x.f.category}:${x.f.form}`, (forms.get(`${x.f.category}:${x.f.form}`) ?? 0) + 1);
      const k = proteinKind(x.f);
      if (k) kinds.add(k);
    }
    while (chosen.length < PICKS[tier][b] && takeNext());
    // Food from the smaller plan is part of this one at its amount. It only grows if this
    // plan picks it again; the rest of the calories go to this plan's own picks.
    const carriedHere = pool.filter((y) => carried.has(y.f.id));

    // Calories other groups couldn't place go to grains & staples, the natural calorie base.
    let share = targetCalories * BUCKET_SHARE[b] + (b === 'starches' ? carry : 0);
    if (b === 'starches') carry = 0;
    if (!chosen.length && !carriedHere.length) { carry += share; if (members.length) warnings.push(`Nothing suitable for “${BUCKET_LABEL[b]}” in this plan; those calories were moved to other groups.`); continue; }

    // Spread the bucket's calories by score, with caps so the plan stays realistic:
    //  - no food above a set number of servings per person per day, or above a share of its group;
    //  - fruit/veg, snacks and drinks are limited by servings (they're there for variety and
    //    nutrients, not to fill calories), and what they can't place moves to mains/staples.
    const bucketCalories = Math.max(0, share);
    const servingCap = (x: (typeof pool)[number]) => Math.max(1, people * days * SERVING_CAP[x.f.category]);
    const bucketServingsLeft = { n: Number.isFinite(BUCKET_SERVINGS[b]) ? Math.max(1, people * days * BUCKET_SERVINGS[b]) : Infinity };
    let relaxed = false;
    const alloc = new Map<(typeof pool)[number], number>();
    const capFor = (x: (typeof pool)[number]) => {
      const cap = relaxed ? servingCap(x) : Math.min(servingCap(x), Math.max(1, (MAX_ITEM_SHARE[tier] * bucketCalories) / x.f.nutrition.caloriesPerServing));
      return x.f.form === 'canned' && !forced.has(x.f.id) ? Math.min(cap, (alloc.get(x) ?? 0) + cannedBudget.left / x.f.nutrition.caloriesPerServing) : cap;
    };
    // Start from what the smaller plan already has; only the rest of the group's calories is added.
    for (const x of carriedHere) {
      const bi = carried.get(x.f.id)!;
      alloc.set(x, bi.servings);
      share -= bi.servings * x.f.nutrition.caloriesPerServing;
      bucketServingsLeft.n -= bi.servings;
    }
    for (let guard = 0; guard < 80 && share > 1 && bucketServingsLeft.n > 0.01; guard++) {
      let open = chosen.filter((x) => (alloc.get(x) ?? 0) < capFor(x) - 1e-9);
      if (!open.length) {
        if (takeNext()) open = [chosen[chosen.length - 1]];
        else if (!relaxed) { relaxed = true; continue; }
        else break;
      }
      const sum = open.reduce((t, x) => t + (x.score || 1), 0);
      let placed = 0;
      for (const x of open) {
        const have = alloc.get(x) ?? 0;
        const add = Math.max(0, Math.min(capFor(x) - have, bucketServingsLeft.n, (share * (x.score || 1)) / sum / x.f.nutrition.caloriesPerServing));
        alloc.set(x, have + add);
        if (x.f.form === 'canned' && !forced.has(x.f.id)) cannedBudget.left -= add * x.f.nutrition.caloriesPerServing;
        bucketServingsLeft.n -= add;
        placed += add * x.f.nutrition.caloriesPerServing;
      }
      share -= placed;
      if (placed < 1) break;
    }
    // Unplaced calories move on to staples; more than enough already (from the smaller plan) means fewer staples.
    if (Math.abs(share) > 1) carry += share;

    for (const x of [...chosen, ...carriedHere.filter((y) => !chosen.includes(y))]) {
      const f = x.f;
      const raw = alloc.get(x) ?? 0;
      if (raw <= 0 && !forced.has(f.id)) continue;
      // Admin additions get at least one package, even when calories are already covered.
      const bi = carried.get(f.id);
      const servings = Math.max(forced.has(f.id) && raw <= 0 ? f.package.servingsPerPackage : 1, bi?.servings ?? 0, Math.ceil(raw - 1e-9));
      const packages = Math.max(bi?.packages ?? 0, Math.ceil(servings / f.package.servingsPerPackage));
      const why: string[] = [];
      const rated = x.verdicts.filter((v) => typeof v.rating === 'number' && v.status === 'ok');
      if (x.counts.liked) why.push(`Liked by ${x.counts.liked} of ${members.length}`);
      else if (!rated.length) why.push('No ratings yet');
      if (x.mean !== undefined) why.push(`avg ${round1(x.mean * 5)}/5`);
      if (f.prep.method === 'ready-to-eat') why.push('no cooking'); else if (f.prep.method === 'add-cold-water') why.push('just add water');
      if ((f.nutrition.proteinG ?? 0) >= 10) why.push('good protein');
      why.push(`keeps ${fmtMonths(f.shelfLife.unopenedMonthsMin)}–${fmtMonths(f.shelfLife.unopenedMonthsMax)}`);
      const flags: string[] = [];
      for (const v of x.verdicts) {
        if (v.status === 'avoid') flags.push(`${nameOf(v.memberId)}: ${v.notes.find((n) => n.includes('avoid')) ?? 'avoid when possible'}`);
        if (v.status === 'dislike' || v.status === 'refuse') flags.push(`${nameOf(v.memberId)} doesn’t like this`);
        if (v.status === 'prep') flags.push(`${nameOf(v.memberId)}: ${v.notes[v.notes.length - 1]}`);
        for (const n of v.notes.filter((n) => n.startsWith('May contain'))) flags.push(`${nameOf(v.memberId)}: ${n}`);
      }
      if (staples.has(f.id) && !forced.has(f.id)) why.unshift('Preparedness staple');
      if (bi && baseInfo) {
        why.unshift(`Includes the ${baseInfo.days}-day supply’s ${bi.packages}`);
        if (!forced.has(f.id)) for (const r of carriedUnsafe.get(f.id) ?? []) flags.push(`Not safe for ${nameOf(r.memberId)} (${r.reasons.join(', ')}). Added by admin override in the ${baseInfo.days}-day plan: store it apart and labeled.`);
      }
      if (forced.has(f.id)) {
        const rep = replacing.get(f.id);
        why.unshift(rep && !(input.include ?? []).includes(f.id) ? `Admin swap for ${rep.map(foodName).join(', ')}` : 'Added by admin');
        const o = overrides.find((y) => y.foodId === f.id);
        for (const r of o?.unsafeFor ?? []) flags.push(`Not safe for ${nameOf(r.memberId)} (${r.reasons.join(', ')}). Added by admin override: store it apart and labeled.`);
        if (scenario === 'no-cook' && !NO_HEAT.includes(f.prep.method)) flags.push('Needs heat or cooking, but this is a no-cook plan');
      }
      if (f.shelfLife.unopenedMonthsMax * 30 < days) flags.push(`Keeps up to ${fmtMonths(f.shelfLife.unopenedMonthsMax)}, shorter than this plan: rotate it`);
      items.push({
        foodId: f.id, name: f.name, category: f.category, bucket: b, score: x.score, factors: x.factors,
        servings, packages, leftoverServings: round1(packages * f.package.servingsPerPackage - servings),
        calories: Math.round(servings * f.nutrition.caloriesPerServing),
        packageDesc: f.package.description, servingsPerPackage: f.package.servingsPerPackage,
        prepWaterGallons: round1((servings * f.prep.waterCupsPerServing) / 16),
        needsFuel: f.prep.needsFuel, carbsG: f.nutrition.carbsG, why, flags, allergens: { contains: f.allergens.contains, mayContain: f.allergens.mayContain ?? [] }, safetyNotes: f.safetyNotes, fromBase: bi && baseInfo ? { ...baseInfo, packages: bi.packages } : undefined, confidence: x.confidence, counts: x.counts,
        verdicts: x.verdicts.map(({ value: _v, ...v }) => v),
        volumeL: f.package.volumeL !== undefined ? round1(packages * f.package.volumeL) : undefined,
        cost: f.priceEstimate !== undefined ? Math.round(packages * f.priceEstimate * 100) / 100 : undefined,
        shelfLife: `${fmtMonths(f.shelfLife.unopenedMonthsMin)}–${fmtMonths(f.shelfLife.unopenedMonthsMax)}`,
      });
    }
  }
  const plannedCalories = items.reduce((s, i) => s + i.calories, 0);

  // ---- Per-person coverage ----
  const coverage: MemberCoverage[] = members.map((m) => {
    const mains = items.filter((i) => i.bucket === 'mains');
    const ok = mains.filter((i) => { const v = i.verdicts.find((x) => x.memberId === m.id); return v && (v.status === 'ok' || v.status === 'minor' || v.status === 'prep') && (v.rating === undefined || v.rating === 'unknown' || (typeof v.rating === 'number' && v.rating >= 3)); });
    const notes: string[] = [];
    let suggestion: string | undefined;
    if (ok.length < defaults.minDailyMealOptions) {
      notes.push(`Only ${ok.length} main dish${ok.length === 1 ? '' : 'es'} they’re happy with (target ${defaults.minDailyMealOptions}).`);
      const alt = scored.filter((x) => BUCKET_OF[x.f.category] === 'mains' && !mains.some((i) => i.foodId === x.f.id))
        .map((x) => ({ x, v: x.verdicts.find((v) => v.memberId === m.id)! }))
        .filter(({ v }) => v.status === 'ok' && typeof v.rating === 'number' && v.rating >= 4)
        .sort((a, z) => z.x.score - a.x.score)[0];
      if (alt) suggestion = `Consider adding ${alt.x.f.name} (they rated it ${alt.v.rating}/5).`;
    }
    if (m.needs.some((n) => n.active && n.kind === 'carb-counting')) {
      const missing = items.filter((i) => i.carbsG === undefined);
      notes.push(missing.length ? `Carb counting: ${missing.length} planned food${missing.length === 1 ? ' has' : 's have'} no carb value; check labels.` : 'Carb counting: every planned food has a carb value (estimates; check labels).');
    }
    if (m.needs.some((n) => n.active && n.kind === 'texture-modified')) {
      const soft = items.filter((i) => foods.find((f) => f.id === i.foodId)?.tags.includes('soft-texture')).length;
      notes.push(`Texture needs: ${soft} planned food${soft === 1 ? ' is' : 's are'} tagged soft. Check each item suits them.`);
    }
    return { memberId: m.id, name: m.name, dailyCalories: m.dailyCalories ?? defaults.defaultDailyCalories, mealOptions: ok.length, mealOptionNames: ok.map((i) => i.name), hasSurvey: !!m.surveyId, suggestion, notes };
  });
  for (const c of coverage) if (c.mealOptions < defaults.minDailyMealOptions && members.length) warnings.push(`${c.name} has fewer main-dish options than your target of ${defaults.minDailyMealOptions}.`);

  // ---- Water, fuel, equipment, storage, cost ----
  // Stored water (drinking + food prep) covers the first days, up to the reserve setting. Storing
  // much more isn't practical for most homes, so after that the plan is to make water safe.
  const drinkingDays = Math.min(days, defaults.waterReserveDays);
  const drinkPerDay = people * defaults.waterGallonsPerPersonPerDay;
  const prepPerDay = days ? (items.reduce((s, i) => s + i.prepWaterGallons, 0) + reservedPrepWater(reserved, foods)) / days : 0;
  const drinkingGallons = round1(drinkPerDay * drinkingDays);
  const prepGallons = round1(prepPerDay * drinkingDays);
  const fullHorizonGallons = round1(drinkPerDay * days);
  let treatment: WaterTreatment | undefined;
  if (days > drinkingDays && people) {
    const tDays = days - drinkingDays;
    const gallons = round1((drinkPerDay + prepPerDay) * tDays);
    // CDC: 8 drops (~0.4 mL) of 6% bleach per gallon; doubled for cloudy water.
    treatment = { fromDay: drinkingDays + 1, days: tDays, gallonsPerDay: round1(drinkPerDay + prepPerDay), gallons, bleachOz: Math.max(1, Math.ceil((gallons * 0.8) / 29.57)) };
    warnings.push(`Stored water covers the first ${drinkingDays} days. From day ${drinkingDays + 1}, you will need to make about ${treatment.gallonsPerDay} gallons a day safe (${gallons} gallons in all): have a water source, a filter and unscented bleach ready (listed under Equipment).`);
  }

  const fuelItems = items.filter((i) => i.needsFuel).map((i) => {
    const f = foods.find((x) => x.id === i.foodId)!;
    const minutes = Math.ceil(i.servings / batchSize(f)) * Math.max(5, f.prep.cookMinutes);
    return { name: i.name, minutes };
  });
  const burnerMinutes = fuelItems.reduce((s, x) => s + x.minutes, 0);

  // Equipment: what the chosen foods (including reserved items) need, and which foods need it.
  const needBy = new Map<string, string[]>();
  const usedFoods = [...items.map((i) => i.foodId), ...reserved.map((r) => r.foodId).filter((x): x is string => !!x)];
  for (const id of [...new Set(usedFoods)]) {
    const f = foods.find((x) => x.id === id);
    if (!f) continue;
    for (const e of equipmentFor(f)) needBy.set(e, [...(needBy.get(e) ?? []), f.name]);
  }
  const equipment: EquipmentNeed[] = [
    ...[...needBy].map(([item, forFoods]) => ({ item, foods: forFoods })).sort((a, z) => z.foods.length - a.foods.length || a.item.localeCompare(z.item)),
    ...BASIC_EQUIPMENT.map((item) => ({ item, foods: [] })),
    ...(treatment ? WATER_TREATMENT_EQUIPMENT.map((item) => ({ item, foods: [`Water from day ${treatment!.fromDay}`] })) : []),
  ];

  const knownLiters = round1(items.reduce((s, i) => s + (i.volumeL ?? 0), 0));
  const unknownItems = items.filter((i) => i.volumeL === undefined).length;
  if (defaults.storageSpaceLiters && knownLiters > defaults.storageSpaceLiters) warnings.push(`Planned food takes about ${knownLiters} L, more than your ${defaults.storageSpaceLiters} L of storage space.`);

  const priced = items.filter((i) => i.cost !== undefined);
  const total = Math.round(priced.reduce((s, i) => s + (i.cost ?? 0), 0) * 100) / 100;
  if (defaults.budget && priced.length && total > defaults.budget) warnings.push(`Priced items alone come to ${total.toFixed(2)}, over your budget of ${defaults.budget.toFixed(2)}.`);

  if (members.length && plannedCalories < targetCalories * 0.95) warnings.push('The plan falls short of everyone’s calorie target. Add more foods to the catalog or relax a preference.');
  if (items.some((i) => i.flags.some((f) => f.includes('avoid when possible')))) warnings.push('Some planned foods conflict with an “avoid when possible” intolerance (flagged below).');
  if (overrides.some((o) => o.unsafeFor.length)) warnings.push('This plan includes foods an admin added even though they aren’t safe for someone (flagged below). Store them apart and labeled.');
  if (items.length) warnings.push('Catalog entries are generic. Check every product label for allergens before buying.');

  return {
    engineVersion: ENGINE_VERSION, tier, scenario, days, people, dailyCaloriesTotal, targetCalories, plannedCalories,
    items, reserved, excluded, coverage, overrides,
    base: input.base && baseInfo ? { ...baseInfo, calories: input.base.plannedCalories } : undefined,
    water: { drinkingGallons, drinkingDays, prepGallons, totalGallons: round1(drinkingGallons + prepGallons), fullHorizonGallons, treatment },
    fuel: { burnerMinutes, items: fuelItems },
    equipment,
    storage: { knownLiters, unknownItems, limitLiters: defaults.storageSpaceLiters },
    cost: { total, pricedItems: priced.length, unpricedItems: items.length - priced.length, budget: defaults.budget },
    warnings,
  };
}

function rankRapid(f: FoodItem) {
  if (f.id === 'glucose-tabs') return 0;
  if (f.id === 'glucose-gel') return 1;
  if (f.category === 'beverage') return 2;
  return 3;
}

function reservedPrepWater(reserved: ReservedItem[], foods: FoodItem[]) {
  return reserved.reduce((s, r) => {
    const f = r.foodId ? foods.find((x) => x.id === r.foodId) : undefined;
    return s + (f && r.servings ? (r.servings * f.prep.waterCupsPerServing) / 16 : 0);
  }, 0);
}

// ---------------- Plan comparison ----------------
export interface PlanDiffRow {
  foodId: ID;
  name: string;
  kind: 'add' | 'remove' | 'more' | 'fewer';
  before: number;
  after: number;
  packageDesc: string;
}

/** What to change to go from a saved plan to the current one (package counts). */
export function diffPlans(prev: PlanResult, next: PlanResult): PlanDiffRow[] {
  const rows: PlanDiffRow[] = [];
  const all = (r: PlanResult) => {
    const m = new Map<string, { name: string; packages: number; packageDesc: string }>();
    for (const i of r.items) m.set(i.foodId, { name: i.name, packages: i.packages, packageDesc: i.packageDesc });
    for (const x of r.reserved) if (x.foodId && x.packages) {
      const cur = m.get(x.foodId);
      m.set(x.foodId, { name: x.foodName ?? x.foodId, packages: (cur?.packages ?? 0) + x.packages, packageDesc: x.packageDesc ?? '' });
    }
    return m;
  };
  const a = all(prev);
  const b = all(next);
  for (const [id, x] of b) {
    const old = a.get(id);
    if (!old) rows.push({ foodId: id, name: x.name, kind: 'add', before: 0, after: x.packages, packageDesc: x.packageDesc });
    else if (x.packages > old.packages) rows.push({ foodId: id, name: x.name, kind: 'more', before: old.packages, after: x.packages, packageDesc: x.packageDesc });
    else if (x.packages < old.packages) rows.push({ foodId: id, name: x.name, kind: 'fewer', before: old.packages, after: x.packages, packageDesc: x.packageDesc });
  }
  for (const [id, x] of a) if (!b.has(id)) rows.push({ foodId: id, name: x.name, kind: 'remove', before: x.packages, after: 0, packageDesc: x.packageDesc });
  const order = { add: 0, more: 1, fewer: 2, remove: 3 };
  return rows.sort((x, y) => order[x.kind] - order[y.kind] || x.name.localeCompare(y.name));
}
