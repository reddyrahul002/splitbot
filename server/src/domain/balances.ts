// Who owes whom, computed from stored expense shares and settlements. All values are integer cents.
import type { Balance, Expense, Person, PersonId, Settlement, Transfer } from '@splitbot/shared';

/** Net position per person, in `people` order: positive means they are owed, negative means they owe. */
export function computeBalances(people: Person[], expenses: Expense[], settlements: Settlement[]): Balance[] {
  const net = new Map<PersonId, number>(people.map((p) => [p.id, 0]));
  for (const { from, to, cents } of flows(people, expenses, settlements)) {
    net.set(from, net.get(from)! - cents);
    net.set(to, net.get(to)! + cents);
  }
  return people.map((p) => ({ personId: p.id, netCents: net.get(p.id)! }));
}

/**
 * Direct debts between each pair, netted across expenses and settlements but not chained
 * (simplifying chains is settle.ts's job). Largest first; ties in `people` order.
 */
export function pairwiseDebts(people: Person[], expenses: Expense[], settlements: Settlement[]): Transfer[] {
  const rank = new Map(people.map((p, i) => [p.id, i]));
  // Keyed by the pair in people order; positive means the lower-ranked person owes the higher-ranked one.
  const pairs = new Map<string, { a: PersonId; b: PersonId; cents: number }>();
  for (const { from, to, cents } of flows(people, expenses, settlements)) {
    if (from === to) continue;
    const [a, b, sign] = rank.get(from)! < rank.get(to)! ? [from, to, 1] : [to, from, -1];
    const key = JSON.stringify([a, b]);
    const pair = pairs.get(key) ?? { a, b, cents: 0 };
    pair.cents += sign * cents;
    pairs.set(key, pair);
  }
  const debts: Transfer[] = [];
  for (const { a, b, cents } of pairs.values()) {
    if (cents > 0) debts.push({ from: a, to: b, cents });
    if (cents < 0) debts.push({ from: b, to: a, cents: -cents });
  }
  return debts.sort(
    (x, y) => y.cents - x.cents || rank.get(x.from)! - rank.get(y.from)! || rank.get(x.to)! - rank.get(y.to)!,
  );
}

/**
 * Every record as "`from` owes `to` `cents`": each non-payer owes the payer their share,
 * and a settlement from → to means `to` now owes `from` that amount back.
 */
function flows(people: Person[], expenses: Expense[], settlements: Settlement[]): Transfer[] {
  const known = new Set(people.map((p) => p.id));
  const check = (id: PersonId, where: string) => {
    if (!known.has(id)) throw new Error(`Unknown person "${id}" in ${where}.`);
  };
  const out: Transfer[] = [];
  for (const e of expenses) {
    check(e.paidBy, `expense ${e.id}`);
    for (const s of e.shares) {
      check(s.personId, `expense ${e.id}`);
      if (s.personId !== e.paidBy && s.cents !== 0) out.push({ from: s.personId, to: e.paidBy, cents: s.cents });
    }
  }
  for (const s of settlements) {
    check(s.from, `settlement ${s.id}`);
    check(s.to, `settlement ${s.id}`);
    out.push({ from: s.to, to: s.from, cents: s.cents });
  }
  return out;
}
