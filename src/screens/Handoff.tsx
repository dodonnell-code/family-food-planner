import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { db } from '../data/db';
import { useSession } from '../app/session';
import { Avatar, firstName } from '../app/ui';

/** Neutral welcome / "ready for next person" screen. Never shows anyone's answers or results. */
export default function Handoff() {
  const { hasVault } = useSession();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const justFinished = params.get('done') === '1';

  // Only first names of people with an unfinished survey, so they can continue.
  const inProgress = useLiveQuery(async () => {
    const surveys = await db.surveys.where('status').equals('in-progress').toArray();
    const members = await db.members.bulkGet(surveys.map((s) => s.memberId));
    return members.filter((m): m is NonNullable<typeof m> => !!m && m.status === 'active');
  }, []);

  return (
    <main className="center-page">
      <div className="stack" style={{ maxWidth: 560, width: '100%', textAlign: 'center' }}>
        {justFinished && <div className="notice ok" role="status">Thanks! Your answers are saved and private.</div>}
        <h1>Family Emergency Food Planner</h1>
        <p className="muted">{justFinished ? 'Please hand the device to the next person.' : 'Ready for the next person.'}</p>

        {!hasVault ? (
          <>
            <Link to="/setup" className="btn primary big">Set up this device</Link>
            <Link to="/link" className="btn big">Link to another device</Link>
          </>
        ) : (
          <>
            <button className="primary big" onClick={() => nav('/unlock?next=start')}>Start a survey</button>
            <p className="small muted">An adult with the Admin passphrase chooses who goes next.</p>
          </>
        )}

        {inProgress && inProgress.length > 0 && (
          <div className="card stack" style={{ textAlign: 'left' }}>
            <h2>Continue your survey</h2>
            {inProgress.map((m) => (
              <button key={m.id} onClick={() => nav(`/survey/${m.id}`)} style={{ justifyContent: 'flex-start' }}>
                <Avatar member={m} size={36} /> {firstName(m)}
              </button>
            ))}
          </div>
        )}

        {hasVault && (
          <Link to="/unlock" className="btn ghost">Admin</Link>
        )}
      </div>
    </main>
  );
}
