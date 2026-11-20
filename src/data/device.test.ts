import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { PlannerDB, uid } from './db';
import { sha256Hex } from './crypto';
import { addMember, ensureInitialized, saveAnswer, startOrResumeSurvey, submitSurvey } from './repo';
import { getDeviceOwner, ownSurveyState, setDeviceOwner } from './device';

describe('personal device', () => {
  it('remembers whose device it is, and walks their own survey through start → continue → done', async () => {
    const db = new PlannerDB(`dev-${uid()}`);
    await ensureInitialized(db);
    const sam = await addMember({ displayName: 'Sam' }, db);
    expect(await getDeviceOwner(db)).toBeUndefined();
    await setDeviceOwner(sam.id, db);
    expect((await getDeviceOwner(db))?.id).toBe(sam.id);

    expect(await ownSurveyState(sam.id, db)).toEqual({ kind: 'start' });
    const s = await startOrResumeSurvey(sam.id, db);
    expect(await ownSurveyState(sam.id, db)).toEqual({ kind: 'continue' });
    await saveAnswer(s.id, 'canned-chili', 5, {}, db);
    await submitSurvey(s.id, db);
    expect((await ownSurveyState(sam.id, db)).kind).toMatch(/done|new-questions/);

    // An archived member's device goes back to shared.
    await db.members.update(sam.id, { status: 'archived' });
    expect(await getDeviceOwner(db)).toBeUndefined();
    await setDeviceOwner(undefined, db);
    expect(await db.meta.get('deviceOwner')).toBeUndefined();
  }, 60_000);

  it('the email fingerprint script matches the app', async () => {
    // From: node scripts/sync-email-hash.mjs "  Someone@Example.com "
    expect(await sha256Hex('ffp-sync:someone@example.com')).toBe('040275a83d27647569ca11ce827c22274da6f62bfad81a0ea2b4c0d1da07b98a');
  });
});
