import { describe, expect, it } from 'vitest';
import type { Balance, Person, PersonId } from '@splitbot/shared';
import { computeBalances, directDebts, pairwiseDebts } from '../src/domain/balances';
import { suggestSettlements } from '../src/domain/settle';
import { expense, randInt, rng, settlement } from './helpers';

const PEOPLE: Person[] = [
  { id: 'me', name: 'Me' },
  { id: 'arun', name: 'Arun' },
  { id: 'mei', name: 'Mei' },
  { id: 'kai', name: 'Kai' },
];

const DINNER = expense('me', { me: 2600, arun: 3800, mei: 2600 });

function nets(balances: Balance[]): Record<PersonId, number> {
  return Object.fromEntries(balances.map((b) => [b.personId, b.netCents]));
}

describe('net balances', () => {
  it('#1 dinner example: payer is owed everyone else’s shares', () => {
    expect(nets(computeBalances(PEOPLE, [DINNER], []))).toEqual({ me: 6400, arun: -3800, mei: -2600, kai: 0 });
  });

  it('#3 payer who is not a participant is owed the full total', () => {
    const e = expense('me', { arun: 500, mei: 500 });
    expect(nets(computeBalances(PEOPLE, [e], []))).toEqual({ me: 1000, arun: -500, mei: -500, kai: 0 });
    expect(pairwiseDebts(PEOPLE, [e], [])).toEqual([
      { from: 'arun', to: 'me', cents: 500 },
      { from: 'mei', to: 'me', cents: 500 },
    ]);
  });

  it('#6 a partial settlement reduces the debt', () => {
    const s = settlement('arun', 'me', 2000);
    expect(nets(computeBalances(PEOPLE, [DINNER], [s]))).toMatchObject({ me: 4400, arun: -1800 });
    expect(pairwiseDebts(PEOPLE, [DINNER], [s])).toContainEqual({ from: 'arun', to: 'me', cents: 1800 });
  });

  it('#7 paying off the full debt leaves balance 0 and no pair', () => {
    const s = settlement('arun', 'me', 3800);
    expect(nets(computeBalances(PEOPLE, [DINNER], [s])).arun).toBe(0);
    expect(pairwiseDebts(PEOPLE, [DINNER], [s])).toEqual([{ from: 'mei', to: 'me', cents: 2600 }]);
  });

  it('#11 no records: everyone is at 0', () => {
    expect(computeBalances(PEOPLE, [], [])).toEqual(PEOPLE.map((p) => ({ personId: p.id, netCents: 0 })));
    expect(pairwiseDebts(PEOPLE, [], [])).toEqual([]);
  });

  it('#12 output follows people order, including people at 0', () => {
    const reordered = [PEOPLE[3]!, PEOPLE[1]!, PEOPLE[0]!, PEOPLE[2]!];
    expect(computeBalances(reordered, [DINNER], []).map((b) => b.personId)).toEqual(['kai', 'arun', 'me', 'mei']);
  });

  it('#13 an unknown person id in a record throws', () => {
    expect(() => computeBalances(PEOPLE, [expense('zed', { me: 100 })], [])).toThrow(/zed/);
    expect(() => computeBalances(PEOPLE, [expense('me', { zed: 100 })], [])).toThrow(/zed/);
    expect(() => computeBalances(PEOPLE, [], [settlement('me', 'zed', 100)])).toThrow(/zed/);
    expect(() => pairwiseDebts(PEOPLE, [expense('me', { zed: 100 })], [])).toThrow(/zed/);
    expect(() => pairwiseDebts(PEOPLE, [], [settlement('zed', 'me', 100)])).toThrow(/zed/);
  });
});

describe('pairwise debts', () => {
  it('#2 dinner example: each non-payer owes the payer their share', () => {
    expect(pairwiseDebts(PEOPLE, [DINNER], [])).toEqual([
      { from: 'arun', to: 'me', cents: 3800 },
      { from: 'mei', to: 'me', cents: 2600 },
    ]);
  });

  it('#4 opposite-direction expenses between one pair net to one debt', () => {
    const iOwe = expense('arun', { arun: 500, me: 500 });
    const heOwes = expense('me', { me: 800, arun: 800 });
    expect(pairwiseDebts(PEOPLE, [iOwe, heOwes], [])).toEqual([{ from: 'arun', to: 'me', cents: 300 }]);
  });

  it('#5 debts that cancel exactly leave no pair', () => {
    const a = expense('arun', { arun: 500, me: 500 });
    const b = expense('me', { me: 500, arun: 500 });
    expect(pairwiseDebts(PEOPLE, [a, b], [])).toEqual([]);
    expect(nets(computeBalances(PEOPLE, [a, b], []))).toMatchObject({ me: 0, arun: 0 });
  });

  it('#8 overpaying flips the direction', () => {
    const s = settlement('arun', 'me', 5000);
    expect(pairwiseDebts(PEOPLE, [DINNER], [s])).toEqual([
      { from: 'mei', to: 'me', cents: 2600 },
      { from: 'me', to: 'arun', cents: 1200 },
    ]);
    expect(nets(computeBalances(PEOPLE, [DINNER], [s])).arun).toBe(1200);
  });

  it('#9 a settlement with no expenses creates a debt', () => {
    const s = settlement('me', 'mei', 3000);
    expect(pairwiseDebts(PEOPLE, [], [s])).toEqual([{ from: 'mei', to: 'me', cents: 3000 }]);
    expect(nets(computeBalances(PEOPLE, [], [s]))).toMatchObject({ me: 3000, mei: -3000 });
  });

  it('#10 debts are not chained: A owes B and B owes C stay as two pairs', () => {
    const a = expense('arun', { me: 1000 }); // me owes Arun
    const b = expense('mei', { arun: 1000 }); // Arun owes Mei
    expect(pairwiseDebts(PEOPLE, [a, b], [])).toEqual([
      { from: 'me', to: 'arun', cents: 1000 },
      { from: 'arun', to: 'mei', cents: 1000 },
    ]);
  });

  it('#14 a zero share creates no pair', () => {
    expect(pairwiseDebts(PEOPLE, [expense('me', { me: 1000, arun: 0 })], [])).toEqual([]);
  });

  it('sorts by cents (largest first), ties in people order', () => {
    const e = expense('me', { kai: 500, mei: 500, arun: 900 });
    expect(pairwiseDebts(PEOPLE, [e], [])).toEqual([
      { from: 'arun', to: 'me', cents: 900 },
      { from: 'mei', to: 'me', cents: 500 },
      { from: 'kai', to: 'me', cents: 500 },
    ]);
  });
});

describe('directDebts', () => {
  const LUNCH = expense('mei', { mei: 1500, arun: 1500 });

  it('#103 recording every suggested payment leaves no debts, where pairwiseDebts keeps a circle', () => {
    const expenses = [DINNER, LUNCH];
    const paid = [settlement('arun', 'me', 5300), settlement('mei', 'me', 1100)];
    expect(nets(computeBalances(PEOPLE, expenses, paid))).toEqual({ me: 0, arun: 0, mei: 0, kai: 0 });
    expect(pairwiseDebts(PEOPLE, expenses, paid)).toHaveLength(3);
    expect(directDebts(PEOPLE, expenses, paid)).toEqual([]);
  });

  it('#104 after one suggested payment, the remainder matches the next suggestion', () => {
    const debts = directDebts(PEOPLE, [DINNER, LUNCH], [settlement('arun', 'me', 5300)]);
    expect(debts).toEqual([{ from: 'mei', to: 'me', cents: 1100 }]);
  });

  it('#105 debts with no circle stay as they are, including people who never shared with me', () => {
    const expenses = [DINNER, LUNCH];
    expect(directDebts(PEOPLE, expenses, [])).toEqual(pairwiseDebts(PEOPLE, expenses, []));
    expect(directDebts(PEOPLE, expenses, [])).toContainEqual({ from: 'arun', to: 'mei', cents: 1500 });
  });

  it('#106 a circle is reduced by its smallest debt, and the rest stays', () => {
    const expenses = [expense('me', { arun: 1000 }), expense('arun', { mei: 400 }), expense('mei', { me: 700 })];
    expect(directDebts(PEOPLE, expenses, [])).toEqual([
      { from: 'arun', to: 'me', cents: 600 },
      { from: 'me', to: 'mei', cents: 300 },
    ]);
  });

  it('#107 overlapping circles all clear when every net is 0', () => {
    const expenses = [
      expense('me', { arun: 500 }),
      expense('arun', { mei: 500, kai: 200 }),
      expense('mei', { me: 500 }),
      expense('kai', { me: 200 }),
      expense('me', { arun: 200 }),
    ];
    expect(nets(computeBalances(PEOPLE, expenses, []))).toEqual({ me: 0, arun: 0, mei: 0, kai: 0 });
    expect(directDebts(PEOPLE, expenses, [])).toEqual([]);
  });

  it('#108 sorts by cents (largest first), ties in people order, and repeats exactly', () => {
    const expenses = [expense('me', { mei: 500 }), expense('me', { arun: 500 }), expense('kai', { arun: 900 })];
    const debts = directDebts(PEOPLE, expenses, []);
    expect(debts).toEqual([
      { from: 'arun', to: 'kai', cents: 900 },
      { from: 'arun', to: 'me', cents: 500 },
      { from: 'mei', to: 'me', cents: 500 },
    ]);
    expect(directDebts(PEOPLE, expenses, [])).toEqual(debts);
  });

  it('#109 seeded random loop: nets are kept, and recording the suggestions clears everything', () => {
    const rand = rng(3);
    const ids = PEOPLE.map((p) => p.id);
    for (let run = 0; run < 500; run++) {
      const expenses = Array.from({ length: randInt(rand, 0, 8) }, () => {
        const shares: Record<PersonId, number> = {};
        for (const id of ids) if (rand() < 0.6) shares[id] = randInt(rand, 0, 100_000);
        return expense(ids[randInt(rand, 0, ids.length - 1)]!, shares);
      });
      const settlements = Array.from({ length: randInt(rand, 0, 4) }, () => {
        const from = ids[randInt(rand, 0, ids.length - 1)]!;
        const others = ids.filter((id) => id !== from);
        return settlement(from, others[randInt(rand, 0, others.length - 1)]!, randInt(rand, 1, 50_000));
      });

      const balances = computeBalances(PEOPLE, expenses, settlements);
      const debts = directDebts(PEOPLE, expenses, settlements);
      for (const b of balances) {
        const owedToThem = debts.filter((d) => d.to === b.personId).reduce((s, d) => s + d.cents, 0);
        const theyOwe = debts.filter((d) => d.from === b.personId).reduce((s, d) => s + d.cents, 0);
        expect(owedToThem - theyOwe).toBe(b.netCents);
      }
      for (const d of debts) {
        expect(Number.isInteger(d.cents) && d.cents > 0).toBe(true);
        expect(d.from).not.toBe(d.to);
      }

      const paid = suggestSettlements(balances).map((t) => settlement(t.from, t.to, t.cents));
      expect(directDebts(PEOPLE, expenses, [...settlements, ...paid])).toEqual([]);
    }
  });
});

describe('invariants', () => {
  it('#15 seeded random loop: balances add up to 0 and match pairwise debts', () => {
    const rand = rng(2);
    const ids = PEOPLE.map((p) => p.id);
    for (let run = 0; run < 500; run++) {
      const expenses = Array.from({ length: randInt(rand, 0, 6) }, () => {
        const shares: Record<PersonId, number> = {};
        for (const id of ids) if (rand() < 0.6) shares[id] = randInt(rand, 0, 100_000);
        return expense(ids[randInt(rand, 0, ids.length - 1)]!, shares);
      });
      const settlements = Array.from({ length: randInt(rand, 0, 3) }, () => {
        const from = ids[randInt(rand, 0, ids.length - 1)]!;
        const others = ids.filter((id) => id !== from);
        return settlement(from, others[randInt(rand, 0, others.length - 1)]!, randInt(rand, 1, 50_000));
      });

      const balances = computeBalances(PEOPLE, expenses, settlements);
      const debts = pairwiseDebts(PEOPLE, expenses, settlements);
      expect(balances.reduce((sum, b) => sum + b.netCents, 0)).toBe(0);
      for (const b of balances) {
        expect(Number.isInteger(b.netCents)).toBe(true);
        const owedToThem = debts.filter((d) => d.to === b.personId).reduce((s, d) => s + d.cents, 0);
        const theyOwe = debts.filter((d) => d.from === b.personId).reduce((s, d) => s + d.cents, 0);
        expect(b.netCents).toBe(owedToThem - theyOwe);
      }
      for (const d of debts) {
        expect(Number.isInteger(d.cents) && d.cents > 0).toBe(true);
        expect(d.from).not.toBe(d.to);
      }
    }
  });
});
