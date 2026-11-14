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
  };
}

// ---------- Members ----------
export type MemberStatus = 'active' | 'inactive' | 'archived';
export type AgeBand = 'infant' | 'toddler' | 'child' | 'teen' | 'adult' | 'older-adult';
export type Presence = 'usually-present' | 'occasional-guest' | 'temporary-guest';

export interface PlanningProfile {
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
  updatedAt: ISODate;
}

export type RestrictionType =
  | 'allergy'
  | 'intolerance'
  | 'special-diet'
  | 'religious-ethical'
  | 'cannot-eat'
  | 'texture'
  | 'medical-feeding';

export interface MemberRestriction {
  id: ID;
  memberId: ID;
  type: RestrictionType;
  /** Allergen code (e.g. 'peanut') or food tag/item id the restriction targets. Plain so the engine can filter without unlocking. */
  subject: string;
  severity?: 'mild' | 'moderate' | 'severe';
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

export interface CustomFieldValue {
  id: ID; // `${memberId}:${fieldDefinitionId}`
  memberId: ID;
  fieldDefinitionId: ID;
  value: string | number | boolean | string[];
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
  | 'beverage';

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
    cookMinutes: number;
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

export type SurveyStatus = 'in-progress' | 'submitted' | 'superseded';

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
  /** Respondent-flagged restriction concerns awaiting admin review. */
  restrictionFlags?: { restrictionId?: ID; text: string }[];
  needsRefresh?: boolean;
  updatedAt: ISODate;
}

export interface SurveyAnswer {
  id: ID; // `${surveyId}:${foodItemId}`
  surveyId: ID;
  foodItemId: ID;
  rating: RatingCode;
  onlyPreparedCertainWay?: boolean;
  prepNotes?: string;
  comment?: string;
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
