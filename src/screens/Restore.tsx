import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSession } from '../app/session';
import { fmtDate } from '../app/ui';
import { openBackup, readEnvelope, restoreBackup, TABLE_LABELS, type BackupCounts, type BackupData, type BackupEnvelope } from '../data/backup';

/** Restore flow, used on a fresh iPad (/restore) and from Admin › Backup. */
export function RestorePanel({ replacing, onDone }: { replacing: boolean; onDone: () => void }) {
  const { adopt } = useSession();
  const [env, setEnv] = useState<BackupEnvelope>();
  const [useRecovery, setUseRecovery] = useState(false);
  const [secret, setSecret] = useState('');
  const [opened, setOpened] = useState<{ dek: CryptoKey; data: BackupData; counts: BackupCounts }>();
  const [confirmText, setConfirmText] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function pick(file: File | undefined) {
    setErr(''); setEnv(undefined); setOpened(undefined);
    if (!file) return;
    try { setEnv(readEnvelope(await file.text())); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    if (!env) return;
    setErr(''); setBusy(true);
    try { setOpened(await openBackup(env, useRecovery ? { recoveryKey: secret } : { passphrase: secret })); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  async function restore() {
    if (!env || !opened) return;
    setErr(''); setBusy(true);
    try {
      await restoreBackup(env, opened.data);
      adopt(opened.dek);
      onDone();
    } catch (e) {
      setErr(`Restore failed and nothing was changed: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  }

  const needConfirm = replacing && confirmText.trim().toUpperCase() !== 'REPLACE';

  return (
    <div className="stack">
      <label>Backup file
        <input type="file" accept=".ffpbackup,application/json" onChange={(e) => pick(e.target.files?.[0])} />
      </label>
      {env && !opened && (
        <form className="stack" onSubmit={unlock}>
          <p className="small muted" style={{ margin: 0 }}>Backup made {fmtDate(env.createdAt)}. Enter the Admin passphrase from when it was made, or the recovery key.</p>
          {useRecovery
            ? <label>Recovery key<input value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" placeholder="XXXX-XXXX-…" /></label>
            : <label>Admin passphrase<input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="current-password" /></label>}
          <div className="row">
            <button className="primary" disabled={busy || !secret}>{busy ? 'Checking…' : 'Open backup'}</button>
            <button type="button" className="ghost" onClick={() => { setUseRecovery(!useRecovery); setSecret(''); setErr(''); }}>{useRecovery ? 'Use passphrase instead' : 'Use recovery key instead'}</button>
          </div>
        </form>
      )}
      {opened && env && (
        <div className="stack">
          <div className="notice ok">Backup opened. It contains:</div>
          <ul className="small" style={{ margin: 0, paddingLeft: 20 }}>
            {(Object.keys(opened.counts) as (keyof BackupCounts)[]).filter((k) => opened.counts[k] > 0 && k !== 'audit' && k !== 'changes').map((k) => <li key={k}>{TABLE_LABELS[k]}: {opened.counts[k]}</li>)}
          </ul>
          {replacing && (
            <>
              <div className="notice danger">Restoring <strong>replaces everything on this iPad</strong> with the backup from {fmtDate(env.createdAt)}. Anything added since then is lost. Afterwards the Admin passphrase and recovery key are the ones from the backup.</div>
              <label style={{ maxWidth: 320 }}>Type REPLACE to confirm<input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" /></label>
            </>
          )}
          <div><button className={replacing ? 'danger' : 'primary'} disabled={busy || needConfirm} onClick={restore}>{busy ? 'Restoring…' : replacing ? 'Replace and restore' : 'Restore'}</button></div>
        </div>
      )}
      {err && <div className="notice danger" role="alert">{err}</div>}
    </div>
  );
}

/** Fresh-device restore (before any Admin passphrase exists). */
export default function Restore() {
  const { hasVault } = useSession();
  const nav = useNavigate();
  return (
    <main className="center-page">
      <div className="card stack" style={{ maxWidth: 560, width: '100%' }}>
        <h1>Restore from a backup</h1>
        {hasVault
          ? <div className="notice">This iPad is already set up. To replace its data, unlock Admin and use Backup.</div>
          : <RestorePanel replacing={false} onDone={() => nav('/admin', { replace: true })} />}
        <Link to="/" className="small">Back</Link>
      </div>
    </main>
  );
}
