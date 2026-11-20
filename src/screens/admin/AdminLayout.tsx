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

interface MenuLink { to: string; label: string; end?: boolean }
const MAIN: MenuLink[] = [
  { to: '/admin/inventory', label: 'Inventory' },
  { to: '/admin', label: 'Home', end: true },
  { to: '/admin/plan', label: 'Plan' },
  { to: '/admin/deals', label: 'Deals' },
  { to: '/admin/reports', label: 'Reports' },
  { to: '/admin/catalog', label: 'Catalog' },
  { to: '/admin/review', label: 'Review' },
];
/** Less-used pages: under "More" on larger screens, under a "More" heading in the phone menu. */
const MORE: MenuLink[] = [
  { to: '/admin/members', label: 'Members' },
  { to: '/admin/settings', label: 'Settings' },
  { to: '/admin/backup', label: 'Backup & sync' },
];
function currentLabel(pathname: string): string {
  if (pathname === '/admin' || pathname === '/admin/') return 'Home';
  return [...MAIN, ...MORE].find((l) => l.to !== '/admin' && pathname.startsWith(l.to))?.label ?? '';
}

export default function AdminLayout() {
  const { isAdmin, lock } = useSession();
  const nav = useNavigate();
  const attentionCount = useLiveQuery(async () => (await computeAttention()).length, []);
  const [ask, setAsk] = useState<Ask | null>(null);
  const { pathname } = useLocation();
  // Set by the Lock button, so locking goes to the welcome screen instead of the passphrase screen.
  const locking = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false); // phone menu
  const [moreOpen, setMoreOpen] = useState(false); // "More" on larger screens
  const moreRef = useRef<HTMLDivElement>(null);
  // Tapping a link closes the menus.
  const closeOnLink = (e: React.MouseEvent) => { if ((e.target as HTMLElement).closest('a')) { setMenuOpen(false); setMoreOpen(false); } };
  // Close "More" on a click outside it; Escape closes either menu.
  useEffect(() => {
    if (!moreOpen && !menuOpen) return;
    const onDown = (e: PointerEvent) => { if (moreOpen && !moreRef.current?.contains(e.target as Node)) setMoreOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMoreOpen(false); setMenuOpen(false); } };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [moreOpen, menuOpen]);

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
          {/* Phones: Menu button + the current page's name. */}
          <button className="ghost menu-button" aria-expanded={menuOpen} aria-controls="admin-menu" onClick={() => setMenuOpen((o) => !o)}>
            <span aria-hidden>{menuOpen ? '✕' : '☰'}</span> Menu{attentionCount ? <span className="badge warn">{attentionCount}</span> : null}
          </button>
          <span className="menu-current">{currentLabel(pathname)}</span>
          {/* Larger screens: one line, with the less-used pages under More. */}
          <nav aria-label="Admin" className="nav-wide">
            {MAIN.map((l) => <NavLink key={l.to} to={l.to} end={l.end}>{l.label}{l.to === '/admin/review' && attentionCount ? <span className="badge warn" style={{ marginLeft: 6 }}>{attentionCount}</span> : null}</NavLink>)}
            <div className="more" ref={moreRef}>
              <button type="button" className={`ghost more-button${MORE.some((l) => pathname.startsWith(l.to)) ? ' active' : ''}`} aria-expanded={moreOpen} aria-haspopup="true" onClick={() => setMoreOpen((o) => !o)}>More ▾</button>
              {moreOpen && (
                <div className="more-menu" role="menu" onClick={closeOnLink}>
                  {MORE.map((l) => <NavLink key={l.to} to={l.to} role="menuitem">{l.label}</NavLink>)}
                </div>
              )}
            </div>
          </nav>
          <button className="ghost" onClick={() => { locking.current = true; nav('/welcome', { replace: true }); lock(); }}>Lock</button>
        </div>
        {menuOpen && (
          <nav id="admin-menu" aria-label="Admin" className="menu-panel" onClick={closeOnLink}>
            {MAIN.map((l) => <NavLink key={l.to} to={l.to} end={l.end}>{l.label}{l.to === '/admin/review' && attentionCount ? <span className="badge warn" style={{ marginLeft: 6 }}>{attentionCount}</span> : null}</NavLink>)}
            <div className="menu-group" aria-hidden>More</div>
            {MORE.map((l) => <NavLink key={l.to} to={l.to}>{l.label}</NavLink>)}
          </nav>
        )}
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
