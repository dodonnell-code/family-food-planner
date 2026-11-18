// Looks up this week's flyer items near a zip code, from Flipp (the service behind flipp.com).
// It isn't an official, documented API, so it may change; failures are reported, not hidden.
// Only the zip code and generic food words are sent.
import type { FlyerItem } from '../domain/deals';

const ENDPOINT = 'https://backflipp.wishabi.com/flipp/items/search';
const TTL_MS = 60 * 60_000;
const cache = new Map<string, { at: number; items: FlyerItem[] }>();

export async function searchFlyers(query: string, zip: string, signal?: AbortSignal): Promise<FlyerItem[]> {
  const key = `${zip}|${query}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.items;
  const res = await fetch(`${ENDPOINT}?locale=en-us&postal_code=${zip}&q=${encodeURIComponent(query)}`, { signal });
  if (!res.ok) throw new Error(`Flyer search failed (${res.status})`);
  const data = (await res.json()) as { items?: FlyerItem[] };
  const items = (data.items ?? []).filter((i) => i && typeof i.name === 'string' && typeof i.merchant_name === 'string');
  cache.set(key, { at: Date.now(), items });
  return items;
}

export const clearFlyerCache = () => cache.clear();

/** Run tasks a few at a time (be polite to the service), reporting progress. */
export async function runPooled<T>(tasks: (() => Promise<T>)[], limit: number, onDone?: (done: number) => void): Promise<T[]> {
  const out: T[] = new Array(tasks.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      out[i] = await tasks[i]();
      onDone?.(++done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return out;
}
