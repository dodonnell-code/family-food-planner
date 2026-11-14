// Registry of per-member needs. Designed to grow beyond food: add a domain and new kinds
// here (e.g. 'medical' → 'medication-cooling', 'equipment' → 'mobility-aid') and the
// member screen, storage and backups pick them up without schema changes. Planning
// modules for each domain read the needs they understand and ignore the rest.

export type NeedDomain = 'food' | 'medical' | 'equipment' | 'other';

export const NEED_DOMAINS: { domain: NeedDomain; label: string; enabled: boolean }[] = [
  { domain: 'food', label: 'Food', enabled: true },
  // Future areas — flip `enabled` and add kinds below when ready.
  { domain: 'medical', label: 'Medical', enabled: false },
  { domain: 'equipment', label: 'Equipment', enabled: false },
  { domain: 'other', label: 'Other', enabled: false },
];

export interface NeedParamDef {
  key: string;
  label: string;
  type: 'number' | 'text';
  min?: number;
  max?: number;
  /** Placeholder default; flagged "unconfirmed" until the admin sets/keeps it. */
  placeholder?: number | string;
  help?: string;
}

export interface NeedKindDef {
  kind: string;
  domain: NeedDomain;
  label: string;
  description: string;
  params?: NeedParamDef[];
  /** Whether more than one of this kind per member makes sense. */
  multiple?: boolean;
}

export const NEED_KINDS: NeedKindDef[] = [
  {
    kind: 'rapid-carbs',
    domain: 'food',
    label: 'Fast-acting carbs on hand',
    description: 'For low blood sugar. Reserved for this person in every plan and listed separately from shared food.',
    params: [{ key: 'servingsPerDay', label: 'Servings to reserve per day', type: 'number', min: 1, max: 20, placeholder: 3, help: 'Use the amount from their care plan.' }],
  },
  {
    kind: 'carb-counting',
    domain: 'food',
    label: 'Carb counts for meals',
    description: 'Shows carbs per serving and favors foods with consistent, labeled carbs.',
  },
  {
    kind: 'infant-formula',
    domain: 'food',
    label: 'Infant formula',
    description: 'Plans formula separately; never substituted with other foods.',
    params: [{ key: 'product', label: 'Formula product (optional)', type: 'text' }],
  },
  {
    kind: 'texture-modified',
    domain: 'food',
    label: 'Soft or texture-modified food',
    description: 'Limits this person to foods suitable for their texture needs.',
    params: [{ key: 'detail', label: 'Texture detail (optional)', type: 'text', help: 'e.g. soft, minced, puréed' }],
  },
  {
    kind: 'specialty-formula',
    domain: 'food',
    label: 'Specialty / medical nutrition product',
    description: 'A specific nutrition product that must be stocked for this person.',
    params: [
      { key: 'product', label: 'Product', type: 'text' },
      { key: 'servingsPerDay', label: 'Servings per day', type: 'number', min: 1, max: 20 },
    ],
    multiple: true,
  },
  {
    kind: 'other-food',
    domain: 'food',
    label: 'Other food need',
    description: 'Anything else the plan should account for.',
    params: [{ key: 'detail', label: 'Describe the need', type: 'text' }],
    multiple: true,
  },
];

export const needKind = (kind: string) => NEED_KINDS.find((k) => k.kind === kind);
