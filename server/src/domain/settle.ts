// Greedy settle-up: clears every balance in at most n−1 transfers (not always the true minimum, which is NP-hard).
import type { Balance, Transfer } from '@splitbot/shared';
import { describeCents, formatCents } from './money';

/** Repeatedly matches the largest debtor with the largest creditor. Ties on amount go in input order. */
export function suggestSettlements(balances: Balance[]): Transfer[] {
  let sum = 0;
  for (const b of balances) {
    if (!Number.isInteger(b.netCents)) {
      throw new Error(`Balance for "${b.personId}" is ${describeCents(b.netCents)}, which is not a whole number of cents.`);
    }
    sum += b.netCents;
  }
  if (sum !== 0) throw new Error(`Balances must add up to $0.00, but they add up to ${formatCents(sum)}.`);

  const left = balances.map((b) => b.netCents);
  const transfers: Transfer[] = [];
  for (;;) {
    const debtor = pickLargest(left, -1);
    const creditor = pickLargest(left, 1);
    if (debtor === -1 || creditor === -1) return transfers;
    const cents = Math.min(-left[debtor]!, left[creditor]!);
    transfers.push({ from: balances[debtor]!.personId, to: balances[creditor]!.personId, cents });
    left[debtor]! += cents;
    left[creditor]! -= cents;
  }
}

/** Index of the largest amount with the given sign (first one wins a tie), or -1 if there is none. */
function pickLargest(values: number[], sign: 1 | -1): number {
  let best = -1;
  for (const [i, v] of values.entries()) {
    if (v * sign > 0 && (best === -1 || v * sign > values[best]! * sign)) best = i;
  }
  return best;
}
