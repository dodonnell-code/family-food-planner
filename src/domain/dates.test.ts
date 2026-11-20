import { describe, expect, it } from 'vitest';
import { parseTypedDate } from './dates';

describe('typed dates', () => {
  it('reads the ways best-by dates are printed', () => {
    expect(parseTypedDate('3/1/29')).toBe('2029-03-01');
    expect(parseTypedDate('03/01/2029')).toBe('2029-03-01');
    expect(parseTypedDate('3-1-2029')).toBe('2029-03-01');
    expect(parseTypedDate('2029-03-01')).toBe('2029-03-01');
    expect(parseTypedDate('March 1, 2029')).toBe('2029-03-01');
    expect(parseTypedDate('1 MAR 2029')).toBe('2029-03-01');
    expect(parseTypedDate('MAR 01 29')).toBe('2029-03-01');
  });
  it('month and year only means the end of that month', () => {
    expect(parseTypedDate('03/2029')).toBe('2029-03-31');
    expect(parseTypedDate('MAR 2029')).toBe('2029-03-31');
    expect(parseTypedDate('Feb 28')).toBe('2028-02-29');
    expect(parseTypedDate('2029-02')).toBe('2029-02-28');
  });
  it('rejects what it can’t read', () => {
    expect(parseTypedDate('')).toBeUndefined();
    expect(parseTypedDate('13/1/2029')).toBeUndefined();
    expect(parseTypedDate('2/30/2029')).toBeUndefined();
    expect(parseTypedDate('soon')).toBeUndefined();
    expect(parseTypedDate('Mar')).toBeUndefined();
  });
});
