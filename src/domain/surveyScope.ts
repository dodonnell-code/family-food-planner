// Which food groups the survey asks about (in survey order). Baking supplies & seasonings aren't
// asked; condiments are.
import type { FoodCategory, FoodItem } from './types';

export type SurveyedCategory = Exclude<FoodCategory, 'pantry'>;

export const SURVEYED_CATEGORIES: SurveyedCategory[] = [
  'protein', 'legume', 'grain', 'fruit', 'vegetable', 'meal', 'fat-snack', 'dairy-alt', 'beverage', 'condiment',
];

export const isSurveyed = (c: FoodCategory): c is SurveyedCategory => (SURVEYED_CATEGORIES as FoodCategory[]).includes(c);

/** Foods the survey asks about: active, in a surveyed group, and not catalog-only. */
export const inSurvey = (f: FoodItem) => f.active && !f.catalogOnly && isSurveyed(f.category);
