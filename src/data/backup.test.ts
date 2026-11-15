import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { PlannerDB, uid } from './db';
import { createVault, encryptString } from './crypto';
import { addCondition, addMember, addNeed, addRestriction, ensureInitialized, saveAnswer, startOrResumeSurvey, submitSurvey } from './repo';
import { createBackup, eraseAll, openBackup, readEnvelope, restoreBackup, snapshotData } from './backup';
import { computePlan, savePlanSnapshot } from './planRepo';

let db: PlannerDB;
let dek: CryptoKey;
let recoveryKey: string;

beforeEach(async () => {
  db = new PlannerDB(`test-${uid()}`);
  await ensureInitialized(db);
  const v = await createVault('correct horse');
  dek = v.dek;
  recoveryKey = v.recoveryKey;
  await db.meta.put({ key: 'vault', value: v.vault });
  const alice = await addMember({ displayName: 'Alice' }, db);
  await addRestriction({ memberId: alice.id, type: 'allergy', subject: 'peanut' }, db);
  await addNeed({ memberId: alice.id, domain: 'food', kind: 'rapid-carbs', params: { servingsPerDay: 3 }, confirmed: true }, db);
  await addCondition(alice.id, await encryptString(dek, 'Type 1 diabetes'), db);
  const s = await startOrResumeSurvey(alice.id, db);
  await saveAnswer(s.id, 'canned-chili', 5, {}, db);
  await submitSurvey(s.id, db);
  const p = await computePlan('short', 'no-cook', dek, db);
  await savePlanSnapshot(p.input, p.result, db);
}, 60_000);

describe('backup & restore', () => {
  it('round-trips everything through erase and restore (scope acceptance test 8)', async () => {
    const before = await snapshotData(db);
    const { text } = await createBackup(dek, db);
    expect(text).not.toContain('Alice');
    expect(text).not.toContain('peanut');

    await eraseAll(db);
    expect(await db.members.count()).toBe(0);
    expect(await db.meta.get('vault')).toBeUndefined();

    const env = readEnvelope(text);
    const opened = await openBackup(env, { passphrase: 'correct horse' });
    await restoreBackup(env, opened.data, db);
    const after = await snapshotData(db);
    for (const t of Object.keys(before.tables) as (keyof typeof before.tables)[]) {
      if (t === 'audit') continue; // restore adds its own entries
      expect(after.tables[t]).toEqual(before.tables[t]);
    }
    expect(await db.meta.get('vault')).toEqual({ key: 'vault', value: env.vault });
  }, 60_000);

  it('opens with the recovery key and rejects wrong secrets', async () => {
    const env = readEnvelope((await createBackup(dek, db)).text);
    await expect(openBackup(env, { passphrase: 'wrong' })).rejects.toThrow(/doesn’t open/);
    const r = await openBackup(env, { recoveryKey: recoveryKey.toLowerCase() });
    expect(r.counts.members).toBe(1);
  }, 60_000);

  it('refuses files that aren’t backups or come from a newer app', () => {
    expect(() => readEnvelope('hello')).toThrow(/isn’t a Food Planner backup/);
    expect(() => readEnvelope(JSON.stringify({ format: 'other' }))).toThrow(/isn’t a Food Planner backup/);
    expect(() => readEnvelope(JSON.stringify({ format: 'family-food-planner-backup', backupVersion: 99, dbVersion: 3, vault: { passphrase: {} }, payload: { ct: 'x', iv: 'y' } }))).toThrow(/newer version/);
  });
});
