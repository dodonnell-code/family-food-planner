// Key strategy (scope §10):
//  - A random 256-bit Data Encryption Key (DEK) encrypts sensitive fields and backups.
//  - The DEK is stored only in wrapped form: once under a key derived from the admin
//    passphrase (PBKDF2-SHA256), once under a random recovery key the admin prints.
//  - Unlocking = successfully unwrapping the DEK. Nothing sensitive is stored in plaintext.
import type { EncryptedBlob } from '../domain/types';

const PBKDF2_ITERATIONS = 600_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

export const toB64 = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};
export const fromB64 = (b64: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));

export interface WrappedKey {
  salt?: string; // for passphrase wrapping
  iterations?: number;
  iv: string;
  ct: string;
}

export interface KeyVault {
  passphrase: WrappedKey;
  recovery: WrappedKey;
  createdAt: string;
}

async function deriveKek(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function importRawAes(raw: Uint8Array<ArrayBuffer>, extractable = false): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, extractable, ['encrypt', 'decrypt']);
}

async function wrap(kek: CryptoKey, dekRaw: Uint8Array<ArrayBuffer>): Promise<{ iv: string; ct: string }> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kek, dekRaw);
  return { iv: toB64(iv), ct: toB64(ct) };
}

async function unwrap(kek: CryptoKey, w: WrappedKey): Promise<CryptoKey> {
  const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(w.iv) }, kek, fromB64(w.ct));
  return importRawAes(new Uint8Array(raw));
}

/** Recovery key format: 8 groups of 4 base32-ish chars (160 bits), easy to print & type. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
export function generateRecoveryKey(): string {
  const bytes = randomBytes(32);
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]);
  return chars.join('').match(/.{4}/g)!.join('-');
}
const normalizeRecovery = (k: string) => k.toUpperCase().replace(/[^A-Z0-9]/g, '');

async function recoveryKek(recoveryKey: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  // Recovery key already has high entropy; still run through PBKDF2 for uniform handling.
  return deriveKek(normalizeRecovery(recoveryKey), salt, 100_000);
}

/** Create a brand-new vault. Returns the vault (to store), the live DEK, and the recovery key (show once). */
export async function createVault(passphrase: string) {
  const dekRaw = randomBytes(32);
  const recoveryKey = generateRecoveryKey();
  const pSalt = randomBytes(16);
  const rSalt = randomBytes(16);
  const vault: KeyVault = {
    passphrase: { salt: toB64(pSalt), iterations: PBKDF2_ITERATIONS, ...(await wrap(await deriveKek(passphrase, pSalt, PBKDF2_ITERATIONS), dekRaw)) },
    recovery: { salt: toB64(rSalt), iterations: 100_000, ...(await wrap(await recoveryKek(recoveryKey, rSalt), dekRaw)) },
    createdAt: new Date().toISOString(),
  };
  return { vault, dek: await importRawAes(dekRaw), recoveryKey };
}

/** Throws if the passphrase is wrong. */
export async function unlockWithPassphrase(vault: KeyVault, passphrase: string): Promise<CryptoKey> {
  const w = vault.passphrase;
  return unwrap(await deriveKek(passphrase, fromB64(w.salt!), w.iterations!), w);
}

export async function unlockWithRecovery(vault: KeyVault, recoveryKey: string): Promise<CryptoKey> {
  const w = vault.recovery;
  return unwrap(await recoveryKek(recoveryKey, fromB64(w.salt!)), w);
}

/** Re-wrap the existing DEK under a new passphrase (needs the DEK raw bytes, obtained via a recovery/passphrase unlock). */
export async function changePassphrase(vault: KeyVault, currentSecret: { passphrase?: string; recoveryKey?: string }, newPassphrase: string): Promise<KeyVault> {
  const w = currentSecret.passphrase !== undefined ? vault.passphrase : vault.recovery;
  const kek = currentSecret.passphrase !== undefined
    ? await deriveKek(currentSecret.passphrase, fromB64(w.salt!), w.iterations!)
    : await recoveryKek(currentSecret.recoveryKey!, fromB64(w.salt!));
  const dekRaw = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(w.iv) }, kek, fromB64(w.ct)));
  const salt = randomBytes(16);
  return {
    ...vault,
    passphrase: { salt: toB64(salt), iterations: PBKDF2_ITERATIONS, ...(await wrap(await deriveKek(newPassphrase, salt, PBKDF2_ITERATIONS), dekRaw)) },
  };
}

// ---------- Field & blob encryption with the DEK ----------
export async function encryptString(dek: CryptoKey, plaintext: string): Promise<EncryptedBlob> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dek, enc.encode(plaintext));
  return { iv: toB64(iv), ct: toB64(ct) };
}

export async function decryptString(dek: CryptoKey, blob: EncryptedBlob): Promise<string> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(blob.iv) }, dek, fromB64(blob.ct));
  return dec.decode(pt);
}

export async function sha256Hex(data: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', enc.encode(data));
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------- Failed-attempt throttling ----------
/** Delay (ms) before the next attempt is allowed, given consecutive failures. */
export function throttleDelayMs(failures: number): number {
  if (failures < 3) return 0;
  return Math.min(5 * 60_000, 1000 * 2 ** (failures - 3) * 5); // 5s,10s,20s… max 5 min
}
