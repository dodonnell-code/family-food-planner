// Deal links for the shopping list: one-tap searches at the family's stores and in local
// weekly flyers. Nothing is fetched here; the links open the store's own site, which uses
// whatever store the person picked there. Flipp takes a zip, so it shows sales near you.
import type { KindNote } from './planner';

export interface Store {
  id: string;
  name: string;
  search: (q: string) => string;
  weeklyAd: string;
  /** Store finder, near a zip where the site supports it. */
  finder: (zip?: string) => string;
  /** Couponer sites that round up this store's deals and coupon matchups. */
  couponers: { name: string; url: string }[];
}

const kcl = (store: string) => ({ name: 'Krazy Coupon Lady', url: `https://thekrazycouponlady.com/coupons-for/${store}` });

const enc = encodeURIComponent;

export const STORES: Store[] = [
  {
    id: 'meijer', name: 'Meijer',
    search: (q) => `https://www.meijer.com/shopping/search.html?text=${enc(q)}`,
    weeklyAd: 'https://www.meijer.com/shopping/weekly-ads.html',
    finder: () => 'https://www.meijer.com/shopping/store-finder.html',
    couponers: [kcl('meijer')],
  },
  {
    id: 'aldi', name: 'Aldi',
    search: (q) => `https://www.aldi.us/store/aldi/s?k=${enc(q)}`,
    weeklyAd: 'https://www.aldi.us/store/aldi/flyers/view/weekly/print',
    finder: (zip) => (zip ? `https://info.aldi.us/stores?q=${zip}` : 'https://info.aldi.us/stores'),
    couponers: [kcl('aldi')],
  },
  {
    id: 'kroger', name: 'Kroger',
    search: (q) => `https://www.kroger.com/search?query=${enc(q)}`,
    weeklyAd: 'https://www.kroger.com/weeklyad',
    finder: (zip) => (zip ? `https://www.kroger.com/stores/search?searchText=${zip}` : 'https://www.kroger.com/stores/search'),
    couponers: [kcl('kroger'), { name: 'I Heart Kroger', url: 'https://www.iheartkroger.com/' }],
  },
  {
    id: 'walmart', name: 'Walmart',
    search: (q) => `https://www.walmart.com/search?q=${enc(q)}`,
    weeklyAd: 'https://www.walmart.com/shop/deals',
    finder: (zip) => (zip ? `https://www.walmart.com/store-finder?location=${zip}` : 'https://www.walmart.com/store-finder'),
    couponers: [kcl('walmart')],
  },
];

/** Weekly-flyer sale prices from stores near a zip (covers Meijer, Aldi, Kroger, Walmart and others). */
export const flyerSearch = (q: string, zip?: string) => `https://flipp.com/search/${enc(q)}${zip ? `?postal_code=${zip}` : ''}`;

/** Couponer write-ups that mention an item (deals, coupon stacks, price drops). */
export const couponerSearch = (q: string) => `https://hip2save.com/?s=${enc(q).replace(/%20/g, '+')}`;

/** Clearance and markdown finder (mismarked and hidden-clearance prices). Needs a free account. */
export const CLEARANCE_FINDER = { name: 'BrickSeek', url: 'https://brickseek.com/' };

export const validZip = (z: string) => /^\d{5}$/.test(z.trim());

const plain = (s: string) => s.replace(/\s*\([^)]*\)/g, '').trim();

/** "Canned fish" + "Tuna" → "canned tuna"; "Jelly" + "Grape" → "grape jelly". */
export function kindTerm(foodName: string, kindName: string): string {
  const food = plain(foodName).toLowerCase();
  const kind = plain(kindName).toLowerCase();
  if (food.startsWith('canned ')) return kind.startsWith('canned ') ? kind : `canned ${kind}`;
  return kind.includes(food.replace(/s$/, '')) ? kind : `${kind} ${food}`;
}

/**
 * What to search for: the food itself, plus the kinds the family likes (or, if nobody picked
 * any, every kind). Kinds that aren't safe for someone are left out.
 */
export function searchTerms(foodName: string, kinds?: KindNote[], max = 4): { main: string; kinds: string[] } {
  const main = plain(foodName).toLowerCase();
  const safe = (kinds ?? []).filter((k) => !k.notFor.length);
  const liked = safe.filter((k) => k.likedBy.length).sort((a, b) => b.likedBy.length - a.likedBy.length);
  const pick = (liked.length ? liked : safe).slice(0, max);
  return { main, kinds: [...new Set(pick.map((k) => kindTerm(foodName, k.name)))] };
}
