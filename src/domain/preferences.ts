// A person's food preferences that act as exclusions, from both sources:
// admin/approved "Don't like" restrictions and "Would refuse" answers in their latest survey.
import { db as defaultDb, type PlannerDB } from '../data/db';
import { latestSubmittedSurvey } from '../data/repo';
import type { FoodItem, ID, Survey } from './types';

export interface SurveyRefusals {
  survey?: Survey;
  /** Refused foods currently counting against group-meal choices. */
  active: FoodItem[];
  /** Refusals the admin chose to stop applying until the next survey. */
  ignored: FoodItem[];
}

export async function surveyRefusals(memberId: ID, database: PlannerDB = defaultDb): Promise<SurveyRefusals> {
  const survey = await latestSubmittedSurvey(memberId, database);
  if (!survey) return { active: [], ignored: [] };
  const ids = (await database.answers.where('surveyId').equals(survey.id).toArray()).filter((a) => a.rating === 1).map((a) => a.foodItemId);
  const foods = (await database.foods.bulkGet(ids)).filter((f): f is FoodItem => !!f).sort((a, b) => a.name.localeCompare(b.name));
  const ignored = new Set(survey.ignoredRefusals ?? []);
  return { survey, active: foods.filter((f) => !ignored.has(f.id)), ignored: foods.filter((f) => ignored.has(f.id)) };
}
