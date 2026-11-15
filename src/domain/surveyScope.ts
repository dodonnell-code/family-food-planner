// Which food groups the survey asks about (in survey order). Baking supplies & seasonings aren't
// asked; condiments are.
import type { FoodCategory } from './types';

export type SurveyedCategory = Exclude<FoodCategory, 'pantry'>;

export const SURVEYED_CATEGORIES: SurveyedCategory[] = [
  'protein', 'legume', 'grain', 'fruit', 'vegetable', 'meal', 'fat-snack', 'dairy-alt', 'beverage', 'condiment',
];

export const isSurveyed = (c: FoodCategory): c is SurveyedCategory => (SURVEYED_CATEGORIES as FoodCategory[]).includes(c);
