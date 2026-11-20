import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../app/session';
import { downloadText } from '../../app/download';
import { fmtDate } from '../../app/ui';
import { db } from '../../data/db';
import { createBackup, eraseAll, markBackedUp } from '../../data/backup';
import { RestorePanel } from '../Restore';
import { SyncCard } from '../LinkDevice';
import { unlinkDevice } from '../../data/cloud';

export default function Backup() {
  const { dek, reset } = useSession();
  const nav = useNavigate();
  const hh = useLiveQuery(() => db.households.toCollection().first(), []);
  const counts = useLiveQuery(async () => ({ members: await db.members.count(), surveys: await db.surveys.count(), plans: await db.snapshots.count() }), []);
  const [persisted, setPersisted] = useState<boolean>();
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [erase, setErase] = useState('');

  useEffect(() => { navigator.storage?.persisted?.().then(setPersisted, () => setPersisted(undefined)); }, []);

  const last = hh?.settings.lastBackupAt;
  const ageDays = last ? Math.floor((Date.now() - Date.parse(last)) / 86_400_000) : undefined;
  const overdue = ageDays === undefined || ageDays >= (hh?.settings.backupReminderDays ?? 14);

  async function backup() {
    if (!dek) return;
    setMsg(undefined); setBusy(true);
    try {
      const b = await createBackup(dek);
      downloadText(b.filename, b.text, 'application/octet-stream');
      await markBackedUp(b.createdAt);
      setMsg({ ok: true, text: `Saved ${b.filename}. Keep it somewhere other than this device, like iCloud Drive, Google Drive or a USB drive. Opening it needs your Admin passphrase or the recovery key.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally { setBusy(false); }
  }

  async function eraseDevice() {
    await unlinkDevice();
    await eraseAll();
    reset();
    nav('/welcome', { replace: true });
  }

  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>Backup &amp; sync</h1>

      <SyncCard />

      <section className="card stack">
        <div className="spread">
          <h2 style={{ margin: 0 }}>Backup health</h2>
          <span className={`badge ${overdue ? 'warn' : 'ok'}`}>{last ? (overdue ? 'Backup overdue' : 'Up to date') : 'No backup yet'}</span>
        </div>
        <ul className="small" style={{ margin: 0, paddingLeft: 20 }}>
          <li>Last backup: {last ? `${fmtDate(last)} (${ageDays === 0 ? 'today' : `${ageDays} day${ageDays === 1 ? '' : 's'} ago`})` : 'never'}. Reminder every {hh?.settings.backupReminderDays ?? 14} days (change in Settings).</li>
          {counts && <li>On this device: {counts.members} member{counts.members === 1 ? '' : 's'}, {counts.surveys} survey{counts.surveys === 1 ? '' : 's'}, {counts.plans} saved plan{counts.plans === 1 ? '' : 's'}.</li>}
          <li>{persisted ? 'The browser has agreed to keep this data (persistent storage).' : 'The browser may clear this data if the device runs low on space, or if website data is cleared. Install the app to the Home Screen and keep backups.'}</li>
        </ul>
        <div><button className="primary big" onClick={backup} disabled={busy || !dek}>{busy ? 'Making backup…' : 'Make an encrypted backup'}</button></div>
        {msg && <div className={`notice ${msg.ok ? 'ok' : 'danger'}`} role={msg.ok ? 'status' : 'alert'}>{msg.text}</div>}
        <p className="small muted" style={{ margin: 0 }}>The backup holds everything (people, restrictions, surveys, catalog, saved plans), encrypted. Without the passphrase or recovery key it can’t be read, and a lost passphrase and recovery key can’t be recovered by anyone.</p>
      </section>

      <section className="card stack">
        <h2 style={{ margin: 0 }}>Restore</h2>
        {restoring
          ? <RestorePanel replacing onDone={() => { setRestoring(false); setMsg({ ok: true, text: 'Restore complete.' }); window.scrollTo({ top: 0 }); }} />
          : <div><button onClick={() => setRestoring(true)}>Restore from a backup file…</button></div>}
      </section>

      <section className="card stack">
        <h2 style={{ margin: 0 }}>Erase this device</h2>
        <p className="small muted" style={{ margin: 0 }}>Deletes everything stored by the planner on this device, including the Admin passphrase. Make a backup first if you might need the data.</p>
        <label style={{ maxWidth: 320 }}>Type ERASE to confirm<input value={erase} onChange={(e) => setErase(e.target.value)} autoComplete="off" /></label>
        <div><button className="danger" disabled={erase.trim().toUpperCase() !== 'ERASE'} onClick={eraseDevice}>Erase all data</button></div>
      </section>
    </div>
  );
}
