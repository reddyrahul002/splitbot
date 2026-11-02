import { describe, expect, it } from 'vitest';
import type { Balance, PersonId, Transfer } from '@splitbot/shared';
import { suggestSettlements } from '../src/domain/settle';
import { randInt, rng } from './helpers';

function balances(nets: Record<PersonId, number>): Balance[] {
  return Object.entries(nets).map(([personId, netCents]) => ({ personId, netCents }));
}

/** Applies transfers to balances: paying moves the payer up and the receiver down. */
function apply(input: Balance[], transfers: Transfer[]): Record<PersonId, number> {
  const net = Object.fromEntries(input.map((b) => [b.personId, b.netCents]));
  for (const t of transfers) {
    net[t.from]! += t.cents;
    net[t.to]! -= t.cents;
  }
  return net;
}

describe('suggestSettlements', () => {
  it('#16 dinner balances: both debtors pay me', () => {
    expect(suggestSettlements(balances({ me: 6400, arun: -3800, mei: -2600 }))).toEqual([
      { from: 'arun', to: 'me', cents: 3800 },
      { from: 'mei', to: 'me', cents: 2600 },
    ]);
  });

  it('#17 all zeros or empty input gives no transfers', () => {
    expect(suggestSettlements([])).toEqual([]);
    expect(suggestSettlements(balances({ me: 0, arun: 0 }))).toEqual([]);
  });

  it('#18 one debtor and one creditor give one transfer', () => {
    expect(suggestSettlements(balances({ me: -1500, arun: 1500, mei: 0 }))).toEqual([
      { from: 'me', to: 'arun', cents: 1500 },
    ]);
  });

  it('#19 balances that pair up exactly give two transfers', () => {
    expect(suggestSettlements(balances({ a: -10, b: -20, c: 10, d: 20 }))).toEqual([
      { from: 'b', to: 'd', cents: 20 },
      { from: 'a', to: 'c', cents: 10 },
    ]);
  });

  it('#20 one debtor pays the largest creditor first', () => {
    expect(suggestSettlements(balances({ a: -30, b: 10, c: 20 }))).toEqual([
      { from: 'a', to: 'c', cents: 20 },
      { from: 'a', to: 'b', cents: 10 },
    ]);
  });

  it('#21 ties on amount go in input order, deterministically', () => {
    const input = balances({ a: -10, b: -10, c: 10, d: 10 });
    const expected = [
      { from: 'a', to: 'c', cents: 10 },
      { from: 'b', to: 'd', cents: 10 },
    ];
    expect(suggestSettlements(input)).toEqual(expected);
    expect(suggestSettlements(input)).toEqual(expected);
    expect(suggestSettlements(balances({ d: 10, c: 10, b: -10, a: -10 }))).toEqual([
      { from: 'b', to: 'd', cents: 10 },
      { from: 'a', to: 'c', cents: 10 },
    ]);
  });

  it('#22 balances that do not add up to 0 throw', () => {
    expect(() => suggestSettlements(balances({ me: 100, arun: -99 }))).toThrow(/add up/);
  });

  it('#23 a non-integer balance throws', () => {
    expect(() => suggestSettlements(balances({ me: 100.5, arun: -100.5 }))).toThrow(/whole/);
  });

  it('#73 error messages are in dollars', () => {
    expect(() => suggestSettlements(balances({ me: 100, arun: -99 }))).toThrow(/\$0\.01/);
    expect(() => suggestSettlements(balances({ me: 100.5, arun: -100.5 }))).toThrow(/\$1\.005/);
  });

  it('#24 very large values stay exact', () => {
    const big = 10_000_000_000_000;
    expect(suggestSettlements(balances({ me: big, arun: -(big - 1), mei: -1 }))).toEqual([
      { from: 'arun', to: 'me', cents: big - 1 },
      { from: 'mei', to: 'me', cents: 1 },
    ]);
  });

  it('does not change its input', () => {
    const input = balances({ me: 6400, arun: -3800, mei: -2600 });
    const copy = structuredClone(input);
    suggestSettlements(input);
    expect(input).toEqual(copy);
  });

  it('#25 seeded random loop: transfers clear everything in at most n−1 steps', () => {
    const rand = rng(25);
    for (let run = 0; run < 500; run++) {
      const n = randInt(rand, 1, 9);
      const nets = Array.from({ length: n - 1 }, () => (rand() < 0.15 ? 0 : randInt(rand, -100_000, 100_000)));
      nets.push(-nets.reduce((a, b) => a + b, 0));
      const input = nets.map((netCents, i) => ({ personId: `p${i}`, netCents }));

      const transfers = suggestSettlements(input);
      const nonZero = nets.filter((v) => v !== 0).length;
      expect(transfers.length).toBeLessThanOrEqual(Math.max(0, nonZero - 1));
      expect(Object.values(apply(input, transfers)).every((v) => v === 0)).toBe(true);
      for (const t of transfers) {
        expect(Number.isInteger(t.cents) && t.cents > 0).toBe(true);
        expect(t.from).not.toBe(t.to);
      }
      const senders = new Set(transfers.map((t) => t.from));
      expect(transfers.some((t) => senders.has(t.to))).toBe(false);
    }
  });
});
