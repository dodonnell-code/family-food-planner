import { audit, db as defaultDb, now, uid, type PlannerDB } from './db';
import { buildSeedCatalog, CATALOG_VERSION, RETIRED_SEED_IDS } from './seedCatalog';
import { pick, recordChange } from './changes';
import type {
  Household,
  ID,
  Member,
  MemberCondition,
  MemberNeed,
  MemberRestriction,
  MemberStatus,
  PlanningProfile,
  RatingCode,
  Survey,
  SurveyAnswer,
} from '../domain/types';

export const DEFAULT_PLANNING = {
  shortDays: 3,
  mediumDays: 14,
  longDays: 90,
  waterGallonsPerPersonPerDay: 1,
  minDailyMealOptions: 3,
  defaultDailyCalories: 2000,
  mealsPerDay: 3,
  waterReserveDays: 3,
  longTermCannedMaxPercent: 20,
} as const;

// ---------------- Household & seed ----------------
export async function ensureInitialized(database: PlannerDB = defaultDb): Promise<Household> {
  return database.transaction('rw', database.households, database.foods, database.meta, async () => {
    let hh = await database.households.toCollection().first();
    if (!hh) {
      hh = {
        id: uid(),
        name: 'Our household',
        createdAt: now(),
        planningDefaults: { ...DEFAULT_PLANNING },
        settings: { autoLockMinutes: 5, backupReminderDays: 14 },
      };
      await database.households.add(hh);
    } else if (Object.keys(DEFAULT_PLANNING).some((k) => !(k in hh!.planningDefaults))) {
      // Fill in settings added in newer versions without touching existing values.
      hh = { ...hh, planningDefaults: { ...DEFAULT_PLANNING, ...hh.planningDefaults } };
      await database.households.put(hh);
    }
    const seeded = (await database.meta.get('catalogVersion'))?.value as number | undefined;
    if (!seeded || seeded < CATALOG_VERSION) {
      // Add new seed entries; refresh untouched seed entries (revision 1 = never edited by admin).
      // Admin-edited entries are never overwritten.
      const existing = new Map((await database.foods.toArray()).map((f) => [f.id, f]));
      const seed = buildSeedCatalog();
      await database.foods.bulkAdd(seed.filter((f) => !existing.has(f.id)));
      await database.foods.bulkPut(seed.filter((f) => existing.get(f.id)?.revision === 1));
      for (const id of RETIRED_SEED_IDS) { const f = existing.get(id); if (f?.revision === 1 && f.active) await database.foods.update(id, { active: false }); }
      await database.meta.put({ key: 'catalogVersion', value: CATALOG_VERSION });
    }
    return hh;
  });
}

export async function getCatalogVersion(database: PlannerDB = defaultDb): Promise<number> {
  return ((await database.meta.get('catalogVersion'))?.value as number) ?? CATALOG_VERSION;
}

// ---------------- Members ----------------
export async function addMember(
  input: { displayName: string; preferredName?: string; color?: string; planningProfile?: Partial<PlanningProfile> },
  database: PlannerDB = defaultDb,
): Promise<Member> {
  const hh = await ensureInitialized(database);
  const ts = now();
  const m: Member = {
    id: uid(),
    householdId: hh.id,
    displayName: input.displayName.trim(),
    preferredName: input.preferredName?.trim() || undefined,
    color: input.color,
    status: 'active',
    createdAt: ts,
    joinedAt: ts,
    planningProfile: { presence: 'usually-present', ...input.planningProfile },
    updatedAt: ts,
  };
  if (!m.displayName) throw new Error('Display name is required');
  await database.members.add(m);
  await audit('member.add', { memberId: m.id }, undefined, database);
  await recordChange(database, { entity: 'member', entityId: m.id, memberId: m.id, op: 'create',
    after: pick(m, ['displayName', 'preferredName', 'status', 'planningProfile']) });
  return m;
}

export async function updateMember(id: ID, patch: Partial<Omit<Member, 'id' | 'householdId' | 'createdAt'>>, database: PlannerDB = defaultDb) {
  const before = await database.members.get(id);
  await database.members.update(id, { ...patch, updatedAt: now() });
  await audit('member.update', { memberId: id }, Object.keys(patch).join(','), database);
  const keys = Object.keys(patch);
  await recordChange(database, { entity: 'member', entityId: id, memberId: id, op: 'update', before: pick(before, keys), after: pick(patch, keys) });
}

export async function setMemberStatus(id: ID, status: MemberStatus, database: PlannerDB = defaultDb) {
  await database.transaction('rw', [database.members, database.surveys, database.audit, database.changes], async () => {
    const m = await database.members.get(id);
    if (!m) throw new Error('Member not found');
    const ts = now();
    const patch: Partial<Member> = { status, updatedAt: ts };
    if (status === 'active' && m.status !== 'active') {
      // Reactivation reuses the same ID; prior surveys are kept but marked for refresh.
      patch.leftAt = undefined;
      const latest = await latestSubmittedSurvey(id, database);
      if (latest) await database.surveys.update(latest.id, { needsRefresh: true });
    } else if (status !== 'active' && m.status === 'active') {
      patch.leftAt = ts;
    }
    await database.members.update(id, patch);
    await audit(`member.status.${status}`, { memberId: id }, undefined, database);
    if (m.status !== status) {
      await recordChange(database, { entity: 'member', entityId: id, memberId: id, op: 'status',
        before: { status: m.status, leftAt: m.leftAt }, after: { status, leftAt: 'leftAt' in patch ? patch.leftAt : m.leftAt } });
    }
  });
}

/** Admin-only merge: moves all records from `fromId` onto `intoId`, archives `fromId`. Never automatic. */
export async function mergeMembers(intoId: ID, fromId: ID, database: PlannerDB = defaultDb) {
  if (intoId === fromId) throw new Error('Cannot merge a member into itself');
  await database.transaction('rw', [database.members, database.surveys, database.restrictions, database.needs, database.conditions, database.customValues, database.audit, database.changes], async () => {
    await database.surveys.where('memberId').equals(fromId).modify({ memberId: intoId });
    await database.restrictions.where('memberId').equals(fromId).modify({ memberId: intoId });
    await database.needs.where('memberId').equals(fromId).modify({ memberId: intoId });
    await database.conditions.where('memberId').equals(fromId).modify({ memberId: intoId });
    await database.customValues.where('memberId').equals(fromId).delete(); // keep target's values
    await database.members.update(fromId, { status: 'archived', updatedAt: now() });
    await audit('member.merge', { intoId, fromId }, undefined, database);
    const from = await database.members.get(fromId);
    await recordChange(database, { entity: 'member', entityId: fromId, memberId: intoId, op: 'merge', before: { displayName: from?.displayName }, after: { mergedInto: intoId } });
  });
}

export const isOnRoster = (m: Member, onDate?: string): boolean => {
  if (m.status !== 'active') return false;
  const p = m.planningProfile;
  if (p.presence === 'temporary-guest' && onDate) {
    if (p.guestFrom && onDate < p.guestFrom) return false;
    if (p.guestUntil && onDate > p.guestUntil) return false;
  }
  return true;
};

// ---------------- Restrictions ----------------
export async function addRestriction(
  input: Omit<MemberRestriction, 'id' | 'createdAt' | 'active'> & { active?: boolean },
  database: PlannerDB = defaultDb,
): Promise<MemberRestriction> {
  const r: MemberRestriction = { active: true, ...input, id: uid(), createdAt: now() };
  await database.restrictions.add(r);
  // A changed hard restriction makes older surveys potentially outdated (scope §4).
  const latest = await latestSubmittedSurvey(r.memberId, database);
  if (latest) await database.surveys.update(latest.id, { needsRefresh: true });
  await audit('restriction.add', { memberId: r.memberId, restrictionId: r.id }, r.subject, database);
  await recordChange(database, { entity: 'restriction', entityId: r.id, memberId: r.memberId, op: 'create',
    after: pick(r, ['type', 'subject', 'severity', 'strictness', 'cautionCrossContact', 'verifiedAt', 'adminNoteEnc', 'active']) });
  return r;
}

/** Add several restrictions at once (one record per subject); skips subjects already active for the member. */
export async function addRestrictions(
  memberId: ID,
  subjects: string[],
  common: Omit<MemberRestriction, 'id' | 'createdAt' | 'active' | 'memberId' | 'subject'>,
  database: PlannerDB = defaultDb,
): Promise<{ added: MemberRestriction[]; skipped: string[] }> {
  const existing = await database.restrictions.where('memberId').equals(memberId).filter((r) => r.active).toArray();
  const have = new Set(existing.map((r) => `${r.type}|${r.subject.toLowerCase()}`));
  const added: MemberRestriction[] = [];
  const skipped: string[] = [];
  for (const subject of [...new Set(subjects.map((s) => s.trim()).filter(Boolean))]) {
    if (have.has(`${common.type}|${subject.toLowerCase()}`)) skipped.push(subject);
    else added.push(await addRestriction({ ...common, memberId, subject }, database));
  }
  return { added, skipped };
}

// ---------------- Needs & conditions ----------------
export async function addNeed(input: Omit<MemberNeed, 'id' | 'createdAt' | 'updatedAt' | 'active'>, database: PlannerDB = defaultDb): Promise<MemberNeed> {
  const ts = now();
  const n: MemberNeed = { ...input, id: uid(), active: true, createdAt: ts, updatedAt: ts };
  await database.needs.add(n);
  await audit('need.add', { memberId: n.memberId, needId: n.id }, `${n.domain}:${n.kind}`, database);
  await recordChange(database, { entity: 'need', entityId: n.id, memberId: n.memberId, op: 'create', after: pick(n, ['kind', 'params', 'confirmed', 'detailsEnc', 'active']) });
  return n;
}

export async function updateNeed(id: ID, patch: Partial<Pick<MemberNeed, 'params' | 'confirmed' | 'detailsEnc'>>, database: PlannerDB = defaultDb) {
  const before = await database.needs.get(id);
  await database.needs.update(id, { ...patch, updatedAt: now() });
  await audit('need.update', { needId: id }, undefined, database);
  const keys = Object.keys(patch);
  await recordChange(database, { entity: 'need', entityId: id, memberId: before?.memberId, op: 'update', before: pick(before, keys), after: pick(patch, keys) });
}

export async function deactivateNeed(id: ID, database: PlannerDB = defaultDb) {
  const n = await database.needs.get(id);
  await database.needs.update(id, { active: false, updatedAt: now() });
  await audit('need.deactivate', { needId: id }, undefined, database);
  await recordChange(database, { entity: 'need', entityId: id, memberId: n?.memberId, op: 'deactivate', before: { active: true }, after: { active: false } });
}

export async function addCondition(memberId: ID, labelEnc: MemberCondition['labelEnc'], database: PlannerDB = defaultDb): Promise<MemberCondition> {
  const c: MemberCondition = { id: uid(), memberId, labelEnc, active: true, createdAt: now() };
  await database.conditions.add(c);
  await audit('condition.add', { memberId, conditionId: c.id }, undefined, database);
  await recordChange(database, { entity: 'condition', entityId: c.id, memberId, op: 'create', after: { labelEnc: labelEnc, active: true } });
  return c;
}

export async function deactivateCondition(id: ID, database: PlannerDB = defaultDb) {
  const c = await database.conditions.get(id);
  await database.conditions.update(id, { active: false });
  await audit('condition.deactivate', { conditionId: id }, undefined, database);
  await recordChange(database, { entity: 'condition', entityId: id, memberId: c?.memberId, op: 'deactivate', before: { active: true }, after: { active: false } });
}

export async function deactivateRestriction(id: ID, database: PlannerDB = defaultDb) {
  const r = await database.restrictions.get(id);
  await database.restrictions.update(id, { active: false });
  await audit('restriction.deactivate', { restrictionId: id }, undefined, database);
  await recordChange(database, { entity: 'restriction', entityId: id, memberId: r?.memberId, op: 'deactivate', before: { active: true }, after: { active: false } });
}

// ---------------- Surveys ----------------
export async function latestSubmittedSurvey(memberId: ID, database: PlannerDB = defaultDb): Promise<Survey | undefined> {
  const all = await database.surveys.where('memberId').equals(memberId).toArray();
  return all.filter((s) => s.status === 'submitted').sort((a, b) => b.version - a.version)[0];
}

export async function inProgressSurvey(memberId: ID, database: PlannerDB = defaultDb): Promise<Survey | undefined> {
  const all = await database.surveys.where('memberId').equals(memberId).toArray();
  return all.find((s) => s.status === 'in-progress');
}

/** Resume an in-progress survey, or start a new version (admin-permitted). */
export async function startOrResumeSurvey(memberId: ID, database: PlannerDB = defaultDb): Promise<Survey> {
  const existing = await inProgressSurvey(memberId, database);
  if (existing) return existing;
  const all = await database.surveys.where('memberId').equals(memberId).toArray();
  const prev = all.sort((a, b) => b.version - a.version)[0];
  const ts = now();
  const s: Survey = {
    id: uid(),
    memberId,
    catalogVersion: await getCatalogVersion(database),
    status: 'in-progress',
    version: (prev?.version ?? 0) + 1,
    supersedesSurveyId: prev?.id,
    startedAt: ts,
    currentStep: 0,
    updatedAt: ts,
  };
  await database.surveys.add(s);
  await audit('survey.start', { memberId, surveyId: s.id }, undefined, database);
  return s;
}

function assertEditable(s: Survey | undefined): asserts s is Survey {
  if (!s) throw new Error('Survey not found');
  if (s.status !== 'in-progress') throw new Error('Submitted surveys are locked');
}

/** Atomic per-answer save (scope §11 data integrity). */
export async function saveAnswer(
  surveyId: ID,
  foodItemId: ID,
  rating: RatingCode,
  extra: Pick<SurveyAnswer, 'onlyPreparedCertainWay' | 'prepNotes' | 'comment'> = {},
  database: PlannerDB = defaultDb,
) {
  await database.transaction('rw', database.surveys, database.answers, async () => {
    assertEditable(await database.surveys.get(surveyId));
    await database.answers.put({ id: `${surveyId}:${foodItemId}`, surveyId, foodItemId, rating, ...extra });
    await database.surveys.update(surveyId, { updatedAt: now() });
  });
}

export async function updateSurveyProgress(surveyId: ID, patch: Partial<Pick<Survey, 'currentStep' | 'prepTolerance' | 'openResponses' | 'suggestions'>>, database: PlannerDB = defaultDb) {
  await database.transaction('rw', database.surveys, async () => {
    assertEditable(await database.surveys.get(surveyId));
    await database.surveys.update(surveyId, { ...patch, updatedAt: now() });
  });
}

export async function submitSurvey(surveyId: ID, database: PlannerDB = defaultDb) {
  await database.transaction('rw', [database.surveys, database.audit, database.changes, database.answers, database.foods, database.restrictions, database.members], async () => {
    const s = await database.surveys.get(surveyId);
    assertEditable(s);
    await createSuggestionChanges(s, database);
    // Previous submitted version becomes 'superseded' but is never deleted.
    const others = await database.surveys.where('memberId').equals(s.memberId).toArray();
    for (const o of others) if (o.status === 'submitted') await database.surveys.update(o.id, { status: 'superseded' });
    await database.surveys.update(surveyId, { status: 'submitted', completedAt: now(), updatedAt: now() });
    await audit('survey.submit', { memberId: s.memberId, surveyId }, undefined, database);
    const refusedIds = (await database.answers.where('surveyId').equals(surveyId).toArray()).filter((a) => a.rating === 1).map((a) => a.foodItemId);
    const refused = (await database.foods.bulkGet(refusedIds)).flatMap((f) => (f ? [f.name] : []));
    await recordChange(database, { entity: 'survey', entityId: surveyId, memberId: s.memberId, op: 'submit',
      after: { version: s.version, ...(refused.length ? { refuses: refused } : {}) } });
  });
}

/**
 * Turn the respondent's suggestions — plus any "Can't eat" ratings not already covered by a
 * restriction — into pending review items. Nothing is applied until the admin approves.
 */
async function createSuggestionChanges(s: Survey, database: PlannerDB) {
  const base = { memberId: s.memberId, source: 'respondent' as const, reversible: true };
  const existing = await database.restrictions.where('memberId').equals(s.memberId).filter((r) => r.active).toArray();
  const covered = new Set(existing.map((r) => r.subject.toLowerCase()));

  for (const sg of s.suggestions ?? []) {
    if (sg.kind === 'preferred-name' && sg.value.trim()) {
      const m = await database.members.get(s.memberId);
      await recordChange(database, { ...base, entity: 'member', entityId: s.memberId, op: 'update',
        before: { preferredName: m?.preferredName }, after: { preferredName: sg.value.trim() } });
    } else if (sg.kind === 'remove-restriction') {
      await recordChange(database, { ...base, entity: 'restriction', entityId: sg.restrictionId, op: 'deactivate',
        before: { active: true }, after: { active: false, reason: sg.reason || undefined } });
    } else if (sg.kind === 'add-restriction' && sg.text.trim()) {
      for (const text of sg.text.split(/[,;\n]/).map((t) => t.trim()).filter(Boolean)) {
        if (covered.has(`food:${text.toLowerCase()}`)) continue;
        await recordChange(database, { ...base, entity: 'restriction', entityId: uid(), op: 'create',
          after: { type: sg.restrictionType, subject: `food:${text}` } });
      }
    }
  }
  // "Foods you never want stocked for you" → dislike suggestions.
  const never = s.openResponses?.neverStock ?? '';
  for (const text of never.split(/[,;\n]/).map((t) => t.trim().replace(/\.$/, '')).filter(Boolean)) {
    if (covered.has(`food:${text.toLowerCase()}`)) continue;
    await recordChange(database, { ...base, entity: 'restriction', entityId: uid(), op: 'create',
      after: { type: 'dislike', subject: `food:${text}`, reason: 'From “never stock for me” in survey' } });
  }

  const blockedAnswers = (await database.answers.where('surveyId').equals(s.id).toArray()).filter((a) => a.rating === 'blocked');
  for (const a of blockedAnswers) {
    const food = await database.foods.get(a.foodItemId);
    if (!food || covered.has(`food:${food.name.toLowerCase()}`)) continue;
    await recordChange(database, { ...base, entity: 'restriction', entityId: uid(), op: 'create',
      after: { type: 'cannot-eat', subject: `food:${food.name}`, reason: 'Marked "Can’t eat" in survey' } });
  }
}

/** Stop (or resume) applying one "Would refuse" answer until the person's next survey. */
export async function setRefusalIgnored(surveyId: ID, foodItemId: ID, ignored: boolean, database: PlannerDB = defaultDb) {
  const s = await database.surveys.get(surveyId);
  if (!s) throw new Error('Survey not found');
  const before = s.ignoredRefusals ?? [];
  const after = ignored ? [...new Set([...before, foodItemId])] : before.filter((x) => x !== foodItemId);
  await database.surveys.update(surveyId, { ignoredRefusals: after });
  await audit('survey.refusal', { surveyId, memberId: s.memberId }, `${ignored ? 'ignore' : 'restore'}:${foodItemId}`, database);
  await recordChange(database, { entity: 'survey', entityId: surveyId, memberId: s.memberId, op: 'update',
    before: { ignoredRefusals: before }, after: { ignoredRefusals: after } });
}

export async function answersFor(surveyId: ID, database: PlannerDB = defaultDb): Promise<SurveyAnswer[]> {
  return database.answers.where('surveyId').equals(surveyId).toArray();
}
