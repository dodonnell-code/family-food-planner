import { useLiveQuery } from 'dexie-react-hooks';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { db } from '../data/db';
import { inProgressSurvey } from '../data/repo';
import { firstName } from '../app/ui';

/** Phase 3 replaces this with the full survey wizard. Only reachable when an in-progress survey exists. */
export default function SurveyPlaceholder() {
  const { memberId } = useParams<{ memberId: string }>();
  const nav = useNavigate();
  const data = useLiveQuery(async () => {
    const [m, s] = await Promise.all([db.members.get(memberId!), inProgressSurvey(memberId!)]);
    return { m, s: s ?? null };
  }, [memberId]);
  if (!data) return null;
  if (!data.m || !data.s) return <Navigate to="/" replace />;
  return (
    <main className="center-page">
      <div className="card stack" style={{ maxWidth: 560, textAlign: 'center' }}>
        <h1>Hi {firstName(data.m)}!</h1>
        <p>The food survey arrives in the next build phase.</p>
        <button className="primary" onClick={() => nav('/', { replace: true })}>Save &amp; exit</button>
      </div>
    </main>
  );
}
