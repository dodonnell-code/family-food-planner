import type { Allergen, Member, RestrictionType } from '../domain/types';

export const MEMBER_COLORS = ['#2f6b4f', '#3b5ba5', '#a0522d', '#7a4ca0', '#b03a5b', '#2a7f8f', '#8a6d1d', '#55606b'];

export const firstName = (m: Pick<Member, 'displayName' | 'preferredName'>) =>
  m.preferredName || m.displayName.split(/\s+/)[0];

export function Avatar({ member, size = 44 }: { member: Pick<Member, 'displayName' | 'preferredName' | 'color'>; size?: number }) {
  return (
    <span className="avatar" aria-hidden style={{ background: member.color ?? MEMBER_COLORS[0], width: size, height: size, fontSize: size * 0.42 }}>
      {firstName(member).charAt(0).toUpperCase()}
    </span>
  );
}

export const ALLERGENS: { code: Allergen; label: string }[] = [
  { code: 'peanut', label: 'Peanut' },
  { code: 'tree-nut', label: 'Tree nuts' },
  { code: 'milk', label: 'Milk / dairy' },
  { code: 'egg', label: 'Egg' },
  { code: 'wheat', label: 'Wheat' },
  { code: 'gluten', label: 'Gluten' },
  { code: 'soy', label: 'Soy' },
  { code: 'fish', label: 'Fish' },
  { code: 'shellfish', label: 'Shellfish' },
  { code: 'sesame', label: 'Sesame' },
  { code: 'corn', label: 'Corn' },
  { code: 'mustard', label: 'Mustard' },
];

export const DIET_TAGS: { code: string; label: string }[] = [
  { code: 'diet:vegetarian', label: 'Vegetarian' },
  { code: 'diet:vegan', label: 'Vegan' },
  { code: 'no:pork', label: 'No pork' },
  { code: 'no:beef', label: 'No beef' },
  { code: 'no:fish', label: 'No fish / seafood' },
  { code: 'texture:soft', label: 'Soft foods only' },
];

export const RESTRICTION_TYPES: { code: RestrictionType; label: string }[] = [
  { code: 'allergy', label: 'Allergy' },
  { code: 'intolerance', label: 'Intolerance' },
  { code: 'special-diet', label: 'Special diet' },
  { code: 'religious-ethical', label: 'Religious / ethical' },
  { code: 'cannot-eat', label: 'Cannot eat (specific food)' },
  { code: 'texture', label: 'Texture / chewing / swallowing' },
  { code: 'medical-feeding', label: 'Medical feeding need' },
  { code: 'dislike', label: 'Don’t like (not a safety issue)' },
];

export const STRICTNESS: { code: import('../domain/types').Strictness; label: string; help: string }[] = [
  { code: 'strict', label: 'Strict: treat like an allergy', help: 'Never used in group meals, so not stocked.' },
  { code: 'avoid', label: 'Avoid when possible', help: 'Counts heavily against a food; used only without a good alternative, and flagged.' },
  { code: 'minor', label: 'Barely an inconvenience', help: 'Counts a little against a food; mostly a tie-breaker.' },
];

/** Preference-only restriction types: no severity, cross-contact or confirmation. */
export const isPreferenceOnly = (t: RestrictionType) => t === 'dislike';

/** "Contains wheat, milk · May contain egg" for a planned item (empty if none listed). */
/** Nutrition facts per serving, and which ones are missing. */
export function nutritionFacts(n: { servingDesc: string; caloriesPerServing: number; proteinG?: number; carbsG?: number; fatG?: number; satFatG?: number; fiberG?: number; sugarG?: number; sodiumMg?: number }) {
  const f = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 1 });
  const all: [string, number | undefined, string][] = [
    ['protein', n.proteinG, 'g'], ['carbs', n.carbsG, 'g'], ['fat', n.fatG, 'g'], ['sat. fat', n.satFatG, 'g'],
    ['fiber', n.fiberG, 'g'], ['sugar', n.sugarG, 'g'], ['sodium', n.sodiumMg, 'mg'],
  ];
  const have = all.filter(([, v]) => v !== undefined).map(([k, v, u]) => `${k} ${f(v!)} ${u}`);
  return { text: [`${f(n.caloriesPerServing)} kcal`, ...have].join(' · '), missing: all.filter(([, v]) => v === undefined).map(([k]) => k) };
}

/** The kinds line for a generic food on the shopping list. */
export function kindsSummary(kinds?: { name: string; icon?: string; likedBy: string[]; notFor: string[] }[]) {
  if (!kinds?.length) return undefined;
  const label = (k: { name: string; icon?: string }) => `${k.icon ? `${k.icon} ` : ''}${k.name}`;
  const safe = kinds.filter((k) => !k.notFor.length);
  const liked = safe.filter((k) => k.likedBy.length).sort((a, b) => b.likedBy.length - a.likedBy.length);
  const buy = liked.length
    ? `Buy a mix of: ${liked.map((k) => `${label(k)} (${k.likedBy.join(', ')})`).join(' · ')}`
    : `No kinds picked in surveys yet. Any of: ${safe.map(label).join(', ')}`;
  const skip = kinds.filter((k) => k.notFor.length).map((k) => `${label(k)}: not safe for ${k.notFor.join('; ')}`);
  return { buy, skip };
}

export function allergenLine(a?: { contains: string[]; mayContain: string[] }): string {
  if (!a) return '';
  const parts: string[] = [];
  if (a.contains.length) parts.push(`Contains ${a.contains.map(subjectLabel).join(', ')}`);
  if (a.mayContain.length) parts.push(`May contain ${a.mayContain.map(subjectLabel).join(', ')}`);
  return parts.join(' · ');
}

export function subjectLabel(subject: string): string {
  return (
    ALLERGENS.find((a) => a.code === subject)?.label ??
    DIET_TAGS.find((d) => d.code === subject)?.label ??
    subject.replace(/^food:/, '')
  );
}

export const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
