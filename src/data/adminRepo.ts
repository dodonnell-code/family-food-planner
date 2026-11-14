// Catalog, household settings and custom-field writes. Every write is audited and
// produces a reviewable ChangeRecord (before/after) like member edits do.
import { audit, db as defaultDb, now, uid, type PlannerDB } from './db';
import { pick, recordChange } from './changes';
import { encryptString } from './crypto';
import type { CustomFieldDefinition, CustomValue, EncryptedBlob, FoodItem, Household, ID, PrepMethod } from '../domain/types';

// ---------------- Food catalog ----------------
const NO_HEAT: PrepMethod[] = ['ready-to-eat', 'add-cold-water'];

/** Fill derived fields and validate. Throws with a readable message. */
export function normalizeFood(f: FoodItem): FoodItem {
  if (!f.name.trim()) throw new Error('Name is required');
  if (!(f.package.servingsPerPackage > 0)) throw new Error('Servings per package must be more than 0');
  if (!(f.nutrition.caloriesPerServing >= 0)) throw new Error('Calories per serving must be 0 or more');
  if (f.shelfLife.unopenedMonthsMax < f.shelfLife.unopenedMonthsMin) throw new Error('Shelf life “up to” must be at least the “from” value');
  const edibleWithoutHeat = NO_HEAT.includes(f.prep.method);
  const equipment = [...new Set((f.equipment ?? []).map((t) => t.trim()).filter(Boolean))];
  const mayContain = (f.allergens.mayContain ?? []).filter((a) => !f.allergens.contains.includes(a));
  return {
    ...f,
    name: f.name.trim(),
    tags: [...new Set(f.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))],
    prep: { ...f.prep, edibleWithoutHeat, needsFuel: !edibleWithoutHeat, cookMinutes: edibleWithoutHeat ? 0 : f.prep.cookMinutes },
    allergens: { ...f.allergens, mayContain: mayContain.length ? mayContain : undefined },
    equipment: equipment.length ? equipment : undefined,
  };
}

export function blankFood(): FoodItem {
  return {
    id: '',
    name: '',
    category: 'meal',
    form: 'canned',
    tags: [],
    allergens: { contains: [], mayContain: [], verifyLabel: true },
    prep: { method: 'ready-to-eat', edibleWithoutHeat: true, cookMinutes: 0, waterCupsPerServing: 0, needsFuel: false },
    shelfLife: { unopenedMonthsMin: 12, unopenedMonthsMax: 24, storage: 'Cool, dry, dark; unopened', source: 'Package label' },
    nutrition: { servingDesc: '1 serving', caloriesPerServing: 0 },
    package: { description: '', servingsPerPackage: 1 },
    relativeCost: 2,
    rotationPriority: 2,
    packagingDurability: 2,
    mealRole: 'main',
    active: true,
    needsReview: false,
    revision: 1,
    updatedAt: now(),
  };
}

const FOOD_KEYS: (keyof FoodItem)[] = ['name', 'category', 'form', 'examples', 'tags', 'allergens', 'prep', 'shelfLife', 'nutrition', 'package', 'priceEstimate', 'relativeCost', 'rotationPriority', 'packagingDurability', 'safetyNotes', 'equipment', 'mealRole', 'needsReview'];

export async function saveFood(input: FoodItem, database: PlannerDB = defaultDb): Promise<FoodItem> {
  const f = normalizeFood(input);
  const existing = f.id ? await database.foods.get(f.id) : undefined;
  const ts = now();
  if (!existing) {
    const created: FoodItem = { ...f, id: f.id || `custom-${uid()}`, revision: 2, active: true, updatedAt: ts };
    await database.foods.add(created);
    await audit('food.add', { foodId: created.id }, created.name, database);
    await recordChange(database, { entity: 'food', entityId: created.id, op: 'create', after: pick(created, ['name', 'category', 'form', 'allergens', 'prep', 'nutrition', 'package']) });
    return created;
  }
  // revision > 1 marks it admin-edited, so catalog upgrades never overwrite it.
  const updated: FoodItem = { ...existing, ...f, id: existing.id, active: existing.active, revision: existing.revision + 1, updatedAt: ts };
  const changed = FOOD_KEYS.filter((k) => JSON.stringify(existing[k]) !== JSON.stringify(updated[k]));
  await database.foods.put(updated);
  await audit('food.update', { foodId: updated.id }, changed.join(','), database);
  await recordChange(database, { entity: 'food', entityId: updated.id, op: 'update', before: pick(existing, changed), after: pick(updated, changed) });
  return updated;
}

/** Retire (or restore) a food. Never deleted: surveys and plans may reference it. */
export async function setFoodActive(id: ID, active: boolean, database: PlannerDB = defaultDb) {
  const f = await database.foods.get(id);
  if (!f || f.active === active) return;
  await database.foods.update(id, { active, updatedAt: now() });
  await audit(active ? 'food.restore' : 'food.retire', { foodId: id }, f.name, database);
  await recordChange(database, { entity: 'food', entityId: id, op: active ? 'reactivate' : 'deactivate', before: { active: f.active }, after: { active } });
}

// ---------------- Household settings ----------------
export async function updateHousehold(patch: Partial<Pick<Household, 'name' | 'planningDefaults' | 'settings'>>, database: PlannerDB = defaultDb) {
  const hh = await database.households.toCollection().first();
  if (!hh) throw new Error('Household not initialized');
  const p = patch.planningDefaults;
  if (p) {
    for (const [k, v] of Object.entries(p)) if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v) || v < 0)) throw new Error(`Invalid value for ${k}`);
    if (p.shortDays < 1 || p.mediumDays < 1 || p.longDays < 1) throw new Error('Each planning horizon must be at least 1 day');
    if (!(p.shortDays < p.mediumDays && p.mediumDays < p.longDays)) throw new Error('Horizons must increase: short < medium < long');
    if (p.mealsPerDay < 1 || p.mealsPerDay > 6) throw new Error('Meals per day must be between 1 and 6');
  }
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  await database.households.update(hh.id, patch);
  await audit('household.update', { householdId: hh.id }, keys.join(','), database);
  await recordChange(database, { entity: 'household', entityId: hh.id, op: 'update', before: pick(hh, keys), after: pick(patch, keys) });
}

// ---------------- Custom profile fields ----------------
export async function saveFieldDefinition(input: Omit<CustomFieldDefinition, 'id'> & { id?: ID }, database: PlannerDB = defaultDb): Promise<CustomFieldDefinition> {
  if (!input.label.trim()) throw new Error('Label is required');
  const needsOptions = input.dataType === 'single-select' || input.dataType === 'multi-select';
  const options = needsOptions ? [...new Set((input.options ?? []).map((o) => o.trim()).filter(Boolean))] : undefined;
  if (needsOptions && !options?.length) throw new Error('Add at least one option');
  const def: CustomFieldDefinition = { ...input, id: input.id ?? uid(), label: input.label.trim(), options };
  const before = input.id ? await database.customFields.get(input.id) : undefined;
  await database.customFields.put(def);
  await audit(before ? 'field.update' : 'field.add', { fieldId: def.id }, def.label, database);
  const keys = ['label', 'dataType', 'options', 'sensitivity', 'enabled'];
  await recordChange(database, before
    ? { entity: 'customField', entityId: def.id, op: 'update', before: pick(before, keys), after: pick(def, keys) }
    : { entity: 'customField', entityId: def.id, op: 'create', after: pick(def, keys) });
  return def;
}

export async function setCustomValue(memberId: ID, def: CustomFieldDefinition, value: CustomValue | undefined, dek: CryptoKey | null, database: PlannerDB = defaultDb) {
  const id = `${memberId}:${def.id}`;
  const before = await database.customValues.get(id);
  const empty = value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
  let next: { value?: CustomValue; valueEnc?: EncryptedBlob };
  if (empty) next = {};
  else if (def.sensitivity === 'private') {
    if (!dek) throw new Error('Unlock Admin to save private fields');
    next = { valueEnc: await encryptString(dek, JSON.stringify(value)) };
  } else next = { value };
  await database.customValues.put({ id, memberId, fieldDefinitionId: def.id, ...next });
  await audit('field.value', { memberId, fieldId: def.id }, undefined, database);
  await recordChange(database, { entity: 'customValue', entityId: id, memberId, op: 'update',
    before: { value: before?.value, valueEnc: before?.valueEnc }, after: { value: next.value, valueEnc: next.valueEnc } });
}
