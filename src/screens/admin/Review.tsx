import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '../../data/db';
import { approveAll, decideChange, markAllRead, markRead } from '../../data/changes';
import { decryptString } from '../../data/crypto';
import { computeAttention, type AttentionItem } from '../../domain/attention';
import { changeTitle, diffRows, type DisplayValue, type Lookups } from '../../domain/changeView';
import type { ChangeRecord } from '../../domain/types';
import { useSession } from '../../app/session';
import { useStartSurvey } from './AdminLayout';
import { dismissSurveyRefresh } from '../../data/repo';

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
            {it.dismissRefresh && it.memberId && <button className="ghost" onClick={() => dismissSurveyRefresh(it.memberId!)}>No retake needed</button>}
            {it.link && <Link to={it.link} className="btn">Open</Link>}
          </div>
        </div>
      ))}
      {limit && items.length > limit && <Link to="/admin/review">See all {items.length}</Link>}
    </div>
  );
}

export default function Review() {
  const attention = useLiveQuery(() => computeAttention(), []);
  return (
    <div className="stack">
      <h1>Review</h1>
      <section className="card stack">
        <h2>Needs attention {attention && attention.length > 0 && <span className="badge warn">{attention.length}</span>}</h2>
        {attention && <AttentionList items={attention.filter((a) => a.id !== 'changes')} />}
      </section>
      <ChangesInbox />
    </div>
  );
}

function ChangesInbox() {
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const data = useLiveQuery(async () => {
    const [changes, members, restrictions, needs, lastSnap, foods, customFields] = await Promise.all([
      db.changes.orderBy('timestamp').reverse().toArray(),
      db.members.toArray(),
      db.restrictions.toArray(),
      db.needs.toArray(),
      db.snapshots.orderBy('createdAt').last(),
      db.foods.toArray(),
      db.customFields.toArray(),
    ]);
    const lookups: Lookups = {
      members: new Map(members.map((m) => [m.id, m])),
      restrictions: new Map(restrictions.map((r) => [r.id, r])),
      needs: new Map(needs.map((n) => [n.id, n])),
      foods: new Map(foods.map((f) => [f.id, f])),
      customFields: new Map(customFields.map((f) => [f.id, f])),
    };
    return { changes, lookups, lastPlan: lastSnap?.createdAt };
  }, []);

  if (!data) return null;
  const pending = data.changes.filter((c) => c.status === 'pending');
  const history = data.changes.filter((c) => c.status !== 'pending');
  const unread = data.changes.filter((c) => !c.readAt).length;
  const list = tab === 'pending' ? pending : history;

  return (
    <section className="card stack" id="changes">
      <div className="spread">
        <h2>Changes {unread > 0 && <span className="badge danger">{unread} new</span>}</h2>
        <span className="small muted">{data.lastPlan ? `Last plan: ${new Date(data.lastPlan).toLocaleDateString()}` : 'No plan calculated yet'}</span>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Each change shows its before and after values. <strong>Approve</strong> keeps it. <strong>Deny</strong> undoes it and restores the earlier setting (nothing is ever deleted).
      </p>
      <div className="spread">
        <div className="row" role="tablist">
          <button role="tab" aria-selected={tab === 'pending'} className={tab === 'pending' ? 'primary' : ''} onClick={() => setTab('pending')}>Waiting for review ({pending.length})</button>
          <button role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'primary' : ''} onClick={() => setTab('history')}>History ({history.length})</button>
        </div>
        <div className="row">
          {unread > 0 && <button className="ghost" onClick={() => markAllRead()}>Mark all read</button>}
          {tab === 'pending' && pending.length > 1 && (
            <button onClick={() => confirm(`Approve all ${pending.length} changes? Survey submissions will be acknowledged.`) && approveAll()}>Approve all</button>
          )}
        </div>
      </div>
      {list.length === 0 && <p className="muted">{tab === 'pending' ? 'Nothing waiting for review.' : 'No decided changes yet.'}</p>}
      <div className="list">
        {list.map((c) => <ChangeItem key={c.id} change={c} lookups={data.lookups} />)}
      </div>
    </section>
  );
}

const STATUS_BADGE: Record<ChangeRecord['status'], { text: string; tone: string }> = {
  pending: { text: 'waiting', tone: 'warn' },
  approved: { text: 'approved', tone: 'ok' },
  denied: { text: 'denied', tone: 'danger' },
  acknowledged: { text: 'acknowledged', tone: 'ok' },
};

function ChangeItem({ change: c, lookups }: { change: ChangeRecord; lookups: Lookups }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');
  const rows = diffRows(c, lookups);
  const unread = !c.readAt;
  const sb = STATUS_BADGE[c.status];

  function toggle() {
    setOpen((o) => !o);
    if (unread) markRead([c.id]);
  }
  async function decide(d: 'approve' | 'deny' | 'acknowledge') {
    setErr('');
    try {
      await decideChange(c.id, d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      <button className="ghost" onClick={toggle} aria-expanded={open}
        style={{ justifyContent: 'space-between', width: '100%', padding: '0 4px', fontWeight: unread ? 800 : 500, textAlign: 'left' }}>
        <span className="row" style={{ gap: 8 }}>
          {unread && <span className="badge danger">New</span>}
          {c.source === 'respondent' && <span className="badge">suggestion</span>}
          <span>{changeTitle(c, lookups)}</span>
        </span>
        <span className="row" style={{ gap: 8 }}>
          {c.status !== 'pending' && <span className={`badge ${sb.tone}`}>{sb.text}</span>}
          <span className="small muted">{new Date(c.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
          <span aria-hidden>{open ? '▴' : '▾'}</span>
        </span>
      </button>

      {open && (
        <div className="stack" style={{ gap: 10, paddingLeft: 4 }}>
          {rows.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr className="small muted" style={{ textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px' }}>Setting</th><th style={{ padding: '6px 8px' }}>Before</th><th style={{ padding: '6px 8px' }}>After</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px', fontWeight: 600 }}>{r.label}</td>
                    <td style={{ padding: '8px', color: 'var(--muted)', textDecoration: c.op === 'create' ? 'none' : 'line-through' }}><Value v={r.before} /></td>
                    <td style={{ padding: '8px' }}><Value v={r.after} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="small muted" style={{ margin: 0 }}>No setting details for this change.</p>}

          {c.memberId && <Link to={`/admin/members/${c.memberId}`} className="small">Open profile</Link>}
          {err && <div className="notice danger" role="alert">{err}</div>}
          {c.status === 'pending' && (
            <div className="row">
              {c.source === 'respondent' ? (
                <>
                  <button className="primary" onClick={() => decide('approve')}>Approve &amp; apply</button>
                  <button className="danger" onClick={() => decide('deny')}>Decline</button>
                  <span className="small muted">Suggestions only take effect if you approve them.</span>
                </>
              ) : c.reversible ? (
                <>
                  <button className="primary" onClick={() => decide('approve')}>Approve</button>
                  <button className="danger" onClick={() => confirm('Deny and undo this change? The earlier setting will be restored.') && decide('deny')}>Deny &amp; undo</button>
                </>
              ) : (
                <>
                  <button className="primary" onClick={() => decide('acknowledge')}>Acknowledge</button>
                  <span className="small muted">{c.op === 'submit' ? 'Survey answers can’t be undone here; you can ask for a retake instead.' : 'This change can’t be undone automatically.'}</span>
                </>
              )}
            </div>
          )}
          {c.decidedAt && <span className="small muted">Decided {new Date(c.decidedAt).toLocaleString()}</span>}
        </div>
      )}
    </div>
  );
}

function Value({ v }: { v: DisplayValue }) {
  const { dek } = useSession();
  const [text, setText] = useState<string>();
  useEffect(() => {
    if (v.kind !== 'encrypted' || !dek) return;
    decryptString(dek, v.blob).then(
      (t) => {
        if (!v.json) return setText(t);
        try {
          const parsed: unknown = JSON.parse(t);
          if (Array.isArray(parsed)) setText(parsed.join(', '));
          else if (parsed && typeof parsed === 'object') setText(Object.entries(parsed).map(([k, x]) => `${k}: ${String(x)}`).join(', '));
          else setText(typeof parsed === 'boolean' ? (parsed ? 'Yes' : 'No') : String(parsed));
        } catch {
          setText(t);
        }
      },
      () => setText('[unreadable]'),
    );
  }, [v, dek]);
  if (v.kind === 'text') return <>{v.text}</>;
  return <span title="Encrypted on this device">🔒 {text ?? '…'}</span>;
}
