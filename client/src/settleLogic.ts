// Pure helpers for the Smart settle up tab. The transfers and the saving are computed on the server.
import { formatCents, ME_ID, type DraftRequest, type Person, type SettlePlan, type Transfer } from '@splitbot/shared';

/** "Arun pays you", "You pay Kai" or "Arun pays Kai". */
export function transferLabel({ from, to }: Transfer, nameOf: (id: string) => string): string {
  if (from === ME_ID) return `You pay ${nameOf(to)}`;
  return `${nameOf(from)} pays ${to === ME_ID ? 'you' : nameOf(to)}`;
}

/** "Arun pays you $20.00", "You pay Kai $20.00" or "Arun pays Kai $14.00". */
export function transferText(transfer: Transfer, nameOf: (id: string) => string): string {
  return `${transferLabel(transfer, nameOf)} ${formatCents(transfer.cents)}`;
}

/** The note under the list, or null when the list saves nothing. */
export function savingsNote({ transfers, directDebtCount, paymentsSaved }: SettlePlan): string | null {
  if (paymentsSaved <= 0) return null;
  const saved = paymentsSaved === 1 ? '1 payment' : `${paymentsSaved} payments`;
  return `Saves ${saved}: ${transfers.length} instead of ${directDebtCount} if everyone paid back individually.`;
}

/**
 * The draft request behind "Record payment". Drafts take names, and an unknown name would become a new person, so a
 * missing person gives null instead.
 */
export function settlementRequest({ from, to, cents }: Transfer, people: Person[], groupId?: string): DraftRequest | null {
  const payer = people.find((p) => p.id === from);
  const payee = people.find((p) => p.id === to);
  if (!payer || !payee) return null;
  return { kind: 'settlement', from: payer.name, to: payee.name, cents, ...(groupId === undefined ? {} : { groupId }) };
}
