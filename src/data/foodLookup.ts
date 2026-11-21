// Looks foods up in USDA FoodData Central (US packaged foods, from their labels). Only what the
// admin types (a food name or barcode) is sent; nothing about the family.
import { fromFdc, type FdcFood, type LookupResult } from '../domain/foodLookup';

const SEARCH = 'https://api.nal.usda.gov/fdc/v1/foods/search';
// A free key from api.data.gov raises the hourly limit; DEMO_KEY works for a few lookups an hour.
const KEY = (import.meta.env.VITE_FDC_API_KEY as string | undefined)?.trim() || 'DEMO_KEY';

const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason); }, { once: true });
});

export async function lookupFoods(query: string, signal?: AbortSignal): Promise<LookupResult[]> {
  const q = query.trim();
  if (!q) throw new Error('Type a food name or the barcode number.');
  const params = new URLSearchParams({ api_key: KEY, query: q, dataType: 'Branded', pageSize: '15' });
  let res: Response | undefined;
  // The USDA gateway sometimes answers 502/503/504 for a moment: try twice more before giving up.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await wait(attempt * 1500, signal);
    try {
      res = await fetch(`${SEARCH}?${params}`, { signal });
    } catch (x) {
      if (signal?.aborted) throw x;
      if (attempt < 2) continue;
      throw new Error('Couldn’t reach the USDA food database. Check the internet connection, or fill it in from the label.');
    }
    if (res.status < 500) break;
  }
  if (!res) throw new Error('Couldn’t reach the USDA food database. Try again, or fill it in from the label.');
  if (res.status === 429) {
    throw new Error(KEY === 'DEMO_KEY'
      ? 'The free USDA lookups are used up for now (about 10 an hour). Try again in an hour, or fill it in from the label. A free API key raises the limit.'
      : 'The USDA food database has had too many lookups this hour. Try again later, or fill it in from the label.');
  }
  if (res.status >= 500) throw new Error(`The USDA food database is having trouble right now (error ${res.status}). Try again in a few minutes, or fill it in from the label.`);
  if (!res.ok) throw new Error(`The USDA food database didn’t answer (error ${res.status}). Try again, or fill it in from the label.`);
  const data = (await res.json()) as { foods?: FdcFood[] };
  // Many store brands share one record shape: drop exact repeats.
  const seen = new Set<string>();
  return (data.foods ?? []).map(fromFdc).filter((r) => {
    const k = [r.name, r.brand, r.packageDesc, r.servingDesc, r.nutrition.caloriesPerServing].join('|').toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
