import { describe, expect, it } from 'vitest';
import type { PersonId, Share, SplitInput } from '@splitbot/shared';
import { computeShares, SplitError, type SplitErrorCode } from '../src/domain/split';
import { rng } from './helpers';

const ME = 'me';
const ARUN = 'arun';
const MEI = 'mei';
const KAI = 'kai';
const TRIO = [ME, ARUN, MEI];

/** Base input: payer `me`, participants [me, Arun, Mei], equal split. */
function input(overrides: Partial<SplitInput>): SplitInput {
  return { totalCents: 9000, paidBy: ME, participants: TRIO, splitType: 'equal', ...overrides };
}

function byPerson(shares: Share[]): Record<PersonId, number> {
  return Object.fromEntries(shares.map((s) => [s.personId, s.cents]));
}

function cents(shares: Share[]): number[] {
  return shares.map((s) => s.cents);
}

function expectSplitError(overrides: Partial<SplitInput>, code: SplitErrorCode): SplitError {
  try {
    computeShares(input(overrides));
  } catch (err) {
    expect(err).toBeInstanceOf(SplitError);
    expect((err as SplitError).code).toBe(code);
    return err as SplitError;
  }
  throw new Error(`expected SplitError ${code}, but computeShares returned`);
}

describe('equal split and leftover cents', () => {
  it('#3 splits an even total evenly', () => {
    expect(cents(computeShares(input({ totalCents: 9000 })))).toEqual([3000, 3000, 3000]);
  });

  it('#4 gives the leftover cent to the payer first', () => {
    const shares = computeShares(input({ totalCents: 1000, paidBy: MEI }));
    expect(byPerson(shares)).toEqual({ me: 333, arun: 333, mei: 334 });
  });

  it('#5 splits a single cent, returning zero shares too', () => {
    expect(cents(computeShares(input({ totalCents: 1 })))).toEqual([1, 0, 0]);
  });

  it('#6 gives a single participant the whole total', () => {
    expect(cents(computeShares(input({ totalCents: 1234, participants: [ARUN] })))).toEqual([1234]);
  });

  it('#7 is order-independent for the payer; later leftover cents follow listed order', () => {
    // One leftover cent: always the payer, whatever the order.
    const a = byPerson(computeShares(input({ totalCents: 1000, paidBy: MEI, participants: [ME, ARUN, MEI] })));
    const b = byPerson(computeShares(input({ totalCents: 1000, paidBy: MEI, participants: [ARUN, MEI, ME] })));
    expect(a).toEqual(b);

    // Two leftover cents: payer, then the first-listed non-payer.
    const c = byPerson(computeShares(input({ totalCents: 1001, paidBy: MEI, participants: [ME, ARUN, MEI] })));
    expect(c).toEqual({ me: 334, arun: 333, mei: 334 });
    const d = byPerson(computeShares(input({ totalCents: 1001, paidBy: MEI, participants: [ARUN, MEI, ME] })));
    expect(d).toEqual({ me: 333, arun: 334, mei: 334 });
  });

  it('#7b returns shares in listed participant order', () => {
    const shares = computeShares(input({ totalCents: 1000, paidBy: MEI, participants: [ARUN, MEI, ME] }));
    expect(shares.map((s) => s.personId)).toEqual([ARUN, MEI, ME]);
  });

  it('#32 falls back to listed order when the payer is not a participant', () => {
    const shares = computeShares(input({ totalCents: 1000, paidBy: ME, participants: [ARUN, MEI, KAI] }));
    expect(cents(shares)).toEqual([334, 333, 333]);
  });
});

describe('itemized adjustments', () => {
  it('#8 dinner example: Arun had $12 of drinks', () => {
    const shares = computeShares(input({ totalCents: 9000, adjustments: [{ person: ARUN, cents: 1200, note: 'drinks' }] }));
    expect(byPerson(shares)).toEqual({ me: 2600, arun: 3800, mei: 2600 });
  });

  it('#9 adjustments on two different people', () => {
    const shares = computeShares(
      input({
        totalCents: 9000,
        adjustments: [
          { person: ARUN, cents: 1200 },
          { person: MEI, cents: 300 },
        ],
      }),
    );
    // remainder 7500 → 2500 each
    expect(byPerson(shares)).toEqual({ me: 2500, arun: 3700, mei: 2800 });
  });

  it('#10 two adjustments on the same person add together', () => {
    const shares = computeShares(
      input({
        totalCents: 9000,
        adjustments: [
          { person: ARUN, cents: 1200, note: 'drinks' },
          { person: ARUN, cents: 300, note: 'dessert' },
        ],
      }),
    );
    // remainder 7500 → 2500 each
    expect(byPerson(shares)).toEqual({ me: 2500, arun: 4000, mei: 2500 });
  });

  it('#11 adjustments equal to the total leave everyone else at 0', () => {
    const shares = computeShares(input({ totalCents: 9000, adjustments: [{ person: ARUN, cents: 9000 }] }));
    expect(byPerson(shares)).toEqual({ me: 0, arun: 9000, mei: 0 });
  });

  it('#12 adjustment plus leftover cents', () => {
    const shares = computeShares(input({ totalCents: 1001, adjustments: [{ person: ARUN, cents: 100 }] }));
    // remainder 901 → 301 (payer me) / 300 / 300
    expect(byPerson(shares)).toEqual({ me: 301, arun: 400, mei: 300 });
  });

  it('#13 adjustment combined with a percent split of the remainder', () => {
    const shares = computeShares(
      input({
        totalCents: 10000,
        participants: [ME, ARUN],
        splitType: 'percent',
        percent: { me: 60, arun: 40 },
        adjustments: [{ person: ARUN, cents: 2000 }],
      }),
    );
    // remainder 8000 → 4800 / 3200, then Arun +2000
    expect(byPerson(shares)).toEqual({ me: 4800, arun: 5200 });
  });
});

describe('exact split', () => {
  it('#14 returns amounts that add up to the total as given, including 0', () => {
    const shares = computeShares(input({ totalCents: 9000, splitType: 'exact', exact: { me: 5000, arun: 4000, mei: 0 } }));
    expect(cents(shares)).toEqual([5000, 4000, 0]);
  });

  it('#15 rejects amounts that do not add up, saying how far off in dollars', () => {
    const err = expectSplitError({ splitType: 'exact', exact: { me: 3000, arun: 3000, mei: 2700 } }, 'EXACT_SUM_MISMATCH');
    expect(err.message).toContain('$87.00');
    expect(err.message).toContain('$90.00');
    expect(err.message).toContain('$3.00');
  });

  it('#16 rejects adjustments with an exact split', () => {
    expectSplitError(
      { splitType: 'exact', exact: { me: 3000, arun: 3000, mei: 3000 }, adjustments: [{ person: ARUN, cents: 100 }] },
      'ADJUSTMENTS_WITH_EXACT',
    );
  });
});

describe('percent split', () => {
  it('#17 60/40', () => {
    const shares = computeShares(
      input({ totalCents: 180000, participants: [ME, ARUN], splitType: 'percent', percent: { me: 60, arun: 40 } }),
    );
    expect(cents(shares)).toEqual([108000, 72000]);
  });

  it('#17b allows 0%', () => {
    const shares = computeShares(
      input({ totalCents: 10000, participants: [ME, ARUN], splitType: 'percent', percent: { me: 100, arun: 0 } }),
    );
    expect(cents(shares)).toEqual([10000, 0]);
  });

  it('#18 33.33/33.33/33.34 uses the largest remainder, not payer-first', () => {
    const shares = computeShares(
      input({ totalCents: 1000, splitType: 'percent', percent: { me: 33.33, arun: 33.33, mei: 33.34 } }),
    );
    expect(cents(shares)).toEqual([333, 333, 334]);
  });

  it('#19 50/50 of 101: on a tie the payer gets the cent', () => {
    const shares = computeShares(
      input({ totalCents: 101, paidBy: ARUN, participants: [ME, ARUN], splitType: 'percent', percent: { me: 50, arun: 50 } }),
    );
    expect(byPerson(shares)).toEqual({ me: 50, arun: 51 });
  });

  it('#20 rejects percentages that do not add up to 100', () => {
    expectSplitError({ splitType: 'percent', percent: { me: 30, arun: 30, mei: 30 } }, 'PERCENT_SUM_NOT_100');
  });

  it('#20b rejects a negative percentage', () => {
    expectSplitError({ splitType: 'percent', percent: { me: 110, arun: -10, mei: 0 } }, 'INVALID_AMOUNT');
  });
});

describe('shares split', () => {
  it('#21 2:1:1', () => {
    const shares = computeShares(input({ totalCents: 1000, splitType: 'shares', shares: { me: 2, arun: 1, mei: 1 } }));
    expect(cents(shares)).toEqual([500, 250, 250]);
  });

  it('#22 1:1:1 of 100: the payer gets the leftover cent', () => {
    const shares = computeShares(
      input({ totalCents: 100, paidBy: MEI, splitType: 'shares', shares: { me: 1, arun: 1, mei: 1 } }),
    );
    expect(byPerson(shares)).toEqual({ me: 33, arun: 33, mei: 34 });
  });

  it('#23 rejects zero or negative shares', () => {
    expectSplitError({ splitType: 'shares', shares: { me: 1, arun: 0, mei: 1 } }, 'INVALID_SHARES');
    expectSplitError({ splitType: 'shares', shares: { me: 1, arun: -1, mei: 1 } }, 'INVALID_SHARES');
  });
});

describe('validation', () => {
  it('#24 rejects a zero, negative or fractional-cent total', () => {
    expectSplitError({ totalCents: 0 }, 'INVALID_TOTAL');
    expectSplitError({ totalCents: -500 }, 'INVALID_TOTAL');
    expectSplitError({ totalCents: 100.5 }, 'INVALID_TOTAL');
  });

  it('#25 rejects an empty participant list', () => {
    expectSplitError({ participants: [] }, 'NO_PARTICIPANTS');
  });

  it('#26 rejects a duplicate participant', () => {
    expectSplitError({ participants: [ME, ARUN, ME] }, 'DUPLICATE_PARTICIPANT');
  });

  it('#27 rejects adjustments that add up to more than the total', () => {
    expectSplitError(
      {
        totalCents: 9000,
        adjustments: [
          { person: ARUN, cents: 5000 },
          { person: MEI, cents: 4500 },
        ],
      },
      'ADJUSTMENTS_EXCEED_TOTAL',
    );
  });

  it('#28 rejects an adjustment for someone who is not a participant', () => {
    expectSplitError({ adjustments: [{ person: KAI, cents: 100 }] }, 'ADJUSTMENT_NOT_PARTICIPANT');
  });

  it('#29 rejects a negative adjustment or a non-integer exact amount', () => {
    expectSplitError({ adjustments: [{ person: ARUN, cents: -100 }] }, 'INVALID_AMOUNT');
    expectSplitError({ splitType: 'exact', exact: { me: 3000.5, arun: 2999.5, mei: 3000 } }, 'INVALID_AMOUNT');
  });

  it('#30 rejects a missing split value, or one for a non-participant', () => {
    expectSplitError({ splitType: 'exact', exact: { me: 4500, arun: 4500 } }, 'MISSING_SPLIT_VALUE');
    expectSplitError({ splitType: 'percent' }, 'MISSING_SPLIT_VALUE');
    expectSplitError({ splitType: 'shares', shares: { me: 1, arun: 1, mei: 1, kai: 1 } }, 'UNKNOWN_PERSON_IN_SPLIT_VALUES');
  });
});

describe('Step 1 review follow-ups', () => {
  it('#36 error messages about money are in dollars, never raw cents', () => {
    const rawCents = /\d+(\.\d+)? cents/;
    const cases: [Partial<SplitInput>, string][] = [
      [{ totalCents: 0 }, '$0.00'],
      [{ totalCents: -500 }, '-$5.00'],
      [{ totalCents: 100.5 }, '$1.005'],
      [{ adjustments: [{ person: ARUN, cents: -100 }] }, '-$1.00'],
      [{ splitType: 'exact', exact: { me: 3000.5, arun: 2999.5, mei: 3000 } }, '$30.005'],
    ];
    for (const [overrides, dollars] of cases) {
      const err = expectSplitError(overrides, overrides.totalCents === undefined ? 'INVALID_AMOUNT' : 'INVALID_TOTAL');
      expect(err.message).toContain(dollars);
      expect(err.message).not.toMatch(rawCents);
    }
  });

  it('#37 percent tolerance is checked on the raw percentages, not after rounding', () => {
    // 100.008: within ±0.01, so accepted (rounding to basis points used to reject it).
    const a = computeShares(
      input({ totalCents: 1000, paidBy: MEI, splitType: 'percent', percent: { me: 33.336, arun: 33.336, mei: 33.336 } }),
    );
    expect(byPerson(a)).toEqual({ me: 333, arun: 333, mei: 334 });
    // Exactly 100.01: accepted.
    const b = computeShares(
      input({ totalCents: 101, participants: [ME, ARUN], splitType: 'percent', percent: { me: 50.005, arun: 50.005 } }),
    );
    expect(cents(b)).toEqual([51, 50]);
    // 100.0196: outside the tolerance (rounding to basis points used to accept it).
    expectSplitError(
      { participants: [ME, ARUN, MEI, KAI], splitType: 'percent', percent: { me: 25.0049, arun: 25.0049, mei: 25.0049, kai: 25.0049 } },
      'PERCENT_SUM_NOT_100',
    );
    // 100.012: rejected.
    expectSplitError({ participants: [ME, ARUN], splitType: 'percent', percent: { me: 50.006, arun: 50.006 } }, 'PERCENT_SUM_NOT_100');
  });

  it('#38 33.33 x3 (99.99) is accepted with the payer getting the cent; 33.32 x3 is rejected', () => {
    const shares = computeShares(
      input({ totalCents: 1000, paidBy: MEI, splitType: 'percent', percent: { me: 33.33, arun: 33.33, mei: 33.33 } }),
    );
    expect(byPerson(shares)).toEqual({ me: 333, arun: 333, mei: 334 });
    expectSplitError({ splitType: 'percent', percent: { me: 33.32, arun: 33.32, mei: 33.32 } }, 'PERCENT_SUM_NOT_100');
  });

  it('#39 rejects values given for a different split type', () => {
    const err = expectSplitError({ splitType: 'equal', percent: { me: 90, arun: 5, mei: 5 } }, 'SPLIT_VALUES_TYPE_MISMATCH');
    expect(err.message).toContain('equal');
    expect(err.message).toContain('percent');
    expectSplitError(
      { splitType: 'percent', percent: { me: 50, arun: 25, mei: 25 }, shares: { me: 2, arun: 1, mei: 1 } },
      'SPLIT_VALUES_TYPE_MISMATCH',
    );
    // An empty map carries no values, so it is not a mismatch.
    expect(cents(computeShares(input({ totalCents: 9000, percent: {} })))).toEqual([3000, 3000, 3000]);
  });

  it('#40 rejects shares with more than 3 decimal places, with a clear message', () => {
    const err = expectSplitError({ splitType: 'shares', shares: { me: 0.0001, arun: 1, mei: 1 } }, 'INVALID_SHARES');
    expect(err.message).toContain('3 decimal places');
    const shares = computeShares(input({ totalCents: 3000, splitType: 'shares', shares: { me: 0.001, arun: 1, mei: 1.999 } }));
    expect(cents(shares)).toEqual([1, 1000, 1999]);
  });

  it('#41 fractional shares 1.5:1 of 500', () => {
    const shares = computeShares(input({ totalCents: 500, participants: [ME, ARUN], splitType: 'shares', shares: { me: 1.5, arun: 1 } }));
    expect(cents(shares)).toEqual([300, 200]);
  });

  it('#42 payer not listed first, combined with an adjustment', () => {
    const shares = computeShares(input({ totalCents: 1001, paidBy: MEI, adjustments: [{ person: ARUN, cents: 100 }] }));
    expect(byPerson(shares)).toEqual({ me: 300, arun: 400, mei: 301 });
  });

  it('#43 unknown person or missing map for exact and percent', () => {
    expectSplitError({ splitType: 'exact', exact: { me: 3000, arun: 3000, mei: 3000, kai: 0 } }, 'UNKNOWN_PERSON_IN_SPLIT_VALUES');
    expectSplitError({ splitType: 'percent', percent: { me: 50, arun: 25, mei: 25, kai: 0 } }, 'UNKNOWN_PERSON_IN_SPLIT_VALUES');
    expectSplitError({ splitType: 'exact' }, 'MISSING_SPLIT_VALUE');
  });

  it('#44 rejects an unknown split type', () => {
    expectSplitError({ splitType: 'weird' as SplitInput['splitType'] }, 'INVALID_SPLIT_TYPE');
  });

  it('#45 very large total split 7 ways adds up exactly', () => {
    const seven = [ME, ARUN, MEI, KAI, 'zoe', 'raj', 'li'];
    const shares = computeShares(input({ totalCents: 999_999_999_999, paidBy: MEI, participants: seven }));
    expect(shares.reduce((sum, s) => sum + s.cents, 0)).toBe(999_999_999_999);
    // 999_999_999_999 = 7 × 142_857_142_857, no leftover.
    expect(new Set(cents(shares))).toEqual(new Set([142_857_142_857]));
  });

  it('#46 ids that collide with Object.prototype names are not treated as having values', () => {
    expectSplitError(
      { participants: [ME, 'constructor'], splitType: 'exact', exact: { me: 9000 } },
      'MISSING_SPLIT_VALUE',
    );
    expectSplitError({ participants: [ME, 'toString'], splitType: 'shares', shares: { me: 1 } }, 'MISSING_SPLIT_VALUE');
  });
});

describe('invariants', () => {
  it('#31 500 random splits always add up, are integers >= 0, and equal splits favour the payer by at most 1 cent', () => {
    const rand = rng(42);
    const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
    const people = ['me', 'arun', 'mei', 'kai', 'zoe', 'raj', 'li', 'sam'];

    for (let i = 0; i < 500; i++) {
      const n = int(1, people.length);
      const participants = people.slice(0, n).sort(() => rand() - 0.5);
      const paidBy = people[int(0, people.length - 1)]!; // sometimes not a participant
      const totalCents = int(1, 1_000_000);
      const splitType = (['equal', 'exact', 'percent', 'shares'] as const)[int(0, 3)]!;
      const splitInput: SplitInput = { totalCents, paidBy, participants, splitType };

      if (splitType === 'exact') {
        // Random cut points produce amounts that sum to the total.
        const cuts = participants.slice(1).map(() => int(0, totalCents)).sort((a, b) => a - b);
        const bounds = [0, ...cuts, totalCents];
        splitInput.exact = Object.fromEntries(participants.map((p, j) => [p, bounds[j + 1]! - bounds[j]!]));
      } else {
        if (rand() < 0.5) {
          splitInput.adjustments = [{ person: participants[int(0, n - 1)]!, cents: int(0, totalCents) }];
        }
        if (splitType === 'percent') {
          // Integer basis points summing to 10000, expressed as percentages.
          const cuts = participants.slice(1).map(() => int(0, 10000)).sort((a, b) => a - b);
          const bounds = [0, ...cuts, 10000];
          splitInput.percent = Object.fromEntries(participants.map((p, j) => [p, (bounds[j + 1]! - bounds[j]!) / 100]));
        } else if (splitType === 'shares') {
          splitInput.shares = Object.fromEntries(participants.map((p) => [p, int(1, 5)]));
        }
      }

      const label = JSON.stringify(splitInput);
      const shares = computeShares(splitInput);
      expect(shares.map((s) => s.personId), label).toEqual(participants);
      expect(shares.reduce((sum, s) => sum + s.cents, 0), label).toBe(totalCents);
      for (const s of shares) {
        expect(Number.isInteger(s.cents) && s.cents >= 0, label).toBe(true);
      }

      if (splitType === 'equal' && !splitInput.adjustments) {
        const values = cents(shares);
        expect(Math.max(...values) - Math.min(...values), label).toBeLessThanOrEqual(1);
        if (participants.includes(paidBy)) {
          expect(byPerson(shares)[paidBy], label).toBe(Math.max(...values));
        }
      }
    }
  });

  it('#47 500 random percent/shares splits with off-100 percentages, 3-decimal shares and large totals still add up', () => {
    const rand = rng(7);
    const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
    const people = ['me', 'arun', 'mei', 'kai', 'zoe', 'raj', 'li', 'sam'];

    for (let i = 0; i < 500; i++) {
      const n = int(1, people.length);
      const participants = people.slice(0, n);
      const paidBy = people[int(0, people.length - 1)]!;
      const totalCents = rand() < 0.2 ? int(1, 10_000_000_000_000) : int(1, 1_000_000);
      const splitInput: SplitInput = { totalCents, paidBy, participants, splitType: 'percent' };

      if (rand() < 0.5) {
        // Basis points summing to 10000, then up to +0.0099% of drift on one person (inside the ±0.01 tolerance).
        const cuts = participants.slice(1).map(() => int(0, 10000)).sort((a, b) => a - b);
        const bounds = [0, ...cuts, 10000];
        const percent = participants.map((_, j) => (bounds[j + 1]! - bounds[j]!) / 100);
        percent[int(0, n - 1)]! += int(0, 99) / 10_000;
        splitInput.percent = Object.fromEntries(participants.map((p, j) => [p, percent[j]!]));
      } else {
        splitInput.splitType = 'shares';
        splitInput.shares = Object.fromEntries(participants.map((p) => [p, int(1, 5000) / 1000]));
      }

      const label = JSON.stringify(splitInput);
      const shares = computeShares(splitInput);
      expect(shares.reduce((sum, s) => sum + s.cents, 0), label).toBe(totalCents);
      for (const s of shares) {
        expect(Number.isInteger(s.cents) && s.cents >= 0, label).toBe(true);
      }
    }
  });
});
