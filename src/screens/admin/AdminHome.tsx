import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useSearchParams } from 'react-router-dom';
import { db } from '../../data/db';
import { Avatar, firstName, fmtDate } from '../../app/ui';
import { loadMembersWithSurveys, surveyBadge } from './memberStatus';
import { useStartSurvey } from './AdminLayout';
import { AttentionList } from './Review';
import { computeAttention } from '../../domain/attention';
import { EXPIRING_SOON_DAYS, stockStatus } from '../../domain/inventory';

export default function AdminHome() {
  const [params] = useSearchParams();
  const picking = params.get('pick') === '1';
  const startSurvey = useStartSurvey();
  const rows = useLiveQuery(loadMembersWithSurveys, []);
  const household = useLiveQuery(() => db.households.toCollection().first(), []);
  const active = rows?.filter((r) => r.member.status === 'active') ?? [];

  const attention = useLiveQuery(() => computeAttention(), []);
  const done = active.filter((r) => r.latest && !r.inProgress).length;

  return (
    <div className="stack">
      <div className="spread">
        <h1>{household?.name ?? 'Household'}</h1>
        <span className="muted">{done} of {active.length} active members have a completed survey</span>
      </div>

      {attention && attention.length > 0 && (
        <section className="card stack">
          <div className="spread"><h2>Needs attention <span className="badge warn">{attention.length}</span></h2><Link to="/admin/review">Review all</Link></div>
          <AttentionList items={attention} limit={3} />
        </section>
      )}

      <UseSoon />

      <section className="card stack" aria-labelledby="next-h" style={picking ? { outline: '3px solid var(--accent)' } : undefined}>
        <h2 id="next-h">{picking ? 'Who is taking the survey?' : 'Start the next survey'}</h2>
        {active.length === 0 ? (
          <p className="muted">No active members yet. <Link to="/admin/members">Add your family members</Link> first.</p>
        ) : (
          <div className="grid">
            {active.map((r) => {
              const b = surveyBadge(r);
              return (
                <button key={r.member.id} onClick={() => startSurvey(r.member.id)} style={{ justifyContent: 'flex-start', minHeight: 72 }}>
                  <Avatar member={r.member} />
                  <span style={{ textAlign: 'left' }}>
                    {r.inProgress ? 'Continue' : r.latest ? 'Retake' : 'Start'} survey for {firstName(r.member)}
                    <br /><span className={`badge ${b.tone}`}>{b.text}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <p className="small muted">Starting a survey locks Admin and shows a private, full-screen questionnaire.</p>
      </section>

      <section className="card stack">
        <div className="spread"><h2>Members</h2><Link to="/admin/members">Manage</Link></div>
        <div className="list">
          {active.map((r) => {
            const b = surveyBadge(r);
            return (
              <Link key={r.member.id} to={`/admin/members/${r.member.id}`} className="spread" style={{ textDecoration: 'none', color: 'inherit' }}>
                <span className="row"><Avatar member={r.member} size={36} /> {r.member.displayName}</span>
                <span className="row"><span className="small muted">Last survey: {fmtDate(r.latest?.completedAt)}</span><span className={`badge ${b.tone}`}>{b.text}</span></span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/** Food (and water) to use or replace soon. Always shown on Home when anything is due. */
function UseSoon() {
  const data = useLiveQuery(async () => {
    const [stock, foods, hh] = await Promise.all([db.stock.toArray(), db.foods.toArray(), db.households.toCollection().first()]);
    const warn = hh?.settings.expiryWarningDays ?? EXPIRING_SOON_DAYS;
    const today = new Date().toISOString().slice(0, 10);
    const due = stock
      .map((e) => ({ e, s: stockStatus(e, today, warn), name: e.kind === 'water' ? 'Stored water' : foods.find((f) => f.id === e.foodId)?.name ?? 'Food' }))
      .filter((x) => x.s !== 'ok')
      .sort((a, b) => (a.e.bestBy ?? '').localeCompare(b.e.bestBy ?? ''));
    return { due, warn };
  }, []);
  if (!data || data.due.length === 0) return null;
  return (
    <section className="card stack" style={{ borderLeft: '5px solid var(--warn)' }}>
      <div className="spread"><h2 style={{ margin: 0 }}>Use soon</h2><Link to="/admin/inventory">Inventory</Link></div>
      <p className="small muted" style={{ margin: 0 }}>Within {data.warn} days of best-by. Use these in everyday meals, then restock.</p>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {data.due.slice(0, 6).map(({ e, s, name }) => (
          <li key={e.id}>{name}: {e.quantity} {e.kind === 'water' ? 'gal' : 'pkg'}, best by {fmtDate(e.bestBy!)} {s === 'expired' && <span className="badge danger">expired</span>}</li>
        ))}
      </ul>
      {data.due.length > 6 && <p className="small muted" style={{ margin: 0 }}>And {data.due.length - 6} more.</p>}
    </section>
  );
}
