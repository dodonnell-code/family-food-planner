import { describe, expect, it } from 'vitest';
import { buildSeedCatalog } from '../data/seedCatalog';
import { DEFAULT_PLANNING } from '../data/repo';
import { buildPlan, type PlanMember } from './planner';
import { planCsv, planJson } from './reports';

const foods = buildSeedCatalog().map((f) => (f.id === 'canned-chili' ? { ...f, name: '=HYPERLINK("x")' } : f));
const sam: PlanMember = {
  id: 'z', name: 'Sam', ratings: {}, ignoredRefusals: [], surveyId: 's',
  restrictions: [{ id: 'r', memberId: 'z', type: 'intolerance', strictness: 'avoid', subject: 'milk', active: true, createdAt: '' }],
  needs: [{ id: 'n', memberId: 'z', domain: 'food', kind: 'rapid-carbs', params: { servingsPerDay: 3 }, confirmed: true, active: true, createdAt: '', updatedAt: '' }],
};
const dan: PlanMember = { id: 'd', name: 'Dan', ratings: {}, ignoredRefusals: [], surveyId: 's2', needs: [], restrictions: [{ id: 'r2', memberId: 'd', type: 'allergy', subject: 'peanut', active: true, createdAt: '' }] };
const plan = buildPlan({ tier: 'medium', scenario: 'limited-cook', days: 14, defaults: { ...DEFAULT_PLANNING }, members: [sam, dan], foods });
const names = new Map([['z', 'Sam'], ['d', 'Dan']]);

describe('family exports leave out sensitive individual data', () => {
  it('CSV', () => {
    const csv = planCsv(plan, 'family', names);
    expect(csv).not.toMatch(/Sam|Dan|Fast-acting|Contains Milk|Peanut|avoid/i);
    expect(csv).toContain('Glucose tablets');
    expect(csv).toContain('Reserved for an individual need');
  });
  it('JSON', () => {
    const json = JSON.stringify(planJson(plan, 'family', { household: 'H', generatedAt: '', names }));
    expect(json).not.toMatch(/Sam|Dan|"z"|Fast-acting|peanut|avoid when possible|verdicts|excluded/i);
  });
  it('detailed exports include them', () => {
    const csv = planCsv(plan, 'detailed', names);
    expect(csv).toContain('Sam: Fast-acting carbs');
    const json = JSON.stringify(planJson(plan, 'detailed', { household: 'H', generatedAt: '', names, profiles: [] }));
    expect(json).toContain('Contains Peanut');
  });
  it('neutralises spreadsheet formulas', () => {
    const csv = planCsv(plan, 'family', names);
    if (csv.includes('HYPERLINK')) expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
