import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { SessionProvider, useSession } from './app/session';
import { ensureInitialized } from './data/repo';
import { requestPersistentStorage } from './data/db';
import Handoff from './screens/Handoff';
import Setup from './screens/Setup';
import Unlock from './screens/Unlock';
import AdminLayout from './screens/admin/AdminLayout';
import AdminHome from './screens/admin/AdminHome';
import Members from './screens/admin/Members';
import MemberDetail from './screens/admin/MemberDetail';
import SurveyPlaceholder from './screens/SurveyPlaceholder';

function Routed() {
  const { ready } = useSession();
  if (!ready) return null;
  return (
    <Routes>
      <Route path="/" element={<Handoff />} />
      <Route path="/setup" element={<Setup />} />
      <Route path="/unlock" element={<Unlock />} />
      <Route path="/survey/:memberId" element={<SurveyPlaceholder />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminHome />} />
        <Route path="members" element={<Members />} />
        <Route path="members/:id" element={<MemberDetail />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  const [autoLock, setAutoLock] = useState<number>();
  useEffect(() => {
    ensureInitialized().then((hh) => setAutoLock(hh.settings.autoLockMinutes));
    requestPersistentStorage();
  }, []);
  if (autoLock === undefined) return null;
  // HashRouter: works on GitHub Pages and offline without server rewrites.
  return (
    <SessionProvider autoLockMinutes={autoLock}>
      <HashRouter>
        <Routed />
      </HashRouter>
    </SessionProvider>
  );
}
