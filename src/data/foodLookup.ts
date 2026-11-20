// Looks foods up in USDA FoodData Central (US packaged foods, from their labels). Only what the
// admin types (a food name or barcode) is sent; nothing about the family.
import { fromFdc, type FdcFood, type LookupResult } from '../domain/foodLookup';

const SEARCH = 'https://api.nal.usda.gov/fdc/v1/foods/search';
// A free key from api.data.gov raises the hourly limit; DEMO_KEY works for a few lookups an hour.
const KEY = (import.meta.env.VITE_FDC_API_KEY as string | undefined)?.trim() || 'DEMO_KEY';

export async function lookupFoods(query: string, signal?: AbortSignal): Promise<LookupResult[]> {
  const q = query.trim();
  if (!q) throw new Error('Type a food name or the barcode number.');
  const params = new URLSearchParams({ api_key: KEY, query: q, dataType: 'Branded', pageSize: '15' });
  let res: Response;
  try {
    res = await fetch(`${SEARCH}?${params}`, { signal });
  } catch (x) {
    if (signal?.aborted) throw x;
    throw new Error('Couldn’t reach the USDA food database. Check the internet connection, or fill it in from the label.');
  }
  if (res.status === 429) throw new Error('The USDA food database has had too many lookups this hour. Try again later, or fill it in from the label.');
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
