import { describe, expect, it } from 'vitest';
import { formatCents, toCents } from '../src/domain/money';

describe('money', () => {
  it('#1 toCents converts dollars to integer cents without float drift', () => {
    expect(toCents(90)).toBe(9000);
    expect(toCents(12.5)).toBe(1250);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(19.999)).toBe(2000);
    expect(toCents(1.005)).toBe(101);
    expect(toCents(-12)).toBe(-1200);
  });

  it('#2 formatCents renders dollars with two decimals', () => {
    expect(formatCents(3800)).toBe('$38.00');
    expect(formatCents(5)).toBe('$0.05');
    expect(formatCents(-1200)).toBe('-$12.00');
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(180000)).toBe('$1,800.00');
  });

  it('#33 toCents normalizes -0 to 0', () => {
    expect(toCents(-0.001)).toBe(0);
    expect(toCents(-0)).toBe(0);
  });

  it('#34 toCents rejects NaN and Infinity', () => {
    expect(() => toCents(NaN)).toThrow(RangeError);
    expect(() => toCents(Infinity)).toThrow(RangeError);
    expect(() => toCents(-Infinity)).toThrow(RangeError);
  });

  it('#35 formatCents rejects non-integer cents', () => {
    expect(() => formatCents(12.5)).toThrow(RangeError);
    expect(() => formatCents(NaN)).toThrow(RangeError);
    expect(() => formatCents(Infinity)).toThrow(RangeError);
  });
});
