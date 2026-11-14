import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Service-worker status. The app updates only when someone taps "Update", and the prompt
 * is hidden during surveys so a respondent is never interrupted.
 */
export default function UpdatePrompt() {
  const { pathname } = useLocation();
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // Look for updates hourly while the app is open (only when online).
      if (reg) window.setInterval(() => { if (navigator.onLine) reg.update().catch(() => undefined); }, 60 * 60_000);
    },
  });

  useEffect(() => {
    if (!offlineReady) return;
    const t = window.setTimeout(() => setOfflineReady(false), 6000);
    return () => window.clearTimeout(t);
  }, [offlineReady, setOfflineReady]);

  if (pathname.startsWith('/survey')) return null;
  if (!offlineReady && !needRefresh) return null;
  return (
    <div className="update-toast no-print" role="status">
      {needRefresh ? (
        <>
          <span>A new version of the planner is ready. Your data stays as it is.</span>
          <span className="row" style={{ gap: 8 }}>
            <button className="primary" onClick={() => updateServiceWorker(true)}>Update now</button>
            <button className="ghost" onClick={() => setNeedRefresh(false)}>Later</button>
          </span>
        </>
      ) : (
        <span>Ready to work offline.</span>
      )}
    </div>
  );
}
