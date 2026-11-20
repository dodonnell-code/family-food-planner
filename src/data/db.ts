import Dexie, { type EntityTable } from 'dexie';
import type {
  AuditEvent,
  ChangeRecord,
  CustomFieldDefinition,
  CustomFieldValue,
  FoodItem,
  Household,
  Member,
  MemberCondition,
  MemberNeed,
  MemberRestriction,
  MetaEntry,
  PlanningScenario,
  PlanSnapshot,
  Survey,
  StockEntry,
  SurveyAnswer,
  ShoppingItem,
} from '../domain/types';

/** Local IndexedDB store (scope §10: structured storage, not a localStorage blob). */
export class PlannerDB extends Dexie {
  households!: EntityTable<Household, 'id'>;
  // @ts-expect-error dexie-cloud-addon declares a `members` table on every Dexie. This database
  // isn't synced by the addon (sync.ts mirrors it into a separate one), so ours is the real type.
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
  needs!: EntityTable<MemberNeed, 'id'>;
  conditions!: EntityTable<MemberCondition, 'id'>;
  changes!: EntityTable<ChangeRecord, 'id'>;
  stock!: EntityTable<StockEntry, 'id'>;
  shopping!: EntityTable<ShoppingItem, 'id'>;

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
    // v2: needs & conditions become lists (multiple per member), extensible by domain.
    this.version(2)
      .stores({
        needs: 'id, memberId, domain, kind, active',
        conditions: 'id, memberId, active',
      })
      .upgrade(async (tx) => {
        const ts = new Date().toISOString();
        const needs = tx.table<MemberNeed, string>('needs');
        const conditions = tx.table<MemberCondition, string>('conditions');
        const members = tx.table<Member, string>('members');
        for (const m of await members.toArray()) {
          const hn = m.planningProfile.healthNeeds;
          const add = (kind: string, params: Record<string, number> = {}, confirmed = true) =>
            needs.add({ id: crypto.randomUUID(), memberId: m.id, domain: 'food', kind, params, confirmed, active: true, createdAt: ts, updatedAt: ts });
          if (hn?.rapidCarbs?.enabled) await add('rapid-carbs', { servingsPerDay: hn.rapidCarbs.servingsPerDay }, hn.rapidCarbs.confirmed);
          if (hn?.carbCounting) await add('carb-counting');
          if (hn?.infantFormula) await add('infant-formula');
          if (hn?.textureModified) await add('texture-modified');
          if (hn?.specialtyFormula) await add('specialty-formula');
          if (m.conditionLabelEnc) {
            await conditions.add({ id: crypto.randomUUID(), memberId: m.id, labelEnc: m.conditionLabelEnc, active: true, createdAt: ts });
          }
          if (hn || m.conditionLabelEnc) {
            delete m.planningProfile.healthNeeds;
            delete m.conditionLabelEnc;
            await members.put(m);
          }
        }
      });
    // v3: reviewable change records (before/after, read/unread, approve/deny).
    this.version(3).stores({ changes: 'id, timestamp, status, memberId, entity, entityId' });
    // v4: inventory (what's on hand).
    this.version(4).stores({ stock: 'id, kind, foodId, bestBy' });
    // v5: the shared shopping list.
    this.version(5).stores({ shopping: 'id, foodId, checked' });
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
