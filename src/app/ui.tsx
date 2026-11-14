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
];

export function subjectLabel(subject: string): string {
  return (
    ALLERGENS.find((a) => a.code === subject)?.label ??
    DIET_TAGS.find((d) => d.code === subject)?.label ??
    subject.replace(/^food:/, '')
  );
}

export const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
