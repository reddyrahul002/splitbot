import { describe, expect, it } from 'vitest';
import type { Person, PersonId } from '@splitbot/shared';
import { accountSummary, groupSummary, settlePlan } from '../src/domain/account';
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

describe('groupSummary', () => {
  const TRIP = { id: 'trip', name: 'Trip', memberIds: ['me', 'arun', 'mei'] };
  const inTrip = <T extends object>(record: T) => ({ ...record, groupId: 'trip' });

  it('#131 counts only this group’s records, and balances add up to 0', () => {
    const summary = groupSummary(TRIP, PEOPLE, [inTrip(DINNER), GAS, { ...LUNCH, groupId: 'other' }], []);
    expect(summary.group).toEqual(TRIP);
    expect(summary.balances).toEqual([
      { personId: 'me', netCents: 6400 },
      { personId: 'arun', netCents: -3800 },
      { personId: 'mei', netCents: -2600 },
    ]);
    expect(summary.balances.reduce((sum, b) => sum + b.netCents, 0)).toBe(0);
  });

  it('#132 has its own plan and account, built from the group’s records only', () => {
    const summary = groupSummary(TRIP, PEOPLE, [inTrip(DINNER), inTrip(LUNCH), GAS], []);
    expect(summary.plan).toEqual({
      transfers: [
        { from: 'arun', to: 'me', cents: 5300 },
        { from: 'mei', to: 'me', cents: 1100 },
      ],
      directDebtCount: 3,
      paymentsSaved: 1,
    });
    expect(summary.account).toMatchObject({ owedCents: 6400, owedCount: 2, oweCents: 0, oweCount: 0, netCents: 6400 });
  });

  it('#133 lists only members in the account rows and balances', () => {
    const summary = groupSummary(TRIP, PEOPLE, [inTrip(DINNER)], []);
    expect(summary.account.people.map((p) => p.personId)).toEqual(['arun', 'mei']);
    expect(summary.balances.map((b) => b.personId)).toEqual(['me', 'arun', 'mei']);
  });

  it('#134 a group payment clears the group, and the same record lowers the overall balance', () => {
    const expenses = [inTrip(DINNER), inTrip(LUNCH)];
    const paid = [inTrip(settlement('arun', 'me', 5300)), inTrip(settlement('mei', 'me', 1100))];
    const summary = groupSummary(TRIP, PEOPLE, expenses, paid);
    expect(summary.plan.transfers).toEqual([]);
    expect(summary.balances.every((b) => b.netCents === 0)).toBe(true);
    expect(accountSummary(PEOPLE, expenses, paid).netCents).toBe(0);
  });

  it('#135 a payment with no group lowers the overall balance but not the group’s', () => {
    const expenses = [inTrip(DINNER)];
    const paid = [settlement('arun', 'me', 3800)];
    expect(groupSummary(TRIP, PEOPLE, expenses, paid).account.owedCents).toBe(6400);
    expect(accountSummary(PEOPLE, expenses, paid).owedCents).toBe(2600);
  });

  it('#154 documents a known limitation: the same payment recorded with no group and again in the group counts twice', () => {
    const expenses = [inTrip(DINNER)];
    const outside = settlement('arun', 'me', 3800);
    const again = inTrip(settlement('arun', 'me', 3800));

    // Recorded once with no group: the overall view drops it, but the group still suggests it.
    expect(settlePlan(PEOPLE, expenses, [outside]).transfers).toEqual([{ from: 'mei', to: 'me', cents: 2600 }]);
    expect(groupSummary(TRIP, PEOPLE, expenses, [outside]).plan.transfers).toContainEqual({ from: 'arun', to: 'me', cents: 3800 });

    // Following that suggestion overpays: the group looks right, but overall I now owe Arun.
    expect(groupSummary(TRIP, PEOPLE, expenses, [outside, again]).plan.transfers).toEqual([{ from: 'mei', to: 'me', cents: 2600 }]);
    expect(accountSummary(PEOPLE, expenses, [outside, again]).netCents).toBe(-1200);
    expect(settlePlan(PEOPLE, expenses, [outside, again]).transfers).toEqual([
      { from: 'mei', to: 'arun', cents: 2600 },
      { from: 'me', to: 'arun', cents: 1200 },
    ]);
  });

  it('#155 recordCount counts only this group’s expenses and payments', () => {
    expect(groupSummary(TRIP, PEOPLE, [DINNER], [settlement('arun', 'me', 100)]).recordCount).toBe(0);
    expect(groupSummary(TRIP, PEOPLE, [inTrip(DINNER), GAS], [inTrip(settlement('arun', 'me', 100))]).recordCount).toBe(2);
  });

  it('#136 an empty group: everyone at 0, nothing to pay', () => {
    const summary = groupSummary({ id: 'g', name: 'New', memberIds: ['me'] }, PEOPLE, [DINNER], [settlement('arun', 'me', 100)]);
    expect(summary.balances).toEqual([{ personId: 'me', netCents: 0 }]);
    expect(summary.account.people).toEqual([]);
    expect(summary.plan).toEqual({ transfers: [], directDebtCount: 0, paymentsSaved: 0 });
  });

  it('#137 seeded random loop: balances add up to 0, and recording the plan clears the group', () => {
    const rand = rng(6);
    const ids = TRIP.memberIds;
    for (let run = 0; run < 300; run++) {
      const expenses = Array.from({ length: randInt(rand, 0, 6) }, () => {
        const shares: Record<PersonId, number> = {};
        for (const id of ids) if (rand() < 0.7) shares[id] = randInt(rand, 0, 100_000);
        return inTrip(expense(ids[randInt(rand, 0, ids.length - 1)]!, shares));
      });
      const noise = expense('kai', { kai: randInt(rand, 0, 5000), me: randInt(rand, 0, 5000) });

      const summary = groupSummary(TRIP, PEOPLE, [...expenses, noise], []);
      expect(summary.balances.reduce((sum, b) => sum + b.netCents, 0)).toBe(0);
      const paid = summary.plan.transfers.map((t) => inTrip(settlement(t.from, t.to, t.cents)));
      expect(groupSummary(TRIP, PEOPLE, [...expenses, noise], paid).balances.every((b) => b.netCents === 0)).toBe(true);
    }
  });
});

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
