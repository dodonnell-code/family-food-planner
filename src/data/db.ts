import Dexie, { type EntityTable } from 'dexie';
import type {
  AuditEvent,
  CustomFieldDefinition,
  CustomFieldValue,
  FoodItem,
  Household,
  Member,
  MemberRestriction,
  MetaEntry,
  PlanningScenario,
  PlanSnapshot,
  Survey,
  SurveyAnswer,
} from '../domain/types';

/** Local IndexedDB store (scope §10: structured storage, not a localStorage blob). */
export class PlannerDB extends Dexie {
  households!: EntityTable<Household, 'id'>;
  members!: EntityTable<Member, 'id'>;
  restrictions!: EntityTable<MemberRestriction, 'id'>;
  customFields!: EntityTable<CustomFieldDefinition, 'id'>;
  customValues!: EntityTable<CustomFieldValue, 'id'>;
  foods!: EntityTable<FoodItem, 'id'>;
  surveys!: EntityTable<Survey, 'id'>;
  answers!: EntityTable<SurveyAnswer, 'id'>;
  scenarios!: EntityTable<PlanningScenario, 'id'>;
  snapshots!: EntityTable<PlanSnapshot, 'id'>;
  audit!: EntityTable<AuditEvent, 'id'>;
  meta!: EntityTable<MetaEntry, 'key'>;

  constructor(name = 'family-food-planner') {
    super(name);
    this.version(1).stores({
      households: 'id',
      members: 'id, householdId, status',
      restrictions: 'id, memberId, active',
      customFields: 'id',
      customValues: 'id, memberId, fieldDefinitionId',
      foods: 'id, category, active',
      surveys: 'id, memberId, status, [memberId+version]',
      answers: 'id, surveyId, foodItemId',
      scenarios: 'id, createdAt',
      snapshots: 'id, scenarioId, createdAt',
      audit: 'id, timestamp, action',
      meta: 'key',
    });
  }
}

export const db = new PlannerDB();

export const uid = (): string => crypto.randomUUID();
export const now = (): string => new Date().toISOString();

export async function audit(action: string, refs: AuditEvent['refs'], detail?: string, database: PlannerDB = db) {
  await database.audit.add({ id: uid(), action, timestamp: now(), refs, detail });
}

/** Ask the browser not to evict our data (scope §10, WebKit storage policy [R8]). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* unsupported */
  }
  return false;
}
