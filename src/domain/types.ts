import type { SizeUnit } from './packageSize';
import type { NeedDomain } from './needs';

// Domain model — mirrors scope §9. All keys are immutable IDs, never names.

export type ID = string;
export type ISODate = string;

export const SCHEMA_VERSION = 1;

// ---------- Household ----------
export interface PlanningDefaults {
  shortDays: number; // default 3
  mediumDays: number; // default 14 (14–30)
  longDays: number; // default 90 (90–365)
  waterGallonsPerPersonPerDay: number; // CDC minimum 1 [R1]
  minDailyMealOptions: number; // per-person coverage threshold
  defaultDailyCalories: number; // used when a member has no admin-approved goal
  /** Group meals per day the plan provides. */
  mealsPerDay: number;
  /** Drinking-water reserve: 3 days (CDC minimum) or 14 days. */
  waterReserveDays: number;
  /** Optional storage space available, in liters (for space estimates/warnings). */
  storageSpaceLiters?: number;
  /** Optional budget; only used when prices have been entered for foods. */
  budget?: number;
  /** Upper limit on canned food in a long-term plan with cooking, as % of calories (default 20). */
  longTermCannedMaxPercent?: number;
}

export interface Household {
  id: ID;
  name: string;
  createdAt: ISODate;
  planningDefaults: PlanningDefaults;
  settings: {
    autoLockMinutes: number;
    lastBackupAt?: ISODate;
    backupReminderDays: number;
    /** Warn this many days before stock reaches its best-by date (default 30). */
    expiryWarningDays?: number;
  };
  /** Foods the admin has added to a plan by hand (per horizon), even if the planner left them out. */
  planOverrides?: Partial<Record<Tier, ID[]>>;
  /** Admin swaps for every plan: food → replacement food, or '' to just leave it out. */
  planSubstitutions?: Record<ID, ID | ''>;
  /** Admin-set amounts per plan: food → number of packages. */
  planQuantities?: Partial<Record<Tier, Record<ID, number>>>;
  /** Plans the admin picks by hand (missing = just the 3-day plan). */
  handPickTiers?: Tier[];
  /** Family requests (survey "Foods we should add" / "Comfort meals") the admin has dealt with. */
  requestsDone?: string[];
}

// ---------- Members ----------
export type MemberStatus = 'active' | 'inactive' | 'archived';
export type AgeBand = 'infant' | 'toddler' | 'child' | 'teen' | 'adult' | 'older-adult';
export type Presence = 'usually-present' | 'occasional-guest' | 'temporary-guest';

/** @deprecated v1 shape, migrated to MemberNeed records by the DB v2 upgrade. */
export interface LegacyHealthNeeds {
  rapidCarbs?: { enabled: boolean; servingsPerDay: number; confirmed: boolean };
  carbCounting?: boolean;
  infantFormula?: boolean;
  textureModified?: boolean;
  specialtyFormula?: boolean;
}

/**
 * A planning need for one member (scope §4 "Health/feeding"), extensible by domain —
 * see domain/needs.ts. Planning information only, never treatment advice.
 */
export interface MemberNeed {
  id: ID;
  memberId: ID;
  domain: NeedDomain;
  kind: string;
  /** Numeric parameters the planner uses (e.g. servingsPerDay). */
  params: Record<string, number>;
  /** False while any numeric param is still a placeholder the admin hasn't confirmed. */
  confirmed: boolean;
  /** Free-text details/params (product names, notes) — encrypted JSON object. */
  detailsEnc?: EncryptedBlob;
  active: boolean;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/** A health condition label (e.g. "Type 1 diabetes"). Label is encrypted; admin-only. */
export interface MemberCondition {
  id: ID;
  memberId: ID;
  labelEnc: EncryptedBlob;
  active: boolean;
  createdAt: ISODate;
}

export interface PlanningProfile {
  /** @deprecated migrated to MemberNeed */
  healthNeeds?: LegacyHealthNeeds;
  ageBand?: AgeBand;
  dailyCalorieGoal?: number; // admin-approved
  portionFactor?: number; // 1.0 = typical adult
  presence: Presence;
  guestFrom?: ISODate;
  guestUntil?: ISODate;
  canPrepareFood?: boolean;
  spiceTolerance?: 0 | 1 | 2 | 3;
  favoriteFlavors?: string[];
  dislikedGroups?: string[];
  accessibilityNotes?: string;
}

export interface Member {
  id: ID;
  householdId: ID;
  displayName: string;
  preferredName?: string;
  color?: string;
  status: MemberStatus;
  createdAt: ISODate;
  joinedAt?: ISODate;
  leftAt?: ISODate;
  planningProfile: PlanningProfile;
  /** Encrypted with the admin key (see crypto.ts). Never shown in non-detailed exports. */
  privateNotesEnc?: EncryptedBlob;
  /** @deprecated migrated to MemberCondition */
  conditionLabelEnc?: EncryptedBlob;
  updatedAt: ISODate;
}

export type RestrictionType =
  | 'allergy'
  | 'intolerance'
  | 'special-diet'
  | 'religious-ethical'
  | 'cannot-eat'
  | 'texture'
  | 'medical-feeding'
  /** A preference, not a safety rule: counts against the food for group meals; no severity or cross-contact. */
  | 'dislike';

export type Strictness = 'strict' | 'avoid' | 'minor';

export interface MemberRestriction {
  id: ID;
  memberId: ID;
  type: RestrictionType;
  /** Allergen code (e.g. 'peanut') or food tag/item id the restriction targets. Plain so the engine can filter without unlocking. */
  subject: string;
  severity?: 'mild' | 'moderate' | 'severe';
  /**
   * Intolerances only: how strictly to apply it. Missing = 'strict' (treated like an allergy).
   * 'avoid' and 'minor' don't keep a food out; they count against it for group meals.
   */
  strictness?: Strictness;
  /** Admin-confirmed restrictions cannot be removed by a respondent. */
  verifiedAt?: ISODate;
  /** Sensitive free text — encrypted. */
  adminNoteEnc?: EncryptedBlob;
  cautionCrossContact?: boolean;
  active: boolean;
  createdAt: ISODate;
}

export type CustomFieldType = 'text' | 'number' | 'single-select' | 'multi-select' | 'checkbox';

export interface CustomFieldDefinition {
  id: ID;
  label: string;
  dataType: CustomFieldType;
  options?: string[];
  sensitivity: 'private' | 'reportable';
  enabled: boolean;
}

export type CustomValue = string | number | boolean | string[];

export interface CustomFieldValue {
  id: ID; // `${memberId}:${fieldDefinitionId}`
  memberId: ID;
  fieldDefinitionId: ID;
  /** Plain value for 'reportable' fields. */
  value?: CustomValue;
  /** Encrypted JSON value for 'private' fields (the default). */
  valueEnc?: EncryptedBlob;
}

// ---------- Food catalog ----------
export type FoodCategory =
  | 'protein'
  | 'legume'
  | 'grain'
  | 'fruit'
  | 'vegetable'
  | 'dairy-alt'
  | 'meal'
  | 'fat-snack'
  | 'beverage'
  /** Baking supplies and seasonings: sized by use per person per day, not by calories. */
  | 'pantry'
  /** Condiments & sauces: sized by use per person per day like pantry items, but surveyed. */
  | 'condiment';

export type FoodForm = 'canned' | 'pouch' | 'dry' | 'freeze-dried' | 'dehydrated' | 'jar' | 'box' | 'bottle' | 'packet' | 'bulk';

export type PrepMethod = 'ready-to-eat' | 'add-cold-water' | 'add-hot-water' | 'heat' | 'simmer' | 'boil';

export type Allergen =
  | 'peanut'
  | 'tree-nut'
  | 'milk'
  | 'egg'
  | 'wheat'
  | 'gluten'
  | 'soy'
  | 'fish'
  | 'shellfish'
  | 'sesame'
  | 'corn'
  | 'mustard';

/** A kind (variety) of a generic food, e.g. "Peaches" for canned fruit. Allergens/tags add to the food's own. */
export interface FoodKind {
  id: string;
  name: string;
  /** An emoji shown on the survey tile. */
  icon?: string;
  contains?: Allergen[];
  mayContain?: Allergen[];
  /** Replaces the food's tags for this kind (e.g. "beef" or "vegan"). */
  tags?: string[];
}

export interface FoodItem {
  id: ID;
  name: string;
  category: FoodCategory;
  form: FoodForm;
  examples?: string;
  tags: string[]; // e.g. 'vegetarian','vegan','kid-friendly','high-protein','pork','beef','halal-verify'
  allergens: {
    contains: Allergen[];
    /** true = generic entry; actual product label must be checked (scope §6 catalog quality rule). */
    verifyLabel: boolean;
    mayContain?: Allergen[];
  };
  prep: {
    method: PrepMethod;
    edibleWithoutHeat: boolean;
    /** Minutes of stove time per batch. */
    cookMinutes: number;
    /** Servings cooked in one batch (default 4); used for the fuel estimate. */
    batchServings?: number;
    waterCupsPerServing: number; // potable prep water
    needsFuel: boolean;
  };
  shelfLife: {
    unopenedMonthsMin: number;
    unopenedMonthsMax: number;
    storage: string;
    source: string; // e.g. 'USDA FSIS [R4]'
    sourceDate?: ISODate;
    assumptions?: string;
  };
  nutrition: {
    servingDesc: string;
    caloriesPerServing: number;
    proteinG?: number;
    /** Approximate total carbs per serving; generic estimate — verify the actual label. */
    carbsG?: number;
    fatG?: number;
    satFatG?: number;
    fiberG?: number;
    sugarG?: number;
    sodiumMg?: number;
    /** Where the values came from (e.g. typical values, or "From the label"). */
    source?: string;
  };
  package: {
    description: string;
    servingsPerPackage: number;
    /** Approx package volume in liters for storage-space estimate. */
    volumeL?: number;
  };
  /** User-entered only; never invented. */
  priceEstimate?: number;
  relativeCost: 1 | 2 | 3; // low/med/high
  rotationPriority: 1 | 2 | 3; // 3 = rotate soonest
  packagingDurability: 1 | 2 | 3;
  safetyNotes?: string;
  /**
   * Extra equipment needed to prepare or store this food (e.g. "Grain mill"), on top of what
   * its preparation method implies (see domain/equipment.ts).
   */
  equipment?: string[];
  /** Kinds the survey asks about and the shopping list breaks down (generic foods like canned fruit). */
  kinds?: FoodKind[];
  /** Pantry items (baking & seasonings): catalog servings used per person per day, and the smallest plan that includes it. */
  pantry?: { perPersonDay: number; fromTier: Tier };
  /** Can act as a main meal component (vs. snack/side). */
  mealRole: 'main' | 'side' | 'snack' | 'drink' | 'staple';
  active: boolean;
  needsReview: boolean;
  revision: number;
  updatedAt: ISODate;
}

// ---------- Surveys ----------
/** 5..1 preference; 'unknown' = not tried; 'blocked' = cannot eat (safety, not preference). */
export type RatingCode = 5 | 4 | 3 | 2 | 1 | 'unknown' | 'blocked';

/** 'reset': the admin cleared it; its answers no longer count. */
export type SurveyStatus = 'in-progress' | 'submitted' | 'superseded' | 'reset';

export interface PrepTolerance {
  cold: boolean;
  addWater: boolean;
  boilSimmer: boolean;
  rehydrate: boolean;
  campStove: boolean;
  spicy: 0 | 1 | 2 | 3;
  sweet: 0 | 1 | 2 | 3;
  salty: 0 | 1 | 2 | 3;
}

export interface Survey {
  id: ID;
  memberId: ID;
  catalogVersion: number;
  status: SurveyStatus;
  version: number;
  supersedesSurveyId?: ID;
  startedAt: ISODate;
  completedAt?: ISODate;
  /** Resume pointer. */
  currentStep: number;
  prepTolerance?: PrepTolerance;
  openResponses?: {
    foodsToAdd?: string;
    neverStock?: string;
    comfortMeals?: string;
  };
  /** @deprecated replaced by suggestions */
  restrictionFlags?: { restrictionId?: ID; text: string }[];
  /** Profile changes the respondent suggests; become pending review items on submit. */
  suggestions?: Suggestion[];
  needsRefresh?: boolean;
  /** Why a retake is suggested (shown to the admin); default: restrictions or membership changed. */
  refreshReason?: string;
  /** Only these foods are asked (new since the last survey); other answers were copied from it. */
  onlyNew?: ID[];
  /** Every food the survey had asked this person about by the time it was submitted. */
  asked?: ID[];
  /** Admin override: "Would refuse" answers (food ids) to stop applying until the next survey. */
  ignoredRefusals?: ID[];
  updatedAt: ISODate;
}

export type Suggestion =
  | { id: ID; kind: 'remove-restriction'; restrictionId: ID; reason?: string }
  | { id: ID; kind: 'add-restriction'; restrictionType: RestrictionType; text: string }
  | { id: ID; kind: 'preferred-name'; value: string };

export interface SurveyAnswer {
  id: ID; // `${surveyId}:${foodItemId}`
  surveyId: ID;
  foodItemId: ID;
  rating: RatingCode;
  onlyPreparedCertainWay?: boolean;
  prepNotes?: string;
  /** Kinds of this food the person likes (ids from FoodItem.kinds). */
  kinds?: string[];
  comment?: string;
  /** "Can't eat it" follow-up: why, and for allergies/sensitivities how careful to be. */
  blockedInfo?: BlockedInfo;
}

export interface BlockedInfo {
  type?: RestrictionType;
  /** What they react to: allergen codes (e.g. 'peanut') and/or `food:<name>`. Empty = the food itself. */
  subjects?: string[];
  severity?: 'mild' | 'moderate' | 'severe';
  strictness?: Strictness;
  /** Cross-contact ("may contain") worry: 'concern', 'fine' or 'unsure' (treated as a concern). */
  crossContact?: 'concern' | 'fine' | 'unsure';
}

// ---------- Planning ----------
export type Scenario = 'no-cook' | 'limited-cook';
export type Tier = 'short' | 'medium' | 'long';

export interface PlanningScenario {
  id: ID;
  activeMemberIds: ID[];
  horizonDays: number;
  tier: Tier;
  scenario: Scenario;
  waterReserveDays: number;
  includeGuestsOn?: ISODate;
  createdAt: ISODate;
}

export interface PlanSnapshot {
  id: ID;
  scenarioId: ID;
  engineVersion: string;
  catalogVersion: number;
  sourceSurveyIds: ID[];
  results: unknown; // PlanResult (engine) serialized
  warnings: string[];
  createdAt: ISODate;
}

// ---------- Inventory ----------
/**
 * Something the household has on hand. Several entries per food are normal (different
 * purchases with different best-by dates); on-hand = sum of unexpired entries.
 */
export interface StockEntry {
  id: ID;
  kind: 'food' | 'water' | 'equipment';
  /** For kind 'food'. */
  foodId?: ID;
  /** For kind 'equipment': the equipment name as the plan lists it. */
  item?: string;
  /** Packages (food), gallons (water) or count (equipment). Food can be a fraction of a package. */
  quantity: number;
  /** What was actually bought when it wasn't the plan's package size (e.g. 1 × 160 oz box), for display. */
  bought?: { count: number; size: number; unit: SizeUnit };
  bestBy?: ISODate;
  note?: string;
  addedAt: ISODate;
  updatedAt: ISODate;
}

// ---------- Change review ----------
export type ChangeEntity = 'member' | 'restriction' | 'need' | 'condition' | 'survey' | 'food' | 'household' | 'customValue' | 'customField';
export type ChangeOp = 'create' | 'update' | 'deactivate' | 'reactivate' | 'status' | 'merge' | 'submit';
export type ChangeStatus = 'pending' | 'approved' | 'denied' | 'acknowledged';

/**
 * A reviewable change with before/after values. Admin changes apply immediately and
 * "deny" reverts them; respondent suggestions (Phase 3) apply only when approved.
 */
export interface ChangeRecord {
  id: ID;
  timestamp: ISODate;
  entity: ChangeEntity;
  entityId: ID;
  memberId?: ID;
  op: ChangeOp;
  /** Only the fields this change touched. Encrypted fields stay encrypted. */
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  source: 'admin' | 'respondent';
  status: ChangeStatus;
  /** Can "deny" undo it? (Survey submissions and merges cannot.) */
  reversible: boolean;
  readAt?: ISODate;
  decidedAt?: ISODate;
}

// ---------- Audit / meta ----------
export interface AuditEvent {
  id: ID;
  action: string;
  timestamp: ISODate;
  refs: Record<string, ID | ID[] | undefined>;
  detail?: string;
}

/** Key/value store for app metadata (catalog version, auth params, etc.). */
export interface MetaEntry {
  key: string;
  value: unknown;
}

export interface EncryptedBlob {
  iv: string; // base64
  ct: string; // base64
}
