import { describe, expect, it } from 'vitest';
import type { Person, PersonId } from '@splitbot/shared';
import { accountSummary } from '../src/domain/account';
import { computeBalances } from '../src/domain/balances';
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
