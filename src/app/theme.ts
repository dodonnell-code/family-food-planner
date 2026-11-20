// Appearance: follow the device (System), or always Light / Dark. A per-device preference, so it lives
// in localStorage (index.html applies it before the first paint); if storage is unavailable the app
// simply follows the device.
import { useSyncExternalStore } from 'react';

export type Theme = 'system' | 'light' | 'dark';
export const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: 'Match device' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const KEY = 'theme';
const listeners = new Set<() => void>();

function read(): Theme {
  try { const t = localStorage.getItem(KEY); return t === 'light' || t === 'dark' ? t : 'system'; } catch { return 'system'; }
}

export function setTheme(t: Theme) {
  try { if (t === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, t); } catch { /* not saved; still applies now */ }
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  current = t;
  listeners.forEach((l) => l());
}

let current = read();
export function useTheme(): Theme {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => current);
}

/** Light ↔ dark, starting from what's on screen now (for the one-tap button). */
export function toggleTheme() {
  const dark = document.documentElement.dataset.theme === 'dark'
    || (!document.documentElement.dataset.theme && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  setTheme(dark ? 'light' : 'dark');
}
