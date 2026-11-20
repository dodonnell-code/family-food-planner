// Sync runtime in the browser: Dexie Cloud sign-in, linking a device, and running sync passes in the
// background. The merge itself is in sync.ts.
//
// A device is "linked" when its local meta table holds `syncKey`: the household data key, stored
// non-extractable (usable, never readable) like "Stay unlocked". Sync runs with it whether or not
// Admin is unlocked, so surveys taken while Admin is locked still reach the other devices.
// Restoring a backup or erasing the device clears meta, which unlinks it.
import Dexie from 'dexie';
import dexieCloud from 'dexie-cloud-addon';
import { db, type PlannerDB } from './db';
import { sha256Hex, unlockWithPassphrase, unlockWithRecovery, type KeyVault } from './crypto';
import { ensureInitialized } from './repo';
import { CloudDB, clearLocalForJoin, syncPass, SyncKeyError } from './sync';

/** Set at build time (see README › Sync). Without it the app works exactly as before, on one device. */
export const CLOUD_URL = (import.meta.env.VITE_DEXIE_CLOUD_URL as string | undefined)?.trim() || undefined;
export const syncAvailable = !!CLOUD_URL;

/**
 * Which emails may turn on sync in this copy of the app, as fingerprints (so the household's address
 * isn't readable in the published code). Set at build time as VITE_SYNC_EMAIL_HASHES, comma-separated;
 * make one with `node scripts/sync-email-hash.mjs you@example.com`. Empty: any email (not recommended
 * for a public site, since strangers would use up the sync account's storage).
 */
const ALLOWED = ((import.meta.env.VITE_SYNC_EMAIL_HASHES as string | undefined) ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
export const emailHash = async (email: string) => sha256Hex(`ffp-sync:${email.trim().toLowerCase()}`);
export async function emailAllowed(email: string): Promise<boolean> {
  return !ALLOWED.length || ALLOWED.includes(await emailHash(email));
}

const SYNC_KEY = 'syncKey';

let cloudDb: CloudDB | undefined;
function cloud(): CloudDB {
  if (!CLOUD_URL) throw new Error('Sync isn’t set up in this copy of the app.');
  if (!cloudDb) {
    cloudDb = new CloudDB('family-food-planner-sync', { addons: [dexieCloud] });
    cloudDb.cloud.configure({
      databaseUrl: CLOUD_URL,
      requireAuth: false,
      unsyncedTables: ['marks'],
      socialAuth: false, // email code only
    });
  }
  return cloudDb;
}

// ---------- Status (for the UI) ----------
export type SyncPhase = 'off' | 'syncing' | 'synced' | 'offline' | 'error';
export interface SyncStatus {
  available: boolean;
  linked: boolean;
  email?: string;
  phase: SyncPhase;
  error?: string;
  lastSyncedAt?: number;
}
let status: SyncStatus = { available: syncAvailable, linked: false, phase: 'off' };
const listeners = new Set<() => void>();
function setStatus(p: Partial<SyncStatus>) { status = { ...status, ...p }; listeners.forEach((l) => l()); }
export const syncStatus = {
  get: () => status,
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
};

// ---------- Engine ----------
let engine: { stop(): void; kick(): void } | undefined;

async function linkedKey(local: PlannerDB = db): Promise<CryptoKey | undefined> {
  return (await local.meta.get(SYNC_KEY))?.value as CryptoKey | undefined;
}

function startEngine() {
  if (engine) { engine.kick(); return; }
  const c = cloud();
  let running: Promise<void> = Promise.resolve();
  let queued = false;
  let timer: number | undefined;
  let stopped = false;

  const pass = async () => {
    const key = await linkedKey();
    if (!key) { stop(); setStatus({ linked: false, phase: 'off' }); return; } // erased or restored
    try {
      await syncPass(db, c, key);
      const st = c.cloud.syncState.value;
      if (st.phase === 'in-sync' || st.phase === 'initial') setStatus({ phase: 'synced', error: undefined, lastSyncedAt: Date.now() });
    } catch (e) {
      setStatus({ phase: 'error', error: e instanceof SyncKeyError ? e.message : `Sync problem: ${e instanceof Error ? e.message : String(e)}` });
    }
  };
  const kick = () => {
    if (stopped) return;
    if (queued) return;
    queued = true;
    running = running.then(() => { queued = false; return pass(); });
  };
  const soon = () => { window.clearTimeout(timer); timer = window.setTimeout(kick, 700); };

  // Local edits (any table of the planner database, from any tab) → push soon.
  const onMutated = (parts: Record<string, unknown>) => {
    if (Object.keys(parts).some((k) => k.startsWith(`idb://${db.name}/`))) soon();
  };
  Dexie.on('storagemutated', onMutated);
  // Changes arriving from the service → pull.
  const s1 = c.cloud.events.syncComplete.subscribe(() => kick());
  const s2 = c.cloud.syncState.subscribe((st) => {
    if (st.phase === 'offline' || st.status === 'offline') setStatus({ phase: 'offline' });
    else if (st.phase === 'error') setStatus({ phase: 'error', error: st.license && st.license !== 'ok' ? 'The sync account’s license has expired. See README › Sync.' : `Sync problem: ${st.error?.message ?? 'unknown error'}` });
    else if (st.phase === 'pushing' || st.phase === 'pulling') setStatus({ phase: 'syncing' });
  });
  const s3 = c.cloud.currentUser.subscribe((u) => setStatus({ email: u.isLoggedIn ? u.email : undefined }));

  function stop() {
    stopped = true;
    window.clearTimeout(timer);
    Dexie.on('storagemutated').unsubscribe(onMutated);
    s1.unsubscribe(); s2.unsubscribe(); s3.unsubscribe();
    engine = undefined;
  }
  engine = { stop, kick };
  setStatus({ linked: true, phase: 'syncing' });
  kick();
}

/** Call once at startup: resumes syncing if this device is linked. */
export async function initSync() {
  if (!syncAvailable) return;
  if (await linkedKey()) startEngine();
}

export function syncNow() {
  if (!engine) return;
  setStatus({ phase: 'syncing' });
  cloud().cloud.sync({ wait: true, purpose: 'pull' }).catch(() => {}).finally(() => engine?.kick());
}

// ---------- Linking ----------
/**
 * Sign in to the sync account (Dexie Cloud shows its own "enter the code we emailed you" box),
 * then download what's there. Returns the family's wrapped key if another device already set it up.
 */
export async function signIn(email: string): Promise<{ vault?: KeyVault }> {
  if (!(await emailAllowed(email))) throw new Error('Sync in this copy of the app is only for its own household’s email. Check the address, or use the app without sync.');
  const c = cloud();
  const user = c.cloud.currentUser.value;
  if (!user.isLoggedIn || user.email?.toLowerCase() !== email.trim().toLowerCase()) {
    if (user.isLoggedIn) await c.cloud.logout({ force: true });
    await c.cloud.login({ email: email.trim(), grant_type: 'otp' });
  }
  await c.cloud.sync({ wait: true, purpose: 'pull' });
  return { vault: (await c.keys.get('vault'))?.vault };
}

export const currentEmail = () => (syncAvailable ? cloud().cloud.currentUser.value : undefined)?.email;

/** First device: upload this device's data (needs Admin unlocked for the key). */
export async function startFamilySync(dek: CryptoKey) {
  const c = cloud();
  if ((await c.keys.get('vault'))?.vault) throw new Error('This sync account already has family data. Link this device to it instead.');
  await c.marks.clear();
  await db.meta.put({ key: SYNC_KEY, value: dek });
  startEngine();
}

/** Open the family's data with the passphrase or recovery key, without changing anything yet. */
export async function unlockFamily(vault: KeyVault, secret: { passphrase?: string; recoveryKey?: string }): Promise<CryptoKey> {
  try {
    return secret.recoveryKey ? await unlockWithRecovery(vault, secret.recoveryKey) : await unlockWithPassphrase(vault, secret.passphrase ?? '');
  } catch {
    throw new Error(secret.recoveryKey ? 'That recovery key doesn’t open the family’s data.' : 'That passphrase doesn’t open the family’s data. Use the Admin passphrase from your other device, or the recovery key.');
  }
}

/** Join: replace everything on this device with the family's synced data. */
export async function joinFamily(dek: CryptoKey) {
  const c = cloud();
  engine?.stop();
  await c.marks.clear();
  await clearLocalForJoin(db);
  await syncPass(db, c, dek); // pulls every row and the vault
  await ensureInitialized(db); // brings the catalog up to this app version
  await db.meta.put({ key: SYNC_KEY, value: dek });
  startEngine();
}

/** Stop syncing on this device. Its data stays here; the other devices keep theirs. */
export async function unlinkDevice() {
  engine?.stop();
  await db.meta.delete(SYNC_KEY);
  if (cloudDb) {
    await cloudDb.marks.clear();
    await cloudDb.cloud.logout({ force: true }).catch(() => {});
  }
  setStatus({ linked: false, phase: 'off', email: undefined, error: undefined });
}
