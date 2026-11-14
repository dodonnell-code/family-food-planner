// Report shaping — scope §8/§10. The family report leaves out sensitive individual data
// (who has which restriction, health needs, notes). The detailed report is Admin-only and
// must be chosen explicitly.
import { BUCKET_LABEL, type Bucket, type PlanResult, type ReservedItem } from './planner';
import { SCHEMA_VERSION } from './types';

export type ReportMode = 'family' | 'detailed';

export interface PrivateProfile {
  memberId: string;
  name: string;
  details: { label: string; value: string }[];
  restrictions: string[];
  needs: string[];
  conditions: string[];
  notes?: string;
}

/** What a reserved item looks like in a report. Family reports don't say who or why. */
export function reservedLine(r: ReservedItem, mode: ReportMode, names: Map<string, string>) {
  if (mode === 'detailed') {
    return { what: r.foodName ?? r.manual ?? r.label, buy: r.packages ? `${r.packages} × ${r.packageDesc}` : 'Add by hand', note: `${names.get(r.memberId) ?? 'Someone'}: ${r.label}${r.servings ? `, ${r.servings} servings` : ''}` };
  }
  return { what: r.foodName ?? 'Individual item (see detailed report)', buy: r.packages ? `${r.packages} × ${r.packageDesc}` : 'Add by hand', note: 'Reserved for an individual need. Store separately and label.' };
}

/** Flags safe to show in a family report (no names or personal details). */
export const publicFlags = (flags: string[]) => flags.filter((f) => f.startsWith('Keeps up to'));

const csvCell = (v: unknown) => {
  const s = v === undefined || v === null ? '' : String(v);
  // Prevent spreadsheet formula injection and quote as needed.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const csvRow = (cells: unknown[]) => cells.map(csvCell).join(',');

export function planCsv(r: PlanResult, mode: ReportMode, names: Map<string, string>): string {
  const head = ['Group', 'Food', 'Packages', 'Package', 'Servings', 'Spare servings', 'Prep water (gal)', 'Needs cooking', 'Carbs per serving (g)', 'Keeps (unopened)', 'Notes'];
  if (mode === 'detailed') head.push('Score', 'Confidence');
  const rows = [csvRow(head)];
  const order = Object.keys(BUCKET_LABEL) as Bucket[];
  for (const i of [...r.items].sort((a, b) => order.indexOf(a.bucket) - order.indexOf(b.bucket))) {
    const notes = mode === 'detailed' ? i.flags : publicFlags(i.flags);
    const row: unknown[] = [BUCKET_LABEL[i.bucket], i.name, i.packages, i.packageDesc, i.servings, i.leftoverServings, i.prepWaterGallons, i.needsFuel ? 'yes' : 'no', i.carbsG ?? '', i.shelfLife, notes.join('; ')];
    if (mode === 'detailed') row.push(i.score, i.confidence);
    rows.push(csvRow(row));
  }
  for (const x of r.reserved) {
    const l = reservedLine(x, mode, names);
    rows.push(csvRow(['Individual needs', l.what, x.packages ?? '', x.packageDesc ?? '', x.servings ?? '', '', '', '', '', '', l.note]));
  }
  // Excel opens UTF-8 CSV correctly with a BOM.
  return '﻿' + rows.join('\r\n') + '\r\n';
}

export function planJson(r: PlanResult, mode: ReportMode, ctx: { household: string; generatedAt: string; names: Map<string, string>; profiles?: PrivateProfile[] }) {
  const base = {
    schemaVersion: SCHEMA_VERSION,
    kind: mode === 'detailed' ? 'detailed-plan-report' : 'family-plan-report',
    generatedAt: ctx.generatedAt,
    household: ctx.household,
    engineVersion: r.engineVersion,
    tier: r.tier, scenario: r.scenario, days: r.days, people: r.people,
    calories: { target: r.targetCalories, planned: r.plannedCalories },
    water: r.water, fuel: r.fuel, equipment: r.equipment, storage: r.storage, cost: r.cost,
  };
  if (mode === 'detailed') {
    return { ...base, items: r.items, reserved: r.reserved.map((x) => ({ ...x, memberName: ctx.names.get(x.memberId) })), coverage: r.coverage, excluded: r.excluded, warnings: r.warnings, profiles: ctx.profiles ?? [] };
  }
  return {
    ...base,
    items: r.items.map((i) => ({ group: BUCKET_LABEL[i.bucket], food: i.name, packages: i.packages, package: i.packageDesc, servings: i.servings, spareServings: i.leftoverServings, prepWaterGallons: i.prepWaterGallons, needsCooking: i.needsFuel, carbsPerServingG: i.carbsG, keeps: i.shelfLife, notes: publicFlags(i.flags) })),
    reserved: r.reserved.map((x) => { const l = reservedLine(x, 'family', ctx.names); return { item: l.what, buy: l.buy, note: l.note }; }),
  };
}
