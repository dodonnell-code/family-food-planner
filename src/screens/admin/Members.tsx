import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router-dom';
import { addMember } from '../../data/repo';
import { Avatar, MEMBER_COLORS } from '../../app/ui';
import { loadMembersWithSurveys, surveyBadge } from './memberStatus';
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
