import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useSession } from '../app/session';
import { ensureInitialized } from '../data/repo';
import { requestPersistentStorage } from '../data/db';

/** First run: create admin passphrase, then show the recovery key exactly once. */
export default function Setup() {
  const { hasVault, setup, isAdmin } = useSession();
  const nav = useNavigate();
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (hasVault && !recoveryKey) return <Navigate to={isAdmin ? '/admin' : '/'} replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (p1.length < 8) return setErr('Use at least 8 characters. A short phrase is easier to remember than a code.');
    if (p1 !== p2) return setErr('The two passphrases do not match.');
    setBusy(true);
    try {
      await ensureInitialized();
      await requestPersistentStorage();
      setRecoveryKey(await setup(p1));
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (recoveryKey) {
    return (
      <main className="center-page">
        <div className="card stack" style={{ maxWidth: 620 }}>
          <h1>Save your recovery key</h1>
          <p>If you forget the Admin passphrase, this key is the <strong>only</strong> way to get back in and read allergy and health notes. It will not be shown again.</p>
          <div className="recovery-key" aria-label="Recovery key">{recoveryKey}</div>
          <p className="small muted">Print it or write it down and keep it somewhere safe, away from the iPad (for example, with your important papers).</p>
          <div className="row no-print">
            <button onClick={() => window.print()}>Print</button>
          </div>
          <label className="inline no-print">
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
            I have saved the recovery key somewhere safe
          </label>
          <button className="primary no-print" disabled={!saved} onClick={() => nav('/admin', { replace: true })}>Continue to Admin</button>
        </div>
      </main>
    );
  }

  return (
    <main className="center-page">
      <form className="card stack" style={{ maxWidth: 520, width: '100%' }} onSubmit={submit}>
        <h1>Set up this iPad</h1>
        <p className="muted">Choose an Admin passphrase. It unlocks member profiles, results and backups, and it encrypts sensitive notes such as allergies and health information.</p>
        <label>Admin passphrase
          <input type="password" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} autoFocus />
        </label>
        <label>Type it again
          <input type="password" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} />
        </label>
        {err && <div className="notice danger" role="alert">{err}</div>}
        <button className="primary" disabled={busy}>{busy ? 'Setting up…' : 'Create passphrase'}</button>
        <p className="small muted" style={{ margin: 0 }}>Moving from another iPad, or starting over? <Link to="/restore">Restore from a backup</Link> instead.</p>
      </form>
    </main>
  );
}
