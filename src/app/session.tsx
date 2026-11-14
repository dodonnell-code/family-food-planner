import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { db } from '../data/db';
import { createVault, throttleDelayMs, unlockWithPassphrase, unlockWithRecovery, changePassphrase, type KeyVault } from '../data/crypto';

/**
 * Admin session. The data key (DEK) lives only in memory while Admin is unlocked;
 * locking (manual, handoff, or inactivity) drops it.
 */
interface Session {
  ready: boolean;
  hasVault: boolean;
  dek: CryptoKey | null;
  isAdmin: boolean;
  setup(passphrase: string): Promise<string>; // returns recovery key
  unlock(passphrase: string): Promise<{ ok: true } | { ok: false; waitMs: number }>;
  recover(recoveryKey: string, newPassphrase: string): Promise<boolean>;
  lock(): void;
}

const Ctx = createContext<Session | null>(null);

interface AuthState {
  failures: number;
  lastFailAt: number;
}

async function getVault(): Promise<KeyVault | undefined> {
  return (await db.meta.get('vault'))?.value as KeyVault | undefined;
}
async function getAuthState(): Promise<AuthState> {
  return ((await db.meta.get('authState'))?.value as AuthState) ?? { failures: 0, lastFailAt: 0 };
}

export function SessionProvider({ children, autoLockMinutes = 5 }: { children: ReactNode; autoLockMinutes?: number }) {
  const [ready, setReady] = useState(false);
  const [hasVault, setHasVault] = useState(false);
  const [dek, setDek] = useState<CryptoKey | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    getVault().then((v) => {
      setHasVault(!!v);
      setReady(true);
    });
  }, []);

  const lock = useCallback(() => setDek(null), []);

  // Inactivity auto-lock while admin is unlocked.
  useEffect(() => {
    if (!dek) return;
    const reset = () => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(lock, autoLockMinutes * 60_000);
    };
    const events = ['pointerdown', 'keydown', 'scroll'] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    const onHide = () => document.visibilityState === 'hidden' && lock();
    document.addEventListener('visibilitychange', onHide);
    reset();
    return () => {
      window.clearTimeout(timer.current);
      events.forEach((e) => window.removeEventListener(e, reset));
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [dek, autoLockMinutes, lock]);

  const setup = useCallback(async (passphrase: string) => {
    if (await getVault()) throw new Error('Admin passphrase already set');
    const { vault, dek, recoveryKey } = await createVault(passphrase);
    await db.meta.put({ key: 'vault', value: vault });
    setHasVault(true);
    setDek(dek);
    return recoveryKey;
  }, []);

  const unlock = useCallback(async (passphrase: string) => {
    const vault = await getVault();
    if (!vault) return { ok: false as const, waitMs: 0 };
    const st = await getAuthState();
    const wait = st.lastFailAt + throttleDelayMs(st.failures) - Date.now();
    if (wait > 0) return { ok: false as const, waitMs: wait };
    try {
      setDek(await unlockWithPassphrase(vault, passphrase));
      await db.meta.put({ key: 'authState', value: { failures: 0, lastFailAt: 0 } });
      return { ok: true as const };
    } catch {
      const next = { failures: st.failures + 1, lastFailAt: Date.now() };
      await db.meta.put({ key: 'authState', value: next });
      return { ok: false as const, waitMs: throttleDelayMs(next.failures) };
    }
  }, []);

  const recover = useCallback(async (recoveryKey: string, newPassphrase: string) => {
    const vault = await getVault();
    if (!vault) return false;
    try {
      const key = await unlockWithRecovery(vault, recoveryKey);
      const v2 = await changePassphrase(vault, { recoveryKey }, newPassphrase);
      await db.meta.put({ key: 'vault', value: v2 });
      await db.meta.put({ key: 'authState', value: { failures: 0, lastFailAt: 0 } });
      setDek(key);
      return true;
    } catch {
      return false;
    }
  }, []);

  return (
    <Ctx.Provider value={{ ready, hasVault, dek, isAdmin: !!dek, setup, unlock, recover, lock }}>{children}</Ctx.Provider>
  );
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession outside SessionProvider');
  return s;
}
