import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { changesSinceLastPlan, computeAttention, type AttentionItem } from '../../domain/attention';
import { fmtDate } from '../../app/ui';
import { useStartSurvey } from './AdminLayout';

const TONE = { high: 'danger', medium: 'warn', low: '' } as const;
const WORD = { high: 'Important', medium: 'Soon', low: 'FYI' } as const;

export function AttentionList({ items, limit }: { items: AttentionItem[]; limit?: number }) {
  const startSurvey = useStartSurvey();
  const shown = limit ? items.slice(0, limit) : items;
  if (items.length === 0) return <p className="muted">Nothing needs attention right now.</p>;
  return (
    <div className="list">
      {shown.map((it) => (
        <div key={it.id} className="spread">
          <div style={{ flex: 1, minWidth: 240 }}>
            <span className={`badge ${TONE[it.severity]}`}>{WORD[it.severity]}</span>{' '}
            <strong>{it.title}</strong>
            {it.detail && <div className="small muted">{it.detail}</div>}
          </div>
          <div className="row">
            {it.action === 'start-survey' && it.memberId && <button onClick={() => startSurvey(it.memberId!)}>Start survey</button>}
            {it.link && <Link to={it.link} className="btn">Open</Link>}
          </div>
        </div>
      ))}
      {limit && items.length > limit && <Link to="/admin/review">See all {items.length}</Link>}
    </div>
  );
}

export default function Review() {
  // Re-run when any relevant table changes.
  const attention = useLiveQuery(() => computeAttention(), []);
  const changes = useLiveQuery(() => changesSinceLastPlan(), []);

  return (
    <div className="stack">
      <h1>Review</h1>

      <section className="card stack">
        <h2>Needs attention {attention && attention.length > 0 && <span className="badge warn">{attention.length}</span>}</h2>
        {attention && <AttentionList items={attention} />}
      </section>

      <section className="card stack">
        <div className="spread">
          <h2>Changes since the last plan</h2>
          <span className="small muted">{changes?.since ? `Last plan: ${fmtDate(changes.since)}` : 'No plan calculated yet'}</span>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Everything below affects the food plan. Once the planner is built, recalculating will show what to add, remove or buy more of because of these changes.
        </p>
        {changes && changes.changes.length === 0 && <p className="muted">No changes.</p>}
        <div className="list">
          {changes?.changes.map((c) => (
            <div key={c.id} className="spread">
              <span>{c.memberId ? <Link to={`/admin/members/${c.memberId}`} style={{ color: 'inherit' }}>{c.text}</Link> : c.text}</span>
              <span className="small muted">{fmtDate(c.timestamp)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
