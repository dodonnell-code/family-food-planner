// Loads family requests (foods to add, comfort meals) from each person's latest survey,
// and tracks which ones the admin has dealt with.
import { audit, db as defaultDb, type PlannerDB } from './db';
import { isOnRoster, latestSubmittedSurvey } from './repo';
import type { FamilyRequest, RequestKind } from '../domain/requests';

const KINDS: RequestKind[] = ['foodsToAdd', 'comfortMeals'];

export async function loadFamilyRequests(database: PlannerDB = defaultDb): Promise<{ open: FamilyRequest[]; done: FamilyRequest[] }> {
  const hh = await database.households.toCollection().first();
  const doneKeys = new Set(hh?.requestsDone ?? []);
  const today = new Date().toISOString().slice(0, 10);
  const members = (await database.members.toArray()).filter((m) => isOnRoster(m, today)).sort((a, b) => a.displayName.localeCompare(b.displayName));
  const all: FamilyRequest[] = [];
  for (const m of members) {
    const s = await latestSubmittedSurvey(m.id, database);
    for (const kind of KINDS) {
      const text = s?.openResponses?.[kind]?.trim();
      if (!s || !text) continue;
      all.push({ key: `${s.id}:${kind}`, memberId: m.id, memberName: m.preferredName || m.displayName, kind, text, surveyCompletedAt: s.completedAt });
    }
  }
  return { open: all.filter((r) => !doneKeys.has(r.key)), done: all.filter((r) => doneKeys.has(r.key)) };
}

/** Mark a request handled (or open it again). */
export async function setRequestDone(key: string, done: boolean, database: PlannerDB = defaultDb) {
  const hh = await database.households.toCollection().first();
  if (!hh) throw new Error('Household not initialized');
  const keys = new Set(hh.requestsDone ?? []);
  if (done) keys.add(key); else keys.delete(key);
  await database.households.update(hh.id, { requestsDone: [...keys] });
  await audit(done ? 'request.done' : 'request.reopen', { key }, undefined, database);
}
