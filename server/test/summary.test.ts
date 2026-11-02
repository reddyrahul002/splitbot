import { describe, expect, it } from 'vitest';
import type { Category } from '@splitbot/shared';
import { spendingSummary } from '../src/domain/summary';
import { expense, settlement } from './helpers';

const dinner = expense('me', { me: 2600, arun: 3800, mei: 2600 }, { category: 'Food & Drink', date: '2026-10-05' });
const lunch = expense('arun', { me: 1500, arun: 1500 }, { category: 'Food & Drink', date: '2026-10-20' });
const uber = expense('mei', { me: 800, mei: 1600 }, { category: 'Transport', date: '2026-11-02' });

describe('spendingSummary by category', () => {
  it('#26 one expense: my share and the group total', () => {
    expect(spendingSummary([dinner]).byCategory).toEqual([{ category: 'Food & Drink', myCents: 2600, totalCents: 9000 }]);
  });

  it('#27 expenses in one category add up', () => {
    expect(spendingSummary([dinner, lunch]).byCategory).toEqual([
      { category: 'Food & Drink', myCents: 4100, totalCents: 12000 },
    ]);
  });

  it('#28 an expense without me adds 0 to my share but counts toward the group total', () => {
    const e = expense('arun', { arun: 1000, mei: 1000 }, { category: 'Shopping' });
    expect(spendingSummary([e]).byCategory).toEqual([{ category: 'Shopping', myCents: 0, totalCents: 2000 }]);
  });

  it('#29 paying for others is not spending: my share is 0', () => {
    const e = expense('me', { arun: 1000, mei: 1000 }, { category: 'Groceries' });
    expect(spendingSummary([e]).myCents).toBe(0);
  });

  it('#30 settlements are not an input', () => {
    // Checked by `npm run typecheck`: the signature takes expenses only.
    // @ts-expect-error a settlement is not an expense
    const passSettlement = () => spendingSummary([settlement('arun', 'me', 500)]);
    expect(passSettlement).toBeTypeOf('function');
    expect(spendingSummary([]).totalCents).toBe(0);
  });

  it('#31 categories follow CATEGORIES order, empty categories left out', () => {
    const other = expense('me', { me: 100 }, { category: 'Other' });
    const travel = expense('me', { me: 200 }, { category: 'Travel' });
    expect(spendingSummary([other, uber, travel, dinner]).byCategory.map((c) => c.category)).toEqual([
      'Food & Drink',
      'Transport',
      'Travel',
      'Other',
    ]);
  });

  it('#39 personId selects whose share counts as "my share"', () => {
    expect(spendingSummary([dinner, lunch], { personId: 'arun' }).byCategory).toEqual([
      { category: 'Food & Drink', myCents: 5300, totalCents: 12000 },
    ]);
  });
});

describe('spendingSummary by month', () => {
  it('#32 groups by month, oldest first', () => {
    expect(spendingSummary([uber, dinner, lunch]).byMonth).toEqual([
      { month: '2026-10', myCents: 4100, totalCents: 12000 },
      { month: '2026-11', myCents: 800, totalCents: 2400 },
    ]);
  });

  it('#33 fills empty months in between with zeros', () => {
    const jan = expense('me', { me: 100 }, { date: '2026-01-15' });
    const mar = expense('me', { me: 300 }, { date: '2026-03-01' });
    expect(spendingSummary([mar, jan]).byMonth).toEqual([
      { month: '2026-01', myCents: 100, totalCents: 100 },
      { month: '2026-02', myCents: 0, totalCents: 0 },
      { month: '2026-03', myCents: 300, totalCents: 300 },
    ]);
  });

  it('#34 works across a year boundary', () => {
    const dec = expense('me', { me: 100 }, { date: '2025-11-30' });
    const jan = expense('me', { me: 200 }, { date: '2026-01-01' });
    expect(spendingSummary([dec, jan]).byMonth.map((m) => m.month)).toEqual(['2025-11', '2025-12', '2026-01']);
  });
});

describe('spendingSummary date range', () => {
  it('#35 the range includes both ends', () => {
    const s = spendingSummary([dinner, lunch, uber], { from: '2026-10-05', to: '2026-10-20' });
    expect(s.totalCents).toBe(12000);
    expect(spendingSummary([dinner, lunch, uber], { from: '2026-10-06', to: '2026-11-01' }).totalCents).toBe(3000);
  });

  it('#36 only from, or only to', () => {
    expect(spendingSummary([dinner, lunch, uber], { from: '2026-10-20' }).totalCents).toBe(5400);
    expect(spendingSummary([dinner, lunch, uber], { to: '2026-10-19' }).totalCents).toBe(9000);
  });

  it('#37 from after to throws; no matches gives empty lists and 0 totals', () => {
    expect(() => spendingSummary([dinner], { from: '2026-11-01', to: '2026-10-01' })).toThrow(/after/);
    expect(spendingSummary([dinner], { from: '2027-01-01' })).toEqual({
      myCents: 0,
      totalCents: 0,
      byCategory: [],
      byMonth: [],
    });
  });
});

describe('spendingSummary input validation', () => {
  it('#67 from/to must be YYYY-MM-DD', () => {
    expect(() => spendingSummary([dinner], { from: '2026-10' })).toThrow(RangeError);
    expect(() => spendingSummary([dinner], { to: 'bad' })).toThrow(/"bad"/);
    expect(() => spendingSummary([dinner], { from: '2026-02-30' })).toThrow(RangeError);
  });

  it('#68 a malformed expense date throws instead of looping forever', () => {
    for (const date of ['2026-1-05', '2026-13-01', 'abcd', '2026-02-30']) {
      expect(() => spendingSummary([expense('me', { me: 100 }, { date })])).toThrow(RangeError);
    }
    expect(() => spendingSummary([expense('me', { me: 100 }, { date: '2026-1-05' })])).toThrow(/2026-1-05/);
  });

  it('#69 an unknown expense category throws a clear error', () => {
    const pets = expense('me', { me: 100 }, { category: 'Pets' as Category });
    expect(() => spendingSummary([pets])).toThrow(RangeError);
    expect(() => spendingSummary([pets])).toThrow(/category "Pets"/);
  });
});

describe('spendingSummary totals', () => {
  it('#38 overall totals equal the sums of both lists', () => {
    const s = spendingSummary([dinner, lunch, uber]);
    expect(s.myCents).toBe(4900);
    expect(s.totalCents).toBe(14400);
    for (const list of [s.byCategory, s.byMonth]) {
      expect(list.reduce((sum, r) => sum + r.myCents, 0)).toBe(s.myCents);
      expect(list.reduce((sum, r) => sum + r.totalCents, 0)).toBe(s.totalCents);
    }
  });
});
