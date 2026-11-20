// Encrypted sync between devices — the part that doesn't depend on Dexie Cloud, so it can be tested.
//
// The local database (PlannerDB) is unchanged and stays the app's source of truth on each device.
// A second, synced database holds only:
//   rows  — one per local row: { id, iv, ct[] }. `ct` is the table name and the row's JSON,
//           encrypted with the household data key (AES-GCM), split into chunks so no single string
//           is large. `id` is a keyed hash of table + row id, so not even which table a row belongs to
//           or which catalog foods exist is visible. The sync service never sees family data.
//   keys  — { id: 'vault', vault }: the data key wrapped by the Admin passphrase and the recovery key
//           (exactly what's in a backup file), so a new device can unlock the family's data.
//           { id: 'idkey', enc }: the random secret behind the row-id hash, encrypted with the data key.
// plus one table that never leaves the device:
//   marks — what this device last agreed with the cloud for each row (its JSON and the cloud
//           version's IV). Comparing local ⇄ mark ⇄ cloud tells which side changed (a three-way merge).
//
// Conflicts between devices are settled by the sync service (last write wins per row). If this device
// and the cloud both changed the same row since the last pass, the cloud version wins.
import Dexie, { type Table } from 'dexie';
import { BACKUP_TABLES } from './backup';
import { decryptString, encryptString, fromB64, sha256Hex, toB64, type KeyVault } from './crypto';
import type { EncryptedBlob } from '../domain/types';
import type { PlannerDB } from './db';

export const SYNCED_TABLES = BACKUP_TABLES;
const CHUNK = 30_000; // characters; keeps each string well under the service's 32 KB inline limit
const VAULT_MARK = 'meta:vault';

export interface CloudRow { id: string; iv: string; ct: string[] }
export interface CloudKeyRow { id: string; vault?: KeyVault; enc?: EncryptedBlob }
/** `ref` is '<table>:<rowId>' — kept only on this device. */
export interface SyncMark { id: string; ref?: string; json: string; iv: string }

/** The synced database. Dexie Cloud is added as an addon in the browser; tests use it without one. */
export class CloudDB extends Dexie {
  rows!: Table<CloudRow, string>;
  keys!: Table<CloudKeyRow, string>;
  marks!: Table<SyncMark, string>;
  constructor(name: string, options?: ConstructorParameters<typeof Dexie>[1]) {
    super(name, options);
    this.version(1).stores({ rows: 'id', keys: 'id', marks: 'id' });
  }
}

/** Where a device's sync data lives. In the app all three are in one CloudDB; tests share rows/keys between devices. */
export interface SyncTarget {
  rows: Table<CloudRow, string>;
  keys: Table<CloudKeyRow, string>;
  marks: Table<SyncMark, string>;
}

export interface PassResult { pushed: number; pulled: number; removed: number }

async function encryptRow(key: CryptoKey, json: string): Promise<{ iv: string; ct: string[] }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = toB64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(json)));
  const chunks: string[] = [];
  for (let i = 0; i < ct.length; i += CHUNK) chunks.push(ct.slice(i, i + CHUNK));
  return { iv: toB64(iv), ct: chunks };
}

async function decryptRow(key: CryptoKey, row: CloudRow): Promise<string> {
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(row.iv) }, key, fromB64(row.ct.join('')));
    return new TextDecoder().decode(pt);
  } catch {
    throw new SyncKeyError();
  }
}

/** The cloud holds data this device's key can't open (another household, or a stale link). */
export class SyncKeyError extends Error {
  constructor() { super('This device can’t read the synced family data. Stop syncing on this device and link it again.'); }
}

const splitRef = (ref: string) => { const i = ref.indexOf(':'); return [ref.slice(0, i), ref.slice(i + 1)] as const; };

/** The secret behind row-id hashes: created by the first device, shared (encrypted) through the cloud. */
async function idSecret(target: SyncTarget, key: CryptoKey): Promise<string> {
  const row = await target.keys.get('idkey');
  if (row?.enc) {
    try { return await decryptString(key, row.enc); } catch { throw new SyncKeyError(); }
  }
  const secret = toB64(crypto.getRandomValues(new Uint8Array(32)));
  await target.keys.put({ id: 'idkey', enc: await encryptString(key, secret) });
  return secret;
}

const hashCache = new Map<string, string>();
async function cloudId(secret: string, ref: string): Promise<string> {
  const k = `${secret}|${ref}`;
  let h = hashCache.get(k);
  if (!h) { h = (await sha256Hex(k)).slice(0, 32); hashCache.set(k, h); }
  return h;
}

/**
 * One sync pass: send local changes up, bring remote changes down. Safe to run any time and repeatedly;
 * a pass with nothing to do writes nothing.
 */
export async function syncPass(local: PlannerDB, target: SyncTarget, key: CryptoKey): Promise<PassResult> {
  // Snapshot local data in one read transaction (so an erase or restore can't be seen half-done).
  const snapshot = await local.transaction('r', [...SYNCED_TABLES.map((t) => local.table(t)), local.meta], async () => {
    const rows = new Map<string, string>();
    for (const t of SYNCED_TABLES) for (const r of await local.table(t).toArray()) rows.set(`${t}:${(r as { id: string }).id}`, JSON.stringify(r));
    const vault = (await local.meta.get('vault'))?.value;
    return { rows, vault: vault ? JSON.stringify(vault) : undefined };
  });
  const secret = await idSecret(target, key);
  const [cloudRows, cloudVault, marks] = await Promise.all([target.rows.toArray(), target.keys.get('vault'), target.marks.toArray()]);
  const cloud = new Map(cloudRows.map((r) => [r.id, r]));
  const mark = new Map(marks.map((m) => [m.id, m]));
  const localById = new Map<string, { ref: string; json: string }>();
  for (const [ref, json] of snapshot.rows) localById.set(await cloudId(secret, ref), { ref, json });

  const localPuts = new Map<string, unknown[]>();
  const localDeletes = new Map<string, string[]>();
  const cloudPuts: CloudRow[] = [];
  const cloudDeletes: string[] = [];
  const markPuts: SyncMark[] = [];
  const markDeletes: string[] = [];
  const add = <T,>(m: Map<string, T[]>, k: string, v: T) => { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); };
  const res: PassResult = { pushed: 0, pulled: 0, removed: 0 };

  const ids = new Set([...localById.keys(), ...cloud.keys(), ...[...mark.keys()].filter((k) => k !== VAULT_MARK)]);
  for (const id of ids) {
    const lr = localById.get(id);
    const l = lr?.json;
    const c = cloud.get(id);
    const m = mark.get(id);
    const remoteChanged = c?.iv !== m?.iv;
    const localChanged = l !== m?.json;
    if (remoteChanged) {
      if (c) {
        const payload = await decryptRow(key, c);
        const nl = payload.indexOf('\n');
        const ref = payload.slice(0, nl);
        const json = payload.slice(nl + 1);
        const [table] = splitRef(ref);
        if (!(SYNCED_TABLES as readonly string[]).includes(table)) continue; // from a newer app version
        if (json !== l) { add(localPuts, table, JSON.parse(json)); res.pulled++; }
        markPuts.push({ id, ref, json, iv: c.iv });
      } else {
        const ref = m?.ref ?? lr?.ref;
        if (l !== undefined && ref) { const [table, rowId] = splitRef(ref); add(localDeletes, table, rowId); res.removed++; }
        markDeletes.push(id);
      }
    } else if (localChanged) {
      if (lr) {
        const enc = await encryptRow(key, `${lr.ref}\n${lr.json}`);
        cloudPuts.push({ id, ...enc });
        markPuts.push({ id, ref: lr.ref, json: lr.json, iv: enc.iv });
      } else {
        cloudDeletes.push(id);
        markDeletes.push(id);
      }
      res.pushed++;
    }
  }

  // The wrapped key: plain (it's already encrypted), same three-way rule.
  const cv = cloudVault ? JSON.stringify(cloudVault.vault) : undefined;
  const mv = mark.get(VAULT_MARK)?.json;
  let vaultToLocal: KeyVault | undefined;
  if (cv !== mv && cv) { if (cv !== snapshot.vault) vaultToLocal = cloudVault!.vault!; markPuts.push({ id: VAULT_MARK, json: cv, iv: '' }); }
  else if (snapshot.vault !== mv && snapshot.vault) {
    await target.keys.put({ id: 'vault', vault: JSON.parse(snapshot.vault) as KeyVault });
    markPuts.push({ id: VAULT_MARK, json: snapshot.vault, iv: '' });
  }

  if (localPuts.size || localDeletes.size || vaultToLocal) {
    await local.transaction('rw', [...SYNCED_TABLES.map((t) => local.table(t)), local.meta], async () => {
      for (const [t, rows] of localPuts) await local.table(t).bulkPut(rows);
      for (const [t, keys] of localDeletes) await local.table(t).bulkDelete(keys);
      if (vaultToLocal) await local.meta.put({ key: 'vault', value: vaultToLocal });
    });
  }
  if (cloudPuts.length) await target.rows.bulkPut(cloudPuts);
  if (cloudDeletes.length) await target.rows.bulkDelete(cloudDeletes);
  if (markPuts.length) await target.marks.bulkPut(markPuts);
  if (markDeletes.length) await target.marks.bulkDelete(markDeletes);
  return res;
}

/** Remove everything this device has on hand from the local database (before taking the family's data). */
export async function clearLocalForJoin(local: PlannerDB) {
  const tables = [...SYNCED_TABLES.map((t) => local.table(t)), local.meta];
  await local.transaction('rw', tables, async () => { for (const t of tables) await t.clear(); });
}
