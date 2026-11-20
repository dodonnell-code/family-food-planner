import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { addMember } from '../../data/repo';
import { Avatar, firstName, MEMBER_COLORS } from '../../app/ui';
import { useStartSurvey } from './AdminLayout';
import { loadMembersWithSurveys, surveyBadge, type MemberWithSurvey } from './memberStatus';
import type { MemberStatus } from '../../domain/types';

const GROUPS: { status: MemberStatus; title: string; hint: string }[] = [
  { status: 'active', title: 'Active', hint: 'Counted in the current household plan.' },
  { status: 'inactive', title: 'Inactive', hint: 'Not counted right now; history kept.' },
  { status: 'archived', title: 'Archived', hint: 'Former members; history always kept.' },
];

export default function Members() {
  const rows = useLiveQuery(loadMembersWithSurveys, []);
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [err, setErr] = useState('');

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    const trimmed = name.trim();
    if (!trimmed) return;
    const dup = rows?.find((r) => r.member.displayName.toLowerCase() === trimmed.toLowerCase());
    if (dup && !confirm(`There is already a member named "${dup.member.displayName}" (${dup.member.status}). Add a separate person anyway?`)) return;
    try {
      const color = MEMBER_COLORS[(rows?.length ?? 0) % MEMBER_COLORS.length];
      const m = await addMember({ displayName: trimmed, color });
      setName('');
      nav(`/admin/members/${m.id}`);
    } catch (e) {
      setErr(String(e));
    }
  }

  return (
    <div className="stack">
      <h1>Members</h1>
      <Surveys rows={rows} />
      <form className="card row" onSubmit={add}>
        <label style={{ flex: 1, minWidth: 220 }}>Add a person
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" autoComplete="off" />
        </label>
        <button className="primary" style={{ alignSelf: 'flex-end' }} disabled={!name.trim()}>Add</button>
        {err && <div className="notice danger">{err}</div>}
      </form>

      {GROUPS.map((g) => {
        const list = rows?.filter((r) => r.member.status === g.status) ?? [];
        if (g.status !== 'active' && list.length === 0) return null;
        return (
          <section key={g.status} className="card stack">
            <div className="spread"><h2>{g.title} ({list.length})</h2><span className="small muted">{g.hint}</span></div>
            {list.length === 0 && <p className="muted">Nobody yet.</p>}
            <div className="list">
              {list.map((r) => {
                const b = surveyBadge(r);
                return (
                  <Link key={r.member.id} to={`/admin/members/${r.member.id}`} className="spread" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <span className="row">
                      <Avatar member={r.member} size={36} />
                      <span>{r.member.displayName}{r.member.preferredName && <span className="muted"> ({r.member.preferredName})</span>}
                        {r.member.planningProfile.presence !== 'usually-present' && <span className="badge" style={{ marginLeft: 8 }}>guest</span>}
                      </span>
                    </span>
                    <span className={`badge ${b.tone}`}>{b.text}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Start, continue or retake each active member's survey (the Start a survey button lands here). */
function Surveys({ rows }: { rows: MemberWithSurvey[] | undefined }) {
  const [params] = useSearchParams();
  const picking = params.get('pick') === '1';
  const startSurvey = useStartSurvey();
  const active = rows?.filter((r) => r.member.status === 'active') ?? [];
  if (!rows || active.length === 0) return null;
  const done = active.filter((r) => surveyBadge(r).tone === 'ok').length;
  return (
    <section className="card stack" aria-labelledby="surveys-h" style={picking ? { outline: '3px solid var(--accent)' } : undefined}>
      <div className="spread">
        <h2 id="surveys-h" style={{ margin: 0 }}>{picking ? 'Who is taking the survey?' : 'Surveys'}</h2>
        <span className="small muted">{done} of {active.length} complete</span>
      </div>
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
      <p className="small muted" style={{ margin: 0 }}>Starting a survey locks Admin and shows a private, full-screen questionnaire.</p>
    </section>
  );
}
