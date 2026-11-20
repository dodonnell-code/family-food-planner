import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { db } from '../data/db';
import { useSession } from '../app/session';
import { Avatar, firstName, ThemeButton } from '../app/ui';
import { startOrResumeSurvey } from '../data/repo';
import { getDeviceOwner, ownSurveyState } from '../data/device';
import type { Member } from '../domain/types';

/** Neutral welcome / "ready for next person" screen. Never shows anyone's answers or results. */
export default function Handoff() {
  const { hasVault } = useSession();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const justFinished = params.get('done') === '1';

  // Only first names of people with an unfinished survey, so they can continue.
  const owner = useLiveQuery(async () => (await getDeviceOwner()) ?? null, []);
  const inProgress = useLiveQuery(async () => {
    const surveys = await db.surveys.where('status').equals('in-progress').toArray();
    const members = await db.members.bulkGet(surveys.map((s) => s.memberId));
    return members.filter((m): m is NonNullable<typeof m> => !!m && m.status === 'active');
  }, []);

  if (owner === undefined) return null;
  if (owner) return <PersonalWelcome owner={owner} justFinished={justFinished} />;

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
        <div><ThemeButton /></div>
      </div>
    </main>
  );
}

/** A family member's own device: they can take their own survey without the Admin passphrase. */
function PersonalWelcome({ owner, justFinished }: { owner: Member; justFinished: boolean }) {
  const nav = useNavigate();
  const state = useLiveQuery(() => ownSurveyState(owner.id), [owner.id]);
  const name = firstName(owner);
  async function go(onlyNew = false) {
    await startOrResumeSurvey(owner.id, undefined, { onlyNew });
    nav(`/survey/${owner.id}`);
  }
  return (
    <main className="center-page">
      <div className="stack" style={{ maxWidth: 560, width: '100%', textAlign: 'center' }}>
        {justFinished && <div className="notice ok" role="status">Thanks, {name}! Your answers are saved and private.</div>}
        <div style={{ display: 'grid', placeItems: 'center' }}><Avatar member={owner} size={64} /></div>
        <h1 style={{ margin: 0 }}>Hi, {name}</h1>
        <p className="muted" style={{ margin: 0 }}>Family Emergency Food Planner</p>
        {state?.kind === 'start' && <button className="primary big" onClick={() => go()}>Start your survey</button>}
        {state?.kind === 'continue' && <button className="primary big" onClick={() => go()}>Continue your survey</button>}
        {state?.kind === 'new-questions' && (
          <>
            <button className="primary big" onClick={() => go(true)}>Answer {state.count === 1 ? 'the new question' : `the ${state.count} new questions`}</button>
            <button onClick={() => go()}>Retake the whole survey</button>
          </>
        )}
        {state?.kind === 'done' && (
          <>
            <p style={{ margin: 0 }}>Your survey is done. Thanks!</p>
            <button onClick={() => go()}>Change my answers (retake)</button>
          </>
        )}
        <Link to="/unlock" className="btn ghost">Admin</Link>
        <div><ThemeButton /></div>
      </div>
    </main>
  );
}
