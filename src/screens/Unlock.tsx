import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useSession } from '../app/session';

export default function Unlock() {
  const { hasVault, isAdmin, remembered, resume, unlock, recover } = useSession();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') === 'start' ? '/admin/members?pick=1' : '/admin/inventory';
  const [mode, setMode] = useState<'pass' | 'recover'>('pass');
  const [pass, setPass] = useState('');
  const [rk, setRk] = useState('');
  const [np, setNp] = useState('');
  const [msg, setMsg] = useState('');
  const [waitUntil, setWaitUntil] = useState(0);
  const [nowTs, setNowTs] = useState(Date.now());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (waitUntil <= Date.now()) return;
    const t = window.setInterval(() => setNowTs(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [waitUntil]);

  if (!hasVault) return <Navigate to="/setup" replace />;
  if (isAdmin) return <Navigate to={next} replace />;

  const waitSec = Math.max(0, Math.ceil((waitUntil - nowTs) / 1000));

  async function submitPass(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    const r = await unlock(pass);
    setBusy(false);
    if (r.ok) return nav(next, { replace: true });
    setPass('');
    setWaitUntil(Date.now() + r.waitMs);
    setNowTs(Date.now());
    setMsg(r.waitMs > 0 ? 'Incorrect passphrase. Too many attempts. Please wait before trying again.' : 'Incorrect passphrase.');
  }

  async function submitRecover(e: React.FormEvent) {
    e.preventDefault();
    if (np.length < 8) return setMsg('New passphrase must be at least 8 characters.');
    setBusy(true);
    const ok = await recover(rk, np);
    setBusy(false);
    if (ok) nav(next, { replace: true });
    else setMsg('That recovery key did not work. Check for typos.');
  }

  return (
    <main className="center-page">
      {mode === 'pass' ? (
        <form className="card stack" style={{ maxWidth: 460, width: '100%' }} onSubmit={submitPass}>
          <h1>Admin</h1>
          {remembered && (
            <div className="stack" style={{ gap: 6 }}>
              <button type="button" className="primary big" onClick={async () => { if (await resume()) nav(next, { replace: true }); }}>Continue to Admin</button>
              <span className="small muted">This device stays unlocked (turn it off in Settings). Or enter the passphrase:</span>
            </div>
          )}
          <label>Passphrase
            <input type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} autoFocus={!remembered} />
          </label>
          {msg && <div className="notice danger" role="alert">{msg}{waitSec > 0 && ` (${waitSec}s)`}</div>}
          <button className={remembered ? '' : 'primary'} disabled={busy || waitSec > 0 || !pass}>{busy ? 'Checking…' : 'Unlock'}</button>
          <div className="spread">
            <Link to="/welcome" className="btn ghost">Back</Link>
            <button type="button" className="ghost small" onClick={() => { setMode('recover'); setMsg(''); }}>Forgot passphrase?</button>
          </div>
        </form>
      ) : (
        <form className="card stack" style={{ maxWidth: 520, width: '100%' }} onSubmit={submitRecover}>
          <h1>Use recovery key</h1>
          <p className="muted">Enter the recovery key you saved during setup and choose a new passphrase.</p>
          <label>Recovery key
            <input value={rk} onChange={(e) => setRk(e.target.value)} autoCapitalize="characters" autoComplete="off" spellCheck={false} />
          </label>
          <label>New passphrase
            <input type="password" autoComplete="new-password" value={np} onChange={(e) => setNp(e.target.value)} />
          </label>
          {msg && <div className="notice danger" role="alert">{msg}</div>}
          <button className="primary" disabled={busy}>{busy ? 'Checking…' : 'Reset passphrase'}</button>
          <button type="button" className="ghost" onClick={() => { setMode('pass'); setMsg(''); }}>Back</button>
        </form>
      )}
    </main>
  );
}
