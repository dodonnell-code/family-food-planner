// Per-device settings. Kept in the local meta table: never synced, never in backups.
import { db as defaultDb, type PlannerDB } from './db';
import { inProgressSurvey, latestSubmittedSurvey, newSurveyQuestions } from './repo';
import type { ID, Member } from '../domain/types';

const OWNER_KEY = 'deviceOwner';

/** Whose personal device this is (they can take their own survey without the Admin passphrase), or undefined if shared. */
export async function getDeviceOwner(database: PlannerDB = defaultDb): Promise<Member | undefined> {
  const id = (await database.meta.get(OWNER_KEY))?.value as ID | undefined;
  if (!id) return undefined;
  const m = await database.members.get(id);
  return m && m.status === 'active' ? m : undefined;
}

export async function setDeviceOwner(memberId: ID | undefined, database: PlannerDB = defaultDb) {
  if (memberId) await database.meta.put({ key: OWNER_KEY, value: memberId });
  else await database.meta.delete(OWNER_KEY);
}

export type OwnSurveyState =
  | { kind: 'continue' }
  | { kind: 'new-questions'; count: number }
  | { kind: 'done' }
  | { kind: 'start' };

/** What the device owner can do with their own survey right now. */
export async function ownSurveyState(memberId: ID, database: PlannerDB = defaultDb): Promise<OwnSurveyState> {
  if (await inProgressSurvey(memberId, database)) return { kind: 'continue' };
  if (!(await latestSubmittedSurvey(memberId, database))) return { kind: 'start' };
  const count = (await newSurveyQuestions(memberId, database)).length;
  return count ? { kind: 'new-questions', count } : { kind: 'done' };
}
