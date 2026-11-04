// The user's account summary and settle-up plan, built on the balance functions. All values are integer cents.
import { ME_ID, type Account, type AccountPerson, type Expense, type Person, type Settlement, type SettlePlan } from '@splitbot/shared';
import { computeBalances, directDebts } from './balances';
import { suggestSettlements } from './settle';

/** Suggested transfers and the payments they save over paying each direct debt. Greedy can be longer, so the floor is 0. */
export function settlePlan(people: Person[], expenses: Expense[], settlements: Settlement[]): SettlePlan {
  const transfers = suggestSettlements(computeBalances(people, expenses, settlements));
  const directDebtCount = directDebts(people, expenses, settlements).length;
  return { transfers, directDebtCount, paymentsSaved: Math.max(0, directDebtCount - transfers.length) };
}

/** Totals and one row per other person, from the debts that involve me. Positive means they owe me. */
export function accountSummary(people: Person[], expenses: Expense[], settlements: Settlement[]): Account {
  const net = new Map(people.filter((p) => p.id !== ME_ID).map((p) => [p.id, 0]));
  let owedCents = 0;
  let oweCents = 0;
  for (const { from, to, cents } of directDebts(people, expenses, settlements)) {
    if (to === ME_ID) {
      net.set(from, cents);
      owedCents += cents;
    }
    if (from === ME_ID) {
      net.set(to, -cents);
      oweCents += cents;
    }
  }

  const rows: AccountPerson[] = [...net].map(([personId, netCents]) => ({ personId, netCents }));
  return {
    owedCents,
    owedCount: rows.filter((p) => p.netCents > 0).length,
    oweCents,
    oweCount: rows.filter((p) => p.netCents < 0).length,
    netCents: computeBalances(people, expenses, settlements).find((b) => b.personId === ME_ID)?.netCents ?? 0,
    people: rows.sort(byListOrder),
  };
}

/** Owes me, then I owe, then settled; largest first. The sort is stable, so ties stay in `people` order. */
function byListOrder(a: AccountPerson, b: AccountPerson): number {
  const group = (p: AccountPerson) => (p.netCents > 0 ? 0 : p.netCents < 0 ? 1 : 2);
  return group(a) - group(b) || Math.abs(b.netCents) - Math.abs(a.netCents);
}
