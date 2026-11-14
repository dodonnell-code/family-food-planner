import { audit, db as defaultDb, now, uid, type PlannerDB } from './db';
import { buildSeedCatalog, CATALOG_VERSION } from './seedCatalog';
import type {
  Household,
  ID,
  Member,
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
    }
    const seeded = (await database.meta.get('catalogVersion'))?.value as number | undefined;
    if (!seeded || seeded < CATALOG_VERSION) {
      // Only add entries that don't exist; never overwrite admin edits.
      const existing = new Set(await database.foods.toCollection().primaryKeys());
      await database.foods.bulkAdd(buildSeedCatalog().filter((f) => !existing.has(f.id)));
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
  return m;
}

export async function updateMember(id: ID, patch: Partial<Omit<Member, 'id' | 'householdId' | 'createdAt'>>, database: PlannerDB = defaultDb) {
  await database.members.update(id, { ...patch, updatedAt: now() });
  await audit('member.update', { memberId: id }, Object.keys(patch).join(','), database);
}

export async function setMemberStatus(id: ID, status: MemberStatus, database: PlannerDB = defaultDb) {
  await database.transaction('rw', database.members, database.surveys, database.audit, async () => {
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
  });
}

/** Admin-only merge: moves all records from `fromId` onto `intoId`, archives `fromId`. Never automatic. */
export async function mergeMembers(intoId: ID, fromId: ID, database: PlannerDB = defaultDb) {
  if (intoId === fromId) throw new Error('Cannot merge a member into itself');
  await database.transaction('rw', [database.members, database.surveys, database.restrictions, database.customValues, database.audit], async () => {
    await database.surveys.where('memberId').equals(fromId).modify({ memberId: intoId });
    await database.restrictions.where('memberId').equals(fromId).modify({ memberId: intoId });
    await database.customValues.where('memberId').equals(fromId).delete(); // keep target's values
    await database.members.update(fromId, { status: 'archived', updatedAt: now() });
    await audit('member.merge', { intoId, fromId }, undefined, database);
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
  return r;
}

export async function deactivateRestriction(id: ID, database: PlannerDB = defaultDb) {
  await database.restrictions.update(id, { active: false });
  await audit('restriction.deactivate', { restrictionId: id }, undefined, database);
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

export async function updateSurveyProgress(surveyId: ID, patch: Partial<Pick<Survey, 'currentStep' | 'prepTolerance' | 'openResponses' | 'restrictionFlags'>>, database: PlannerDB = defaultDb) {
  await database.transaction('rw', database.surveys, async () => {
    assertEditable(await database.surveys.get(surveyId));
    await database.surveys.update(surveyId, { ...patch, updatedAt: now() });
  });
}

export async function submitSurvey(surveyId: ID, database: PlannerDB = defaultDb) {
  await database.transaction('rw', database.surveys, database.audit, async () => {
    const s = await database.surveys.get(surveyId);
    assertEditable(s);
    // Previous submitted version becomes 'superseded' but is never deleted.
    const others = await database.surveys.where('memberId').equals(s.memberId).toArray();
    for (const o of others) if (o.status === 'submitted') await database.surveys.update(o.id, { status: 'superseded' });
    await database.surveys.update(surveyId, { status: 'submitted', completedAt: now(), updatedAt: now() });
    await audit('survey.submit', { memberId: s.memberId, surveyId }, undefined, database);
  });
}

export async function answersFor(surveyId: ID, database: PlannerDB = defaultDb): Promise<SurveyAnswer[]> {
  return database.answers.where('surveyId').equals(surveyId).toArray();
}
