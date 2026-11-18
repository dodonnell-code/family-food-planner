// Looks up this week's flyer items near a zip code, from Flipp (the service behind flipp.com).
// It isn't an official, documented API, so it may change; failures are reported, not hidden.
// Only the zip code and generic food words are sent.
import type { FlyerItem, StoreProduct } from '../domain/deals';

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

export const clearFlyerCache = () => { cache.clear(); productCache.clear(); };

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

/**
 * A brand store's public product list (Shopify's products.json), up to 3 pages.
 * Throws if the store doesn't answer or doesn't publish one.
 */
export async function storeProducts(base: string, signal?: AbortSignal): Promise<StoreProduct[]> {
  const key = `store|${base}`;
  const hit = productCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.products;
  const all: StoreProduct[] = [];
  for (let page = 1; page <= 3; page++) {
    const res = await fetch(`${base}/products.json?limit=250&page=${page}`, { signal });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = (await res.json()) as { products?: StoreProduct[] };
    const batch = Array.isArray(data.products) ? data.products : [];
    all.push(...batch);
    if (batch.length < 250) break;
  }
  productCache.set(key, { at: Date.now(), products: all });
  return all;
}
const productCache = new Map<string, { at: number; products: StoreProduct[] }>();
