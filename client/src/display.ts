// How money reads on screen. Amounts come from the server; these only format them.
import { formatCents } from '@splitbot/shared';
import { MONTHS } from './chartData';

/** Class for an amount from my point of view: positive is green, negative is red. */
export const tone = (cents: number) => (cents > 0 ? 'owes-me' : cents < 0 ? 'i-owe' : 'settled');

/** Classes for the "You are owed" and "You owe" totals. Both are never negative; at zero nothing is owed, so they're grey. */
export const owedTone = (cents: number) => (cents > 0 ? 'owes-me' : 'settled');
export const oweTone = (cents: number) => (cents > 0 ? 'i-owe' : 'settled');

/** "+$39.00", "-$12.50" or "$0.00". */
export const signedCents = (cents: number) => `${cents > 0 ? '+' : ''}${formatCents(cents)}`;

/** Five figures and up need more room, or they'd break mid-number at the card's largest sizes. */
export const isLongAmount = (text: string) => text.length >= 10;

/** A person's debt with me in words, so direction never depends on colour alone. */
export function debtText(cents: number): string {
  if (cents > 0) return `owes you ${formatCents(cents)}`;
  if (cents < 0) return `you owe ${formatCents(Math.abs(cents))}`;
  return 'settled up';
}

/** "2026-11-03" → "3 Nov", with the year when it isn't this one. From the text, not a Date, so a timezone can't shift the day. */
export function shortDate(date: string, currentYear = new Date().getFullYear()): string {
  const [year, month, day] = date.split('-');
  const short = `${Number(day)} ${MONTHS[Number(month) - 1]}`;
  return Number(year) === currentYear ? short : `${short} ${year}`;
}
