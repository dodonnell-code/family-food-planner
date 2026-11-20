// Typed dates, the way best-by dates are printed on labels: "3/1/29", "03/01/2029", "03/2029",
// "MAR 2029", "1 Mar 2029", "March 1, 2029", "2029-03-01". A date with only a month and year
// means the last day of that month (the food is good through that month).
import type { ISODate } from './types';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const pad = (n: number) => String(n).padStart(2, '0');
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

function year(s: string): number | undefined {
  const n = Number(s);
  if (!Number.isInteger(n)) return undefined;
  if (s.length === 2) return 2000 + n;
  if (s.length === 4 && n >= 1990 && n <= 2199) return n;
  return undefined;
}

function iso(y: number | undefined, m: number, d?: number): ISODate | undefined {
  if (!y || m < 1 || m > 12) return undefined;
  const day = d ?? daysIn(y, m);
  if (day < 1 || day > daysIn(y, m)) return undefined;
  return `${y}-${pad(m)}-${pad(day)}`;
}

function month(s: string): number | undefined {
  const i = MONTHS.indexOf(s.slice(0, 3).toLowerCase());
  return i >= 0 && /^[a-z]+\.?$/i.test(s) ? i + 1 : undefined;
}

/** A typed date as YYYY-MM-DD, or undefined when it can't be read. US order (month first). */
export function parseTypedDate(input: string): ISODate | undefined {
  const s = input.trim().replace(/,/g, ' ').replace(/\s+/g, ' ');
  if (!s) return undefined;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return iso(year(m[1]), Number(m[2]), Number(m[3]));
  if ((m = s.match(/^(\d{4})-(\d{1,2})$/))) return iso(year(m[1]), Number(m[2]));
  if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/))) return iso(year(m[3]), Number(m[1]), Number(m[2]));
  if ((m = s.match(/^(\d{1,2})[/.-](\d{4})$/))) return iso(year(m[2]), Number(m[1]));
  // Month names: "Mar 2029", "March 1 2029", "1 Mar 2029", "MAR 01 29".
  const parts = s.split(/[ /.-]+/);
  if (parts.length === 2) {
    const mo = month(parts[0]);
    if (mo) return iso(year(parts[1]), mo);
  }
  if (parts.length === 3) {
    const [a, b, c] = parts;
    if (month(a) && /^\d{1,2}$/.test(b)) return iso(year(c), month(a)!, Number(b));
    if (month(b) && /^\d{1,2}$/.test(a)) return iso(year(c), month(b)!, Number(a));
  }
  return undefined;
}
