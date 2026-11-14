// Encrypted backup & restore — scope §10.
//
// File format (JSON, extension .ffpbackup):
//   { format, backupVersion, dbVersion, createdAt, vault, payload }
// - `payload` is every table, JSON-encoded and encrypted (AES-GCM) with the household data key.
// - `vault` is the same wrapped data key stored on the iPad (wrapped by the admin passphrase
//   and by the recovery key), so a backup can be opened on a fresh device with either secret.
//   Nothing in the file is readable without one of them.
// - `dbVersion` lets future app versions migrate older backups (see migrateBackupData).
import { db as defaultDb, now, type PlannerDB } from './db';
import { decryptString, encryptString, unlockWithPassphrase, unlockWithRecovery, type KeyVault } from './crypto';
import { ensureInitialized } from './repo';
import type { EncryptedBlob } from '../domain/types';

export const BACKUP_FORMAT = 'family-food-planner-backup';
export const BACKUP_VERSION = 1;
export const BACKUP_EXTENSION = '.ffpbackup';

/** Tables included in a backup (meta is handled separately: the vault travels in the envelope). */
export const BACKUP_TABLES = [
  'households', 'members', 'restrictions', 'needs', 'conditions', 'customFields', 'customValues',
  'foods', 'surveys', 'answers', 'scenarios', 'snapshots', 'changes', 'audit',
] as const;
type TableName = (typeof BACKUP_TABLES)[number];
/** Meta keys worth keeping (never the auth throttle state). */
const META_KEYS = ['catalogVersion'];

export interface BackupEnvelope {
  format: typeof BACKUP_FORMAT;
  backupVersion: number;
  dbVersion: number;
  createdAt: string;
  vault: KeyVault;
  payload: EncryptedBlob;
}

export interface BackupData {
  tables: Record<TableName, unknown[]>;
  meta: { key: string; value: unknown }[];
}

export type BackupCounts = Record<TableName, number>;

const countsOf = (d: BackupData) => Object.fromEntries(BACKUP_TABLES.map((t) => [t, d.tables[t]?.length ?? 0])) as BackupCounts;

export async function snapshotData(database: PlannerDB = defaultDb): Promise<BackupData> {
  const tables = {} as Record<TableName, unknown[]>;
  for (const t of BACKUP_TABLES) tables[t] = await database.table(t).toArray();
  const meta = (await database.meta.bulkGet(META_KEYS)).filter((m): m is { key: string; value: unknown } => !!m);
  return { tables, meta };
}

/**
 * Build an encrypted backup. Decrypts it again before returning, so a backup that couldn't be
 * restored is never handed to the user.
 */
export async function createBackup(dek: CryptoKey, database: PlannerDB = defaultDb) {
  const vault = (await database.meta.get('vault'))?.value as KeyVault | undefined;
  if (!vault) throw new Error('Admin is not set up on this iPad');
  const data = await snapshotData(database);
  const createdAt = now();
  const envelope: BackupEnvelope = {
    format: BACKUP_FORMAT, backupVersion: BACKUP_VERSION, dbVersion: database.verno, createdAt, vault,
    payload: await encryptString(dek, JSON.stringify(data)),
  };
  // Self-check.
  const check = JSON.parse(await decryptString(dek, envelope.payload)) as BackupData;
  const counts = countsOf(data);
  if (JSON.stringify(countsOf(check)) !== JSON.stringify(counts)) throw new Error('Backup self-check failed. Nothing was saved; please try again.');
  const text = JSON.stringify(envelope);
  const filename = `food-planner-backup-${createdAt.slice(0, 10)}${BACKUP_EXTENSION}`;
  return { text, filename, counts, createdAt };
}

/** Record that a backup was saved (drives the reminder on Home/Review). */
export async function markBackedUp(at: string, database: PlannerDB = defaultDb) {
  const hh = await database.households.toCollection().first();
  if (hh) await database.households.update(hh.id, { settings: { ...hh.settings, lastBackupAt: at } });
  await database.audit.add({ id: crypto.randomUUID(), action: 'backup.create', timestamp: now(), refs: {} });
}

/** Parse and sanity-check a backup file without decrypting it. Throws a readable error. */
export function readEnvelope(text: string): BackupEnvelope {
  let e: Partial<BackupEnvelope>;
  try { e = JSON.parse(text); } catch { throw new Error('This file isn’t a Food Planner backup (it couldn’t be read).'); }
  if (e?.format !== BACKUP_FORMAT || !e.payload?.ct || !e.vault?.passphrase) throw new Error('This file isn’t a Food Planner backup.');
  if ((e.backupVersion ?? 0) > BACKUP_VERSION || (e.dbVersion ?? 0) > defaultDb.verno) throw new Error('This backup was made by a newer version of the app. Update the app, then try again.');
  return e as BackupEnvelope;
}

/** Unlock a backup with the passphrase or recovery key that was current when it was made. */
export async function openBackup(envelope: BackupEnvelope, secret: { passphrase?: string; recoveryKey?: string }) {
  let dek: CryptoKey;
  try {
    dek = secret.recoveryKey ? await unlockWithRecovery(envelope.vault, secret.recoveryKey) : await unlockWithPassphrase(envelope.vault, secret.passphrase ?? '');
  } catch {
    throw new Error(secret.recoveryKey ? 'That recovery key doesn’t open this backup.' : 'That passphrase doesn’t open this backup. Use the Admin passphrase from when the backup was made, or the recovery key.');
  }
  const data = migrateBackupData(JSON.parse(await decryptString(dek, envelope.payload)) as BackupData, envelope.dbVersion);
  return { dek, data, counts: countsOf(data) };
}

/** Upgrade data from older database versions. Backups start at db v3; add steps here as the schema grows. */
export function migrateBackupData(data: BackupData, fromDbVersion: number): BackupData {
  if (fromDbVersion < 3) throw new Error('This backup is from an unsupported early version.');
  for (const t of BACKUP_TABLES) data.tables[t] ??= [];
  return data;
}

/** Replace everything on this device with the backup. All-or-nothing. */
export async function restoreBackup(envelope: BackupEnvelope, data: BackupData, database: PlannerDB = defaultDb) {
  const tables = [...BACKUP_TABLES.map((t) => database.table(t)), database.meta];
  await database.transaction('rw', tables, async () => {
    for (const t of tables) await t.clear();
    for (const t of BACKUP_TABLES) if (data.tables[t].length) await database.table(t).bulkAdd(data.tables[t]);
    for (const m of data.meta) await database.meta.put(m);
    await database.meta.put({ key: 'vault', value: envelope.vault });
    await database.meta.put({ key: 'authState', value: { failures: 0, lastFailAt: 0 } });
  });
  // Bring an older catalog/settings up to date (never overwrites admin edits).
  await ensureInitialized(database);
  await database.audit.add({ id: crypto.randomUUID(), action: 'backup.restore', timestamp: now(), refs: {}, detail: envelope.createdAt });
}

/** Erase everything on this device (used before handing over / for a restore test). */
export async function eraseAll(database: PlannerDB = defaultDb) {
  const tables = [...BACKUP_TABLES.map((t) => database.table(t)), database.meta];
  await database.transaction('rw', tables, async () => { for (const t of tables) await t.clear(); });
  await ensureInitialized(database);
}

export const TABLE_LABELS: Record<TableName, string> = {
  households: 'Household', members: 'Members', restrictions: 'Restrictions & dislikes', needs: 'Food needs', conditions: 'Health conditions',
  customFields: 'Custom fields', customValues: 'Custom field values', foods: 'Catalog foods', surveys: 'Surveys', answers: 'Survey answers',
  scenarios: 'Plan settings', snapshots: 'Saved plans', changes: 'Change history', audit: 'Activity log',
};
