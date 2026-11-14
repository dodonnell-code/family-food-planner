// Gathers everything the planning engine needs from the database, and saves plan snapshots
// so later plans can be compared ("what to buy more of, add or remove").
import { audit, db as defaultDb, now, uid, type PlannerDB } from './db';
import { decryptString } from './crypto';
import { getCatalogVersion, isOnRoster, latestSubmittedSurvey } from './repo';
import { buildPlan, ENGINE_VERSION, type PlanInput, type PlanMember, type PlanResult } from '../domain/planner';
import type { ID, PlanSnapshot, PlanningScenario, RatingCode, Scenario, Tier } from '../domain/types';

export const TIER_LABEL: Record<Tier, string> = { short: 'Short term', medium: 'Medium term', long: 'Long term' };
export const SCENARIO_LABEL: Record<Scenario, string> = { 'no-cook': 'No cooking', 'limited-cook': 'Limited cooking' };
export const defaultScenario = (tier: Tier): Scenario => (tier === 'short' ? 'no-cook' : 'limited-cook');

export async function loadPlanInput(tier: Tier, scenario: Scenario, dek: CryptoKey | null, database: PlannerDB = defaultDb): Promise<PlanInput & { sourceSurveyIds: ID[] }> {
  const hh = await database.households.toCollection().first();
  if (!hh) throw new Error('Household not initialized');
  const d = hh.planningDefaults;
  const days = tier === 'short' ? d.shortDays : tier === 'medium' ? d.mediumDays : d.longDays;
  const today = now().slice(0, 10);
  const roster = (await database.members.toArray()).filter((m) => isOnRoster(m, today)).sort((a, b) => a.displayName.localeCompare(b.displayName));
  const members: PlanMember[] = [];
  const sourceSurveyIds: ID[] = [];
  for (const m of roster) {
    const [restrictions, needs, survey] = await Promise.all([
      database.restrictions.where('memberId').equals(m.id).filter((r) => r.active).toArray(),
      database.needs.where('memberId').equals(m.id).filter((n) => n.active).toArray(),
      latestSubmittedSurvey(m.id, database),
    ]);
    const ratings: Record<ID, RatingCode> = {};
    if (survey) {
      sourceSurveyIds.push(survey.id);
      for (const a of await database.answers.where('surveyId').equals(survey.id).toArray()) ratings[a.foodItemId] = a.rating;
    }
    const withDetails = await Promise.all(needs.map(async (n) => {
      if (!n.detailsEnc || !dek) return n;
      try { return { ...n, details: JSON.parse(await decryptString(dek, n.detailsEnc)) as Record<string, string> }; } catch { return n; }
    }));
    members.push({
      id: m.id, name: m.preferredName || m.displayName, dailyCalories: m.planningProfile.dailyCalorieGoal,
      restrictions, needs: withDetails, surveyId: survey?.id, surveyCompletedAt: survey?.completedAt, ratings,
      ignoredRefusals: survey?.ignoredRefusals ?? [], prep: survey?.prepTolerance,
    });
  }
  const foods = await database.foods.toArray();
  return { tier, scenario, days, defaults: d, members, foods, sourceSurveyIds };
}

export async function computePlan(tier: Tier, scenario: Scenario, dek: CryptoKey | null, database: PlannerDB = defaultDb) {
  const input = await loadPlanInput(tier, scenario, dek, database);
  return { input, result: buildPlan(input) };
}

export interface SavedPlan { snapshot: PlanSnapshot; scenario: PlanningScenario; result: PlanResult }

export async function savePlanSnapshot(input: PlanInput & { sourceSurveyIds: ID[] }, result: PlanResult, database: PlannerDB = defaultDb): Promise<SavedPlan> {
  const ts = now();
  const scenario: PlanningScenario = {
    id: uid(), activeMemberIds: input.members.map((m) => m.id), horizonDays: input.days, tier: input.tier, scenario: input.scenario,
    waterReserveDays: input.defaults.waterReserveDays, createdAt: ts,
  };
  const snapshot: PlanSnapshot = {
    id: uid(), scenarioId: scenario.id, engineVersion: ENGINE_VERSION, catalogVersion: await getCatalogVersion(database),
    sourceSurveyIds: input.sourceSurveyIds, results: result, warnings: result.warnings, createdAt: ts,
  };
  await database.transaction('rw', database.scenarios, database.snapshots, async () => {
    await database.scenarios.add(scenario);
    await database.snapshots.add(snapshot);
  });
  await audit('plan.save', { snapshotId: snapshot.id }, `${input.tier}/${input.scenario}/${input.days}d`, database);
  return { snapshot, scenario, result };
}

/** Saved plans, newest first, optionally for one tier + scenario. */
export async function savedPlans(filter?: { tier: Tier; scenario: Scenario }, database: PlannerDB = defaultDb): Promise<SavedPlan[]> {
  const [snaps, scenarios] = await Promise.all([database.snapshots.orderBy('createdAt').reverse().toArray(), database.scenarios.toArray()]);
  const byId = new Map(scenarios.map((s) => [s.id, s]));
  return snaps
    .map((snapshot) => ({ snapshot, scenario: byId.get(snapshot.scenarioId)!, result: snapshot.results as PlanResult }))
    .filter((p) => p.scenario && (!filter || (p.scenario.tier === filter.tier && p.scenario.scenario === filter.scenario)));
}

/** The most recent saved plan of any kind (for the home screen and attention list). */
export async function latestSnapshot(database: PlannerDB = defaultDb) {
  return database.snapshots.orderBy('createdAt').last();
}
