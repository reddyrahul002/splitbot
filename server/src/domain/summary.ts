// Spending by category and by month: one person's share ("my share") and the group total.
import { CATEGORIES, ME_ID, type Expense, type MonthSpend, type PersonId, type SpendingSummary } from '@splitbot/shared';

export interface SummaryOptions {
  /** Inclusive YYYY-MM-DD bounds. */
  from?: string;
  to?: string;
  /** Whose share counts as "my share". Defaults to `me`. */
  personId?: PersonId;
}

/** Settlements are payments, not spending, so they aren't an input. */
export function spendingSummary(expenses: Expense[], options: SummaryOptions = {}): SpendingSummary {
  const { from, to, personId = ME_ID } = options;
  if (from !== undefined) assertDate(from, 'Start date');
  if (to !== undefined) assertDate(to, 'End date');
  if (from && to && from > to) throw new RangeError(`The start date ${from} is after the end date ${to}.`);
  // Every date is validated, so fillMonths always reaches the last month.
  for (const e of expenses) {
    assertDate(e.date, `Expense ${e.id} date`);
    if (!(CATEGORIES as readonly string[]).includes(e.category)) {
      throw new RangeError(`Expense ${e.id} has unknown category "${e.category}".`);
    }
  }

  // ISO dates compare correctly as strings.
  const inRange = expenses.filter((e) => (!from || e.date >= from) && (!to || e.date <= to));

  const byCategory = new Map(CATEGORIES.map((category) => [category, { category, myCents: 0, totalCents: 0 }]));
  const byMonth = new Map<string, MonthSpend>();
  let myCents = 0;
  let totalCents = 0;
  for (const e of inRange) {
    const mine = e.shares.filter((s) => s.personId === personId).reduce((sum, s) => sum + s.cents, 0);
    const month = e.date.slice(0, 7);
    const cat = byCategory.get(e.category)!;
    const mon = byMonth.get(month) ?? { month, myCents: 0, totalCents: 0 };
    cat.myCents += mine;
    cat.totalCents += e.totalCents;
    mon.myCents += mine;
    mon.totalCents += e.totalCents;
    byMonth.set(month, mon);
    myCents += mine;
    totalCents += e.totalCents;
  }

  return {
    myCents,
    totalCents,
    byCategory: [...byCategory.values()].filter((c) => inRange.some((e) => e.category === c.category)),
    byMonth: fillMonths(byMonth),
  };
}

/** Throws unless `date` is a real calendar date written YYYY-MM-DD. */
export function assertDate(date: string, what: string): void {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const [y, mo, d] = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
  const parsed = new Date(Date.UTC(y, mo - 1, d));
  if (!m || parsed.getUTCFullYear() !== y || parsed.getUTCMonth() !== mo - 1 || parsed.getUTCDate() !== d) {
    throw new RangeError(`${what} "${date}" is not a valid YYYY-MM-DD date.`);
  }
}

/** Months oldest first, with empty months between the first and last filled with zeros. */
function fillMonths(byMonth: Map<string, MonthSpend>): MonthSpend[] {
  const months = [...byMonth.keys()].sort();
  if (months.length === 0) return [];
  const out: MonthSpend[] = [];
  let [year, month] = months[0]!.split('-').map(Number) as [number, number];
  const last = months[months.length - 1]!;
  for (;;) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    out.push(byMonth.get(key) ?? { month: key, myCents: 0, totalCents: 0 });
    if (key === last) return out;
    if (month === 12) {
      year += 1;
      month = 1;
    } else {
      month += 1;
    }
  }
}
