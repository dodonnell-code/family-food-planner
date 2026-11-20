import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { PlannerDB, uid } from './db';
import { changePassphrase, createVault, unlockWithPassphrase, type KeyVault } from './crypto';
import { addMember, ensureInitialized, startOrResumeSurvey, saveAnswer } from './repo';
import { CloudDB, clearLocalForJoin, syncPass, SyncKeyError, type SyncTarget } from './sync';

// Two devices share one "server" (rows + keys); each keeps its own marks.
let server: CloudDB;
let a: PlannerDB, b: PlannerDB;
let ta: SyncTarget, tb: SyncTarget;
let key: CryptoKey;
let vault: KeyVault;

const target = (marks: CloudDB): SyncTarget => ({ rows: server.rows, keys: server.keys, marks: marks.marks });

beforeEach(async () => {
  server = new CloudDB(`server-${uid()}`);
  a = new PlannerDB(`a-${uid()}`);
  b = new PlannerDB(`b-${uid()}`);
  ta = target(new CloudDB(`ma-${uid()}`));
  tb = target(new CloudDB(`mb-${uid()}`));
  await ensureInitialized(a);
  const v = await createVault('correct horse');
  key = v.dek; vault = v.vault;
  await a.meta.put({ key: 'vault', value: vault });
}, 60_000);

/** Device B joins: wipe, unlock the cloud vault, pull everything. */
async function join() {
  await syncPass(a, ta, key);
  await clearLocalForJoin(b);
  const cloudVault = (await server.keys.get('vault'))!.vault!;
  const kb = await unlockWithPassphrase(cloudVault, 'correct horse');
  await syncPass(b, tb, kb);
  await ensureInitialized(b);
  return kb;
}

describe('encrypted sync', () => {
  it('copies everything to a new device, and the server never sees plain data', async () => {
    const m = await addMember({ displayName: 'Alice Example' }, a);
    await join();
    expect((await b.members.get(m.id))?.displayName).toBe('Alice Example');
    expect(await b.foods.count()).toBe(await a.foods.count());
    expect(await b.households.count()).toBe(1);
    expect(JSON.stringify(await b.meta.get('vault'))).toBe(JSON.stringify({ key: 'vault', value: vault }));
    const raw = JSON.stringify(await server.rows.toArray());
    expect(raw).not.toContain('Alice');
    expect(raw).not.toContain('canned');
    expect(raw).not.toContain('members');
    expect(raw).not.toContain(m.id);
  }, 60_000);

  it('a second pass with no changes writes nothing', async () => {
    await syncPass(a, ta, key);
    expect(await syncPass(a, ta, key)).toEqual({ pushed: 0, pulled: 0, removed: 0 });
  }, 60_000);

  it('carries edits and deletes both ways', async () => {
    const m = await addMember({ displayName: 'Alice' }, a);
    const kb = await join();
    // B edits, A deletes something else, both sync.
    await b.members.update(m.id, { displayName: 'Alicia' });
    const s = await startOrResumeSurvey(m.id, b);
    await saveAnswer(s.id, 'canned-chili', 4, {}, b);
    await syncPass(b, tb, kb);
    const food = (await a.foods.toCollection().first())!;
    await a.foods.delete(food.id);
    const r = await syncPass(a, ta, key);
    expect(r.pulled).toBeGreaterThan(0);
    expect((await a.members.get(m.id))?.displayName).toBe('Alicia');
    expect(await a.answers.count()).toBe(1);
    await syncPass(b, tb, kb);
    expect(await b.foods.get(food.id)).toBeUndefined();
    // Converged: nothing left to do on either side.
    expect(await syncPass(a, ta, key)).toEqual({ pushed: 0, pulled: 0, removed: 0 });
    expect(await syncPass(b, tb, kb)).toEqual({ pushed: 0, pulled: 0, removed: 0 });
  }, 60_000);

  it('a passphrase change on one device reaches the other', async () => {
    const kb = await join();
    const v2 = await changePassphrase(vault, { passphrase: 'correct horse' }, 'battery staple');
    await a.meta.put({ key: 'vault', value: v2 });
    await syncPass(a, ta, key);
    await syncPass(b, tb, kb);
    const onB = (await b.meta.get('vault'))!.value as KeyVault;
    await expect(unlockWithPassphrase(onB, 'battery staple')).resolves.toBeDefined();
  }, 60_000);

  it('refuses data encrypted with another household’s key', async () => {
    await syncPass(a, ta, key);
    const other = (await createVault('another one')).dek;
    await expect(syncPass(b, tb, other)).rejects.toBeInstanceOf(SyncKeyError);
  }, 60_000);

  it('splits large rows into chunks and rebuilds them', async () => {
    const m = await addMember({ displayName: 'Big', preferredName: 'x'.repeat(100_000) }, a);
    const kb = await join();
    const row = (await server.rows.toArray()).sort((x, y) => y.ct.length - x.ct.length)[0];
    expect(row!.ct.length).toBeGreaterThan(1);
    expect(row!.ct.every((c) => c.length <= 30_000)).toBe(true);
    expect((await b.members.get(m.id))?.preferredName?.length).toBe(100_000);
    void kb;
  }, 60_000);
});
