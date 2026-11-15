// Family requests from the survey's "Your ideas" step: foods to add and comfort meals.
// Pure helpers; loading lives in data/requestsRepo.ts.
import type { FoodItem, ID } from './types';

export type RequestKind = 'foodsToAdd' | 'comfortMeals';

export const REQUEST_LABEL: Record<RequestKind, string> = {
  foodsToAdd: 'Foods to add',
  comfortMeals: 'Comfort meals',
};

export interface FamilyRequest {
  /** Stable per survey answer, used to mark it done. */
  key: string;
  memberId: ID;
  memberName: string;
  kind: RequestKind;
  text: string;
  surveyCompletedAt?: string;
}

const STOP = new Set(['and', 'the', 'with', 'for', 'some', 'like', 'any', 'more', 'food', 'foods', 'canned', 'dry', 'dried', 'instant', 'shelf', 'stable', 'pouch', 'pouches', 'packets', 'mix', 'assorted', 'cans']);
const words = (s: string) => s.toLowerCase().replace(/&/g, ' and ').split(/[^a-z]+/).filter((w) => w.length >= 3 && !STOP.has(w));
const stem = (w: string) => w.replace(/(es|s)$/, '');

/** Catalog foods whose name or examples share a meaningful word with the request (best first). */
export function matchFoods(text: string, foods: FoodItem[], limit = 3): FoodItem[] {
  const want = new Set(words(text).map(stem));
  if (!want.size) return [];
  return foods
    .filter((f) => f.active)
    .map((f) => {
      const nameHits = words(f.name).map(stem).filter((w) => want.has(w)).length;
      const exHits = words(f.examples ?? '').map(stem).filter((w) => want.has(w)).length;
      return { f, score: nameHits * 2 + exHits };
    })
    .filter((x) => x.score > 0)
    .sort((a, z) => z.score - a.score || a.f.name.localeCompare(z.f.name))
    .slice(0, limit)
    .map((x) => x.f);
}
