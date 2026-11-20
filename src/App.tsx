import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { SessionProvider, useSession } from './app/session';
import { ensureInitialized } from './data/repo';
import { requestPersistentStorage } from './data/db';
import Handoff from './screens/Handoff';
import Setup from './screens/Setup';
import Unlock from './screens/Unlock';
import AdminLayout from './screens/admin/AdminLayout';
import Members from './screens/admin/Members';
import MemberDetail from './screens/admin/MemberDetail';
import Review from './screens/admin/Review';
import Catalog from './screens/admin/Catalog';
import FoodEditor from './screens/admin/FoodEditor';
import Plan from './screens/admin/Plan';
import Settings from './screens/admin/Settings';
import Reports from './screens/admin/Reports';
import Backup from './screens/admin/Backup';
import Inventory from './screens/admin/Inventory';
import Deals from './screens/admin/Deals';
import Restore from './screens/Restore';
import LinkDevice from './screens/LinkDevice';
import Dashboard from './screens/admin/Dashboard';
import OnHand from './screens/OnHand';
import { initSync } from './data/cloud';
import { getDeviceOwner } from './data/device';
import { useLiveQuery } from 'dexie-react-hooks';
import Survey from './screens/survey/Survey';
import UpdatePrompt from './app/UpdatePrompt';

/**
 * The app opens on Inventory (unlocking Admin first if needed). New devices, and a family member's
 * personal device (Settings › Whose device is this?), start at the welcome screen.
 */
function Start() {
  const { hasVault } = useSession();
  const owner = useLiveQuery(async () => (await getDeviceOwner()) ?? null, []);
  if (owner === undefined) return null;
  return <Navigate to={hasVault && !owner ? '/admin/dashboard' : '/welcome'} replace />;
}

function Routed() {
  const { ready } = useSession();
  if (!ready) return null;
  return (
    <>
    <UpdatePrompt />
    <Routes>
      <Route path="/" element={<Start />} />
      <Route path="/welcome" element={<Handoff />} />
      <Route path="/link" element={<LinkDevice />} />
      <Route path="/on-hand" element={<OnHand />} />
      <Route path="/setup" element={<Setup />} />
      <Route path="/unlock" element={<Unlock />} />
      <Route path="/restore" element={<Restore />} />
      <Route path="/survey/:memberId" element={<Survey />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="members" element={<Members />} />
        <Route path="members/:id" element={<MemberDetail />} />
        <Route path="review" element={<Review />} />
        <Route path="catalog" element={<Catalog />} />
        <Route path="catalog/:id" element={<FoodEditor />} />
        <Route path="plan" element={<Plan />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="on-hand" element={<Navigate to="/admin/inventory?show=have" replace />} />
        <Route path="deals" element={<Deals />} />
        <Route path="reports" element={<Reports />} />
        <Route path="backup" element={<Backup />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}

function StartupProblem({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="center-page">
      <div className="card stack" style={{ maxWidth: 620 }} role="alert">
        <h1>{title}</h1>
        {children}
      </div>
    </main>
  );
}

export default function App() {
  const [autoLock, setAutoLock] = useState<number>();
  const [error, setError] = useState<string>();
  const secure = window.isSecureContext && !!globalThis.crypto?.subtle;

  useEffect(() => {
    if (!secure) return;
    ensureInitialized()
      .then((hh) => { setAutoLock(hh.settings.autoLockMinutes); initSync().catch(() => {}); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    requestPersistentStorage();
  }, [secure]);

  if (!secure) {
    return (
      <StartupProblem title="This address isn't secure">
        <p>The planner encrypts private information, and browsers only allow that on secure (HTTPS) addresses or on <code>localhost</code>.</p>
        <p>You opened <strong>{window.location.host}</strong>. If you are on the computer running the app, open{' '}
          <a href={`http://localhost:${window.location.port}/`}>http://localhost:{window.location.port}</a> instead. On a phone or tablet, use the installed HTTPS version.</p>
      </StartupProblem>
    );
  }
  if (error) {
    return (
      <StartupProblem title="The planner couldn't start">
        <p>Your data has not been changed. Try reloading the page. If this keeps happening, note the message below.</p>
        <pre className="small" style={{ whiteSpace: 'pre-wrap' }}>{error}</pre>
        <button className="primary" onClick={() => location.reload()}>Reload</button>
      </StartupProblem>
    );
  }
  if (autoLock === undefined) return <main className="center-page"><p className="muted">Loading…</p></main>;
  // HashRouter: works on GitHub Pages and offline without server rewrites.
  return (
    <SessionProvider autoLockMinutes={autoLock}>
      <HashRouter>
        <Routed />
      </HashRouter>
    </SessionProvider>
  );
}
