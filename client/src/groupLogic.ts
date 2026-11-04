// Pure helpers for groups. The balances are computed on the server; these only word and filter them.
import { formatCents, ME_ID, type Balance, type Draft, type Group, type Person } from '@splitbot/shared';

/** "Arun owes $38.00", "You are owed $64.00" or "Mei is settled up". A member's balance is within the group, not with me. */
export function memberBalanceText({ personId, netCents }: Balance, nameOf: (id: string) => string): string {
  const isMe = personId === ME_ID;
  const who = isMe ? 'You' : nameOf(personId);
  if (netCents === 0) return `${who} ${isMe ? 'are' : 'is'} settled up`;
  const amount = formatCents(Math.abs(netCents));
  if (netCents > 0) return `${who} ${isMe ? 'are' : 'is'} owed ${amount}`;
  return `${who} ${isMe ? 'owe' : 'owes'} ${amount}`;
}

/** People who can still be added to the group. */
export function addablePeople(group: Group, people: Person[]): Person[] {
  return people.filter((p) => !group.memberIds.includes(p.id));
}

/** Who a Confirm would add to the group: anyone on the draft who isn't a member yet. */
export function joiningNames(draft: Draft, group: Group, known: Person[]): string[] {
  const ids =
    draft.kind === 'expense'
      ? [draft.expense.paidBy, ...draft.expense.shares.map((s) => s.personId)]
      : [draft.settlement.from, draft.settlement.to];
  return [...new Set(ids)]
    .filter((id) => !group.memberIds.includes(id))
    .map((id) => known.find((p) => p.id === id)?.name ?? 'Unknown');
}
