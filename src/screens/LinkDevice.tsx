import { useState, useSyncExternalStore } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSession } from '../app/session';
import { fmtDate } from '../app/ui';
import { joinFamily, signIn, startFamilySync, syncAvailable, syncNow, syncStatus, unlinkDevice, unlockFamily } from '../data/cloud';
import type { KeyVault } from '../data/crypto';

export function useSyncStatus() {
  return useSyncExternalStore(syncStatus.subscribe, syncStatus.get);
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Sign in, then either start the family's sync from this device (needs `dek`: Admin unlocked) or
 * replace this device's data with the family's. `replacing`: this device already has its own data.
 */
export function LinkFlow({ dek, replacing, onDone }: { dek?: CryptoKey; replacing: boolean; onDone: () => void }) {
  const { adopt } = useSession();
  const [email, setEmail] = useState('');
  const [vault, setVault] = useState<KeyVault | null>(null); // null: not signed in yet
  const [emptyAccount, setEmptyAccount] = useState(false);
  const [useRecovery, setUseRecovery] = useState(false);
  const [secret, setSecret] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  async function doSignIn(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setBusy('Signing in… check your email for a code.');
    try {
      const r = await signIn(email);
      if (r.vault) setVault(r.vault);
      else if (dek) { setBusy('Uploading this device’s data (encrypted)…'); await startFamilySync(dek); onDone(); }
      else setEmptyAccount(true);
    } catch (e) { setErr(errText(e)); }
    finally { setBusy(''); }
  }

  async function doJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!vault) return;
    setErr(''); setBusy('Unlocking…');
    try {
      const key = await unlockFamily(vault, useRecovery ? { recoveryKey: secret } : { passphrase: secret });
      setBusy('Downloading the family’s data…');
      await joinFamily(key);
      adopt(key);
      onDone();
    } catch (e) { setErr(errText(e)); }
    finally { setBusy(''); }
  }

  if (!syncAvailable) return <div className="notice">Sync isn’t set up in this copy of the app.</div>;

  return (
    <div className="stack">
      {vault === null && !emptyAccount && (
        <form className="stack" onSubmit={doSignIn}>
          <label>Family sync email
            <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="the same email on every device" required />
            <span className="small muted" style={{ fontWeight: 400 }}>Use one email for the whole household. You’ll get a one-time code to type in.</span>
          </label>
          <div><button className="primary" disabled={!!busy || !email.includes('@')}>Sign in</button></div>
        </form>
      )}
      {emptyAccount && (
        <div className="notice">This account has no family data yet. Set up the device that has your data first (Admin › Backup › Sync), then link this one.</div>
      )}
      {vault && (
        <form className="stack" onSubmit={doJoin}>
          <div className="notice ok">Found your family’s data. Enter the Admin passphrase used on your other devices, or the recovery key, to open it.</div>
          {useRecovery
            ? <label>Recovery key<input value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" placeholder="XXXX-XXXX-…" /></label>
            : <label>Admin passphrase<input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="current-password" /></label>}
          <button type="button" className="ghost" style={{ alignSelf: 'flex-start' }} onClick={() => { setUseRecovery(!useRecovery); setSecret(''); setErr(''); }}>{useRecovery ? 'Use passphrase instead' : 'Use recovery key instead'}</button>
          {replacing && (
            <>
              <div className="notice danger">Linking <strong>replaces everything on this device</strong> with the family’s synced data. Anything that only exists here is lost; make a backup first if you need it.</div>
              <label style={{ maxWidth: 320 }}>Type REPLACE to confirm<input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" /></label>
            </>
          )}
          <div><button className={replacing ? 'danger' : 'primary'} disabled={!!busy || !secret || (replacing && confirmText.trim().toUpperCase() !== 'REPLACE')}>Link this device</button></div>
        </form>
      )}
      {busy && <p className="small muted" role="status" style={{ margin: 0 }}>{busy}</p>}
      {err && <div className="notice danger" role="alert">{err}</div>}
    </div>
  );
}

const PHASE: Record<string, { label: string; cls: string }> = {
  off: { label: 'Off', cls: '' },
  syncing: { label: 'Syncing…', cls: '' },
  synced: { label: 'Up to date', cls: 'ok' },
  offline: { label: 'Offline: will sync when back online', cls: 'warn' },
  error: { label: 'Problem', cls: 'danger' },
};

/** Admin › Backup: sync status and controls. */
export function SyncCard() {
  const { dek, hasVault } = useSession();
  const st = useSyncStatus();
  const [confirmStop, setConfirmStop] = useState(false);
  const [done, setDone] = useState('');
  if (!st.available) return null;
  const p = PHASE[st.phase];
  return (
    <section className="card stack">
      <div className="spread">
        <h2 style={{ margin: 0 }}>Sync across devices</h2>
        <span className={`badge ${p.cls}`}>{st.linked ? p.label : 'Not linked'}</span>
      </div>
      {st.linked ? (
        <>
          <ul className="small" style={{ margin: 0, paddingLeft: 20 }}>
            {st.email && <li>Signed in as {st.email}.</li>}
            {st.lastSyncedAt && <li>Last synced {fmtDate(new Date(st.lastSyncedAt).toISOString())} {new Date(st.lastSyncedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.</li>}
            <li>Everything is encrypted on this device before it’s sent. The sync service can’t read it.</li>
          </ul>
          {st.error && <div className="notice danger" role="alert">{st.error}</div>}
          {done && <div className="notice ok" role="status">{done}</div>}
          <div className="row">
            <button onClick={syncNow}>Sync now</button>
            {!confirmStop
              ? <button className="ghost" onClick={() => setConfirmStop(true)}>Stop syncing on this device</button>
              : <><button className="danger" onClick={async () => { await unlinkDevice(); setConfirmStop(false); }}>Yes, stop syncing here</button><button className="ghost" onClick={() => setConfirmStop(false)}>Cancel</button></>}
          </div>
          {confirmStop && <p className="small muted" style={{ margin: 0 }}>This device keeps its data but stops sending and receiving changes. Other devices aren’t affected.</p>}
        </>
      ) : (
        <>
          <p className="small muted" style={{ margin: 0 }}>Keep this household’s plan, inventory and surveys the same on every phone, tablet and computer. Start on the device that has your data; then link the others. Everything is encrypted with your Admin passphrase key before it leaves the device.</p>
          <LinkFlow dek={dek ?? undefined} replacing={hasVault} onDone={() => setDone('This device is linked and syncing.')} />
        </>
      )}
    </section>
  );
}

/** Fresh device (/link): join the family's synced data instead of setting up from scratch. */
export default function LinkDevice() {
  const { hasVault } = useSession();
  const nav = useNavigate();
  return (
    <main className="center-page">
      <div className="card stack" style={{ maxWidth: 560, width: '100%' }}>
        <h1>Link to your family’s data</h1>
        {hasVault
          ? <div className="notice">This device is already set up. To link it, unlock Admin and use Backup › Sync across devices.</div>
          : <LinkFlow replacing={false} onDone={() => nav('/admin/inventory', { replace: true })} />}
        <Link to="/welcome" className="small">Back</Link>
      </div>
    </main>
  );
}
