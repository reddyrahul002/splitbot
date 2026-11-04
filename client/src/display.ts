// How money reads on screen. Amounts come from the server; these only format them.
import { formatCents } from '@splitbot/shared';

/** Class for an amount from my point of view: positive is green, negative is red. */
export const tone = (cents: number) => (cents > 0 ? 'owes-me' : cents < 0 ? 'i-owe' : 'settled');

/** "+$39.00", "-$12.50" or "$0.00". */
export const signedCents = (cents: number) => `${cents > 0 ? '+' : ''}${formatCents(cents)}`;

/** A person's debt with me in words, so direction never depends on colour alone. */
export function debtText(cents: number): string {
  if (cents > 0) return `owes you ${formatCents(cents)}`;
  if (cents < 0) return `you owe ${formatCents(Math.abs(cents))}`;
  return 'settled up';
}
