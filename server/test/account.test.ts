import { describe, expect, it } from 'vitest';
import type { Person, PersonId } from '@splitbot/shared';
import { accountSummary, settlePlan } from '../src/domain/account';
import { computeBalances, directDebts } from '../src/domain/balances';
import { suggestSettlements } from '../src/domain/settle';
import { expense, randInt, rng, settlement } from './helpers';

const PEOPLE: Person[] = [
  { id: 'me', name: 'Me' },
  { id: 'arun', name: 'Arun' },
  { id: 'mei', name: 'Mei' },
  { id: 'kai', name: 'Kai' },
];

const DINNER = expense('me', { me: 2600, arun: 3800, mei: 2600 });
const LUNCH = expense('mei', { mei: 1500, arun: 1500 });
const GAS = expense('kai', { kai: 2500, me: 2500 });

describe('settlePlan', () => {
  it('#118 browser data: three transfers instead of four direct debts saves one payment', () => {
    expect(settlePlan(PEOPLE, [DINNER, LUNCH, GAS], [])).toEqual({
      transfers: [
        { from: 'arun', to: 'me', cents: 3900 },
        { from: 'arun', to: 'kai', cents: 1400 },
        { from: 'mei', to: 'kai', cents: 1100 },
      ],
      directDebtCount: 4,
      paymentsSaved: 1,
    });
  });

  it('#119 no records: nothing to pay and nothing saved', () => {
    expect(settlePlan(PEOPLE, [], [])).toEqual({ transfers: [], directDebtCount: 0, paymentsSaved: 0 });
  });

  it('#120 once everything is paid, the plan is empty even though raw pairwise debts remain', () => {
    const paid = [settlement('arun', 'me', 5300), settlement('mei', 'me', 1100)];
    expect(settlePlan(PEOPLE, [DINNER, LUNCH], paid)).toEqual({ transfers: [], directDebtCount: 0, paymentsSaved: 0 });
  });

  it('#121 one debt is one payment, so nothing is saved', () => {
    expect(settlePlan(PEOPLE, [expense('me', { arun: 500 })], [])).toEqual({
      transfers: [{ from: 'arun', to: 'me', cents: 500 }],
      directDebtCount: 1,
      paymentsSaved: 0,
    });
  });

  it('#122 when the greedy list is longer than the direct debts, the saving is 0 and not negative', () => {
    const people: Person[] = ['me', 'a', 'b', 'c', 'x', 'y'].map((id) => ({ id, name: id }));
    const expenses = [expense('y', { a: 400 }), expense('x', { b: 300 }), expense('x', { c: 300 })];
    const plan = settlePlan(people, expenses, []);
    expect(plan.directDebtCount).toBe(3);
    expect(plan.transfers).toHaveLength(4);
    expect(plan.paymentsSaved).toBe(0);
  });

  it('#123 seeded random loop: transfers come from suggestSettlements, and the saving is never negative', () => {
    const rand = rng(5);
    const ids = PEOPLE.map((p) => p.id);
    for (let run = 0; run < 300; run++) {
      const expenses = Array.from({ length: randInt(rand, 0, 8) }, () => {
        const shares: Record<PersonId, number> = {};
        for (const id of ids) if (rand() < 0.6) shares[id] = randInt(rand, 0, 100_000);
        return expense(ids[randInt(rand, 0, ids.length - 1)]!, shares);
      });

      const plan = settlePlan(PEOPLE, expenses, []);
      expect(plan.transfers).toEqual(suggestSettlements(computeBalances(PEOPLE, expenses, [])));
      expect(plan.directDebtCount).toBe(directDebts(PEOPLE, expenses, []).length);
      expect(plan.paymentsSaved).toBe(Math.max(0, plan.directDebtCount - plan.transfers.length));
    }
  });
});

describe('accountSummary', () => {
  it('#110 totals, counts and net for the browser data', () => {
    expect(accountSummary(PEOPLE, [DINNER, LUNCH, GAS], [])).toEqual({
      owedCents: 6400,
      owedCount: 2,
      oweCents: 2500,
      oweCount: 1,
      netCents: 3900,
      people: [
        { personId: 'arun', netCents: 3800 },
        { personId: 'mei', netCents: 2600 },
        { personId: 'kai', netCents: -2500 },
      ],
    });
  });

  it('#111 no records: all zeros, everyone else listed, me left out', () => {
    expect(accountSummary(PEOPLE, [], [])).toEqual({
      owedCents: 0,
      owedCount: 0,
      oweCents: 0,
      oweCount: 0,
      netCents: 0,
      people: [
        { personId: 'arun', netCents: 0 },
        { personId: 'mei', netCents: 0 },
        { personId: 'kai', netCents: 0 },
      ],
    });
  });

  it('#112 a debt between two other people does not count toward me', () => {
    const account = accountSummary(PEOPLE, [LUNCH], []);
    expect(account).toMatchObject({ owedCents: 0, owedCount: 0, oweCents: 0, oweCount: 0, netCents: 0 });
    expect(account.people.every((p) => p.netCents === 0)).toBe(true);
  });

  it('#113 recording every suggested payment leaves nothing owed either way', () => {
    const paid = [settlement('arun', 'me', 5300), settlement('mei', 'me', 1100)];
    const account = accountSummary(PEOPLE, [DINNER, LUNCH], paid);
    expect(account).toMatchObject({ owedCents: 0, owedCount: 0, oweCents: 0, oweCount: 0, netCents: 0 });
    expect(account.people.every((p) => p.netCents === 0)).toBe(true);
  });

  it('#114 list order: owes me, then I owe, then settled, largest first and ties in people order', () => {
    const people: Person[] = [...PEOPLE, { id: 'zed', name: 'Zed' }, { id: 'ana', name: 'Ana' }];
    const expenses = [
      expense('me', { arun: 500, mei: 900 }),
      expense('kai', { me: 100 }),
      expense('zed', { me: 300 }),
    ];
    expect(accountSummary(people, expenses, []).people).toEqual([
      { personId: 'mei', netCents: 900 },
      { personId: 'arun', netCents: 500 },
      { personId: 'zed', netCents: -300 },
      { personId: 'kai', netCents: -100 },
      { personId: 'ana', netCents: 0 },
    ]);
  });

  it('#115 seeded random loop: owed minus owe is my net, and counts match the list', () => {
    const rand = rng(4);
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

      const account = accountSummary(PEOPLE, expenses, settlements);
      const myNet = computeBalances(PEOPLE, expenses, settlements).find((b) => b.personId === 'me')!.netCents;
      expect(account.netCents).toBe(myNet);
      expect(account.owedCents - account.oweCents).toBe(myNet);
      expect(account.owedCount).toBe(account.people.filter((p) => p.netCents > 0).length);
      expect(account.oweCount).toBe(account.people.filter((p) => p.netCents < 0).length);
      expect(account.people.reduce((sum, p) => sum + p.netCents, 0)).toBe(myNet);
    }
  });
});
