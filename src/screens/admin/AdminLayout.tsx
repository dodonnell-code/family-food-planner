import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '../../app/session';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../data/db';
import { inProgressSurvey, newSurveyQuestions, startOrResumeSurvey } from '../../data/repo';
import { computeAttention } from '../../domain/attention';
import { CATEGORY_LABELS } from './Catalog';

const StartSurvey = createContext<(memberId: string) => Promise<void>>(async () => {});

/**
 * Start (or continue) someone's survey. When foods were added to the survey since they last
 * took it, the admin is asked whether they answer just the new questions or retake it all.
 */
export function useStartSurvey() {
  return useContext(StartSurvey);
}

interface Ask { memberId: string; name: string; count: number; groups: string[] }

export default function AdminLayout() {
  const { isAdmin, lock } = useSession();
  const nav = useNavigate();
  const attentionCount = useLiveQuery(async () => (await computeAttention()).length, []);
  const [ask, setAsk] = useState<Ask | null>(null);
  const { pathname } = useLocation();
  // Set by the Lock button, so locking goes to the welcome screen instead of the passphrase screen.
  const locking = useRef(false);
  // On phones the menu is one sideways-scrolling row: keep the current page's tab in view.
  useEffect(() => { document.querySelector('.topbar nav a.active')?.scrollIntoView({ block: 'nearest', inline: 'center' }); }, [pathname]);

  async function go(memberId: string, onlyNew = false) {
    setAsk(null);
    await startOrResumeSurvey(memberId, undefined, { onlyNew });
    // The survey screen locks Admin as soon as it mounts (locking here would make the
    // admin area redirect to /unlock before the navigation lands). Scope §3 step 2.
    nav(`/survey/${memberId}`, { replace: true });
  }
  async function start(memberId: string) {
    if (!(await inProgressSurvey(memberId))) {
      const ids = await newSurveyQuestions(memberId);
      if (ids.length) {
        const [m, foods] = await Promise.all([db.members.get(memberId), db.foods.bulkGet(ids)]);
        const groups = [...new Set(foods.flatMap((f) => (f ? [CATEGORY_LABELS[f.category]] : [])))];
        setAsk({ memberId, name: m ? m.preferredName || m.displayName.split(/\s+/)[0] : 'They', count: ids.length, groups });
        return;
      }
    }
    await go(memberId);
  }

  if (!isAdmin) return locking.current ? null : <Navigate to="/unlock" replace />;

  return (
    <StartSurvey.Provider value={start}>
      <header className="topbar no-print">
        <div className="inner">
          <nav aria-label="Admin">
            <NavLink to="/admin/inventory">Inventory</NavLink>
            <NavLink to="/admin" end>Home</NavLink>
            <NavLink to="/admin/members">Members</NavLink>
            <NavLink to="/admin/plan">Plan</NavLink>
            <NavLink to="/admin/deals">Deals</NavLink>
            <NavLink to="/admin/reports">Reports</NavLink>
            <NavLink to="/admin/catalog">Catalog</NavLink>
            <NavLink to="/admin/settings">Settings</NavLink>
            <NavLink to="/admin/backup">Backup</NavLink>
            <NavLink to="/admin/review">Review{attentionCount ? <span className="badge warn" style={{ marginLeft: 6 }}>{attentionCount}</span> : null}</NavLink>
          </nav>
          <button className="ghost" onClick={() => { locking.current = true; nav('/welcome', { replace: true }); lock(); }}>Lock</button>
        </div>
      </header>
      <main className="page">
        <Outlet />
      </main>
      {ask && (
        <div role="presentation" onClick={() => setAsk(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 100 }}>
          <div className="card stack" role="dialog" aria-modal="true" aria-labelledby="ask-h" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, width: '100%', gap: 12 }}>
            <h2 id="ask-h" style={{ margin: 0 }}>{ask.name} already took the survey</h2>
            <p style={{ margin: 0 }}>
              There {ask.count === 1 ? 'is 1 new question' : `are ${ask.count} new questions`} since then ({ask.groups.join(', ')}).
              Answer just {ask.count === 1 ? 'that one' : 'those'}, or retake the whole survey?
            </p>
            <button className="primary big" autoFocus onClick={() => go(ask.memberId, true)}>Answer only the new question{ask.count === 1 ? '' : 's'}</button>
            <span className="small muted" style={{ marginTop: -6 }}>Their other answers are kept as they are.</span>
            <button onClick={() => go(ask.memberId)}>Retake the whole survey</button>
            <span className="small muted" style={{ marginTop: -6 }}>Starts fresh. Their current answers keep counting until they submit.</span>
            <button className="ghost" onClick={() => setAsk(null)}>Cancel</button>
          </div>
        </div>
      )}
    </StartSurvey.Provider>
  );
}
