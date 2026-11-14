import { Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useSession } from '../../app/session';
import { useLiveQuery } from 'dexie-react-hooks';
import { startOrResumeSurvey } from '../../data/repo';
import { computeAttention } from '../../domain/attention';

export function useStartSurvey() {
  const nav = useNavigate();
  // Closes Admin mode before handing the iPad over (scope §3 step 2).
  return async (memberId: string) => {
    await startOrResumeSurvey(memberId);
    // The survey screen locks Admin as soon as it mounts (locking here would make the
    // admin area redirect to /unlock before the navigation lands).
    nav(`/survey/${memberId}`, { replace: true });
  };
}

export default function AdminLayout() {
  const { isAdmin, lock } = useSession();
  const nav = useNavigate();
  const attentionCount = useLiveQuery(async () => (await computeAttention()).length, []);
  if (!isAdmin) return <Navigate to="/unlock" replace />;

  return (
    <>
      <header className="topbar no-print">
        <div className="inner">
          <nav aria-label="Admin">
            <NavLink to="/admin" end>Home</NavLink>
            <NavLink to="/admin/members">Members</NavLink>
            <NavLink to="/admin/review">Review{attentionCount ? <span className="badge warn" style={{ marginLeft: 6 }}>{attentionCount}</span> : null}</NavLink>
          </nav>
          <button className="ghost" onClick={() => { lock(); nav('/', { replace: true }); }}>Lock</button>
        </div>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </>
  );
}
