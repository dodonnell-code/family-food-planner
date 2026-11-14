import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useSearchParams } from 'react-router-dom';
import { db } from '../../data/db';
import { Avatar, firstName, fmtDate } from '../../app/ui';
import { loadMembersWithSurveys, surveyBadge } from './memberStatus';
import { useStartSurvey } from './AdminLayout';

export default function AdminHome() {
  const [params] = useSearchParams();
  const picking = params.get('pick') === '1';
  const startSurvey = useStartSurvey();
  const rows = useLiveQuery(loadMembersWithSurveys, []);
  const household = useLiveQuery(() => db.households.toCollection().first(), []);
  const active = rows?.filter((r) => r.member.status === 'active') ?? [];

  const lastBackup = household?.settings.lastBackupAt;
  const reminderDays = household?.settings.backupReminderDays ?? 14;
  const backupOverdue = !lastBackup || Date.now() - Date.parse(lastBackup) > reminderDays * 86_400_000;
  const done = active.filter((r) => r.latest && !r.inProgress).length;

  return (
    <div className="stack">
      <div className="spread">
        <h1>{household?.name ?? 'Household'}</h1>
        <span className="muted">{done} of {active.length} active members have a completed survey</span>
      </div>

      {backupOverdue && (
        <div className="notice" role="status">
          {lastBackup ? `Last backup ${fmtDate(lastBackup)}.` : 'No backup yet.'} iPad browser storage can be cleared, so make an encrypted backup regularly. (Backups arrive in a later phase.)
        </div>
      )}

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
