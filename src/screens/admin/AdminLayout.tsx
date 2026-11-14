import { Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useSession } from '../../app/session';
import { startOrResumeSurvey } from '../../data/repo';

export function useStartSurvey() {
  const { lock } = useSession();
  const nav = useNavigate();
  // Closes Admin mode before handing the iPad over (scope §3 step 2).
  return async (memberId: string) => {
    await startOrResumeSurvey(memberId);
    lock();
    nav(`/survey/${memberId}`, { replace: true });
  };
}

export default function AdminLayout() {
  const { isAdmin, lock } = useSession();
  const nav = useNavigate();
  if (!isAdmin) return <Navigate to="/unlock" replace />;

  return (
    <>
      <header className="topbar no-print">
        <div className="inner">
          <nav aria-label="Admin">
            <NavLink to="/admin" end>Home</NavLink>
            <NavLink to="/admin/members">Members</NavLink>
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
