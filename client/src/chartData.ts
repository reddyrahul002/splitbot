// Pure helpers that shape server data for the charts. Values stay in integer cents; only the labels format them.
import { formatCents, type Account, type Person, type SpendingSummary, type SpendRow } from '@splitbot/shared';

export type SpendMode = 'mine' | 'group';

export interface ChartRow {
  label: string;
  cents: number;
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const value = (row: SpendRow, mode: SpendMode) => (mode === 'mine' ? row.myCents : row.totalCents);

/** The server's total for this mode. */
export const spendTotal = (summary: SpendingSummary, mode: SpendMode) => value(summary, mode);

/** Largest first, without categories that have nothing in this mode. The sort is stable, so ties keep their order. */
export function categoryRows(summary: SpendingSummary, mode: SpendMode): ChartRow[] {
  return summary.byCategory
    .map((row) => ({ label: row.category as string, cents: value(row, mode) }))
    .filter((row) => row.cents !== 0)
    .sort((a, b) => b.cents - a.cents);
}

/** "2026-11" → "Nov 2026". From the text, not a Date, so a timezone can't shift the month. */
export function monthLabel(month: string): string {
  const [year, number] = month.split('-');
  return `${MONTHS[Number(number) - 1]} ${year}`;
}

/** In time order, with empty months kept so a gap reads as a gap. */
export function monthRows(summary: SpendingSummary, mode: SpendMode): ChartRow[] {
  return summary.byMonth.map((row) => ({ label: monthLabel(row.month), cents: value(row, mode) }));
}

/** Positive means they owe me, negative means I owe them. Settled people have nothing to draw. */
export function balanceRows(account: Account, people: Person[]): ChartRow[] {
  return account.people
    .filter((row) => row.netCents !== 0)
    .map((row) => ({ label: people.find((p) => p.id === row.personId)?.name ?? 'Unknown', cents: row.netCents }));
}

const MAX_NAME = 13;

/** A name that fits the axis. The tooltip and the table keep the full name. */
export function shortName(name: string): string {
  const letters = Array.from(name);
  return letters.length <= MAX_NAME ? name : `${letters.slice(0, MAX_NAME).join('')}…`;
}

/**
 * One scale for both sides, so lengths compare. Bars get under half of each side, leaving room for a label past the
 * longest one even in a narrow column. An unused side is 0.
 */
export function balanceDomain(rows: ChartRow[]): [number, number] {
  const reach = Math.ceil(Math.max(...rows.map((row) => Math.abs(row.cents))) * 2.2);
  return [rows.some((row) => row.cents < 0) ? -reach : 0, rows.some((row) => row.cents > 0) ? reach : 0];
}

/** Space for axis labels and values. Narrow columns give more of it to the bars. */
export function chartSizes(narrow: boolean) {
  return narrow ? { categoryAxis: 112, categoryRight: 64, balanceAxis: 72 } : { categoryAxis: 140, categoryRight: 100, balanceAxis: 110 };
}

/** An axis tick: "$25" or "$25.50". Ticks can be fractional, which formatCents rejects, so it rounds first. */
export function axisLabel(cents: number): string {
  return formatCents(Math.round(cents)).replace(/\.00$/, '');
}
