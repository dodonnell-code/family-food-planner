import { useId, useRef } from 'react';
import { parseTypedDate } from '../domain/dates';
import { fmtDate } from './ui';

/** ISO date → how it's shown in a typed field ("03/01/2029"). */
export const typedDate = (iso?: string) => (iso ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}` : '');

/** The typed text as YYYY-MM-DD ('' when empty); throws a friendly error when it can't be read. */
export function readTypedDate(text: string, what = 'date'): string {
  if (!text.trim()) return '';
  const d = parseTypedDate(text);
  if (!d) throw new Error(`Couldn’t read the ${what} “${text}”. Try 03/01/2029 or Mar 2029.`);
  return d;
}

/**
 * A date that can be typed the way it's printed on the label (3/1/29, 03/2029, MAR 2029), or
 * picked from a calendar. The value is the typed text; read it with readTypedDate on save.
 */
export function DateField({ label, value, onChange, maxWidth = 240 }: { label: string; value: string; onChange: (text: string) => void; maxWidth?: number }) {
  const id = useId();
  const picker = useRef<HTMLInputElement>(null);
  const parsed = value.trim() ? parseTypedDate(value) : undefined;
  return (
    <div className="stack" style={{ gap: 4, maxWidth, flex: '1 1 180px' }}>
      <label htmlFor={id}>{label}</label>
      <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
        <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder="MM/DD/YYYY" inputMode="text" autoComplete="off"
          aria-invalid={!!value.trim() && !parsed} style={{ minWidth: 0 }} />
        <button type="button" aria-label="Pick from a calendar" style={{ flex: 'none', padding: '0 12px' }}
          onClick={() => { const p = picker.current; if (!p) return; try { p.showPicker(); } catch { p.focus(); p.click(); } }}>📅</button>
        <input ref={picker} type="date" tabIndex={-1} aria-hidden value={parsed ?? ''} onChange={(e) => onChange(typedDate(e.target.value))}
          style={{ position: 'absolute', opacity: 0, width: 1, height: 1, pointerEvents: 'none' }} />
      </div>
      {value.trim() && <span className="small" style={{ color: parsed ? 'var(--muted)' : 'var(--danger)' }}>{parsed ? fmtDate(parsed) : 'Try 03/01/2029 or Mar 2029'}</span>}
    </div>
  );
}
