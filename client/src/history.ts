// Pure helpers for the Expenses tab: merging, filtering and row text. Amounts are shown as stored.
import { formatCents, ME_ID, type Category, type Expense, type PersonId, type Settlement } from '@splitbot/shared';

export type HistoryItem = { kind: 'expense'; expense: Expense } | { kind: 'settlement'; settlement: Settlement };

export interface HistoryFilters {
  category?: Category;
  personId?: PersonId;
}

const dateOf = (item: HistoryItem) => (item.kind === 'expense' ? item.expense.date : item.settlement.date);

/**
 * Newest date first. Both lists arrive newest first from the server, and the sort is stable, so each kind keeps that
 * order. Settlements have no createdAt to compare with an expense's, so on the same day expenses go first.
 */
export function mergeHistory(expenses: Expense[], settlements: Settlement[]): HistoryItem[] {
  const items: HistoryItem[] = [
    ...expenses.map((expense): HistoryItem => ({ kind: 'expense', expense })),
    ...settlements.map((settlement): HistoryItem => ({ kind: 'settlement', settlement })),
  ];
  return items.sort((a, b) => (dateOf(a) === dateOf(b) ? 0 : dateOf(a) < dateOf(b) ? 1 : -1));
}

function involves(item: HistoryItem, personId: PersonId): boolean {
  if (item.kind === 'settlement') return item.settlement.from === personId || item.settlement.to === personId;
  return item.expense.paidBy === personId || item.expense.shares.some((s) => s.personId === personId);
}

/** A category hides payments, which have no category. */
export function filterHistory(items: HistoryItem[], { category, personId }: HistoryFilters): HistoryItem[] {
  return items.filter((item) => {
    if (category !== undefined && (item.kind !== 'expense' || item.expense.category !== category)) return false;
    return personId === undefined || involves(item, personId);
  });
}

/** "Arun paid you", "You paid Kai" or "Mei paid Kai". */
export function settlementText({ from, to }: Settlement, nameOf: (id: string) => string): string {
  if (from === ME_ID) return `You paid ${nameOf(to)}`;
  return `${nameOf(from)} paid ${to === ME_ID ? 'you' : nameOf(to)}`;
}

/** The details under an expense's description. My share is left out when I'm not part of the expense. */
export function expenseDetail(expense: Expense, nameOf: (id: string) => string): string[] {
  const mine = expense.shares.find((s) => s.personId === ME_ID);
  return [
    expense.date,
    expense.category,
    expense.paidBy === ME_ID ? 'Paid by you' : `Paid by ${nameOf(expense.paidBy)}`,
    ...(mine ? [`Your share ${formatCents(mine.cents)}`] : []),
  ];
}
