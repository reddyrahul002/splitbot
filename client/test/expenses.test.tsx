import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Expense, Person, Settlement } from '@splitbot/shared';
import { Expenses, HistoryRow } from '../src/components/Expenses';
import { expenseDetail, filterHistory, mergeHistory, settlementText, type HistoryItem } from '../src/history';

const PEOPLE: Person[] = [
  { id: 'me', name: 'Me' },
  { id: 'arun', name: 'Arun' },
  { id: 'mei', name: 'Mei' },
  { id: 'kai', name: 'Kai' },
];
const nameOf = (id: string) => PEOPLE.find((p) => p.id === id)?.name ?? 'Unknown';

function expense(id: string, date: string, paidBy: string, shares: Record<string, number>, category: Expense['category'] = 'Food & Drink'): Expense {
  const list = Object.entries(shares).map(([personId, cents]) => ({ personId, cents }));
  return {
    id,
    description: id,
    category,
    date,
    totalCents: list.reduce((sum, s) => sum + s.cents, 0),
    paidBy,
    shares: list,
    splitMeta: { splitType: 'exact' },
    createdAt: `${date}T00:00:00.000Z`,
  };
}
const payment = (id: string, date: string, from: string, to: string, cents: number): Settlement => ({ id, date, from, to, cents });

const DINNER = expense('Dinner', '2026-11-03', 'me', { me: 2600, arun: 3800, mei: 2600 });
const LUNCH = expense('Lunch', '2026-11-01', 'mei', { mei: 1500, arun: 1500 });
const GAS = expense('Gas', '2026-11-02', 'kai', { kai: 2500, me: 2500 }, 'Transport');
const PAID = payment('p1', '2026-11-04', 'arun', 'me', 3900);
const OLD_PAID = payment('p2', '2026-10-30', 'mei', 'kai', 1100);

const ids = (items: HistoryItem[]) => items.map((i) => (i.kind === 'expense' ? i.expense.id : i.settlement.id));

const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('mergeHistory', () => {
  it('#85 merges expenses and payments, newest date first', () => {
    expect(ids(mergeHistory([DINNER, GAS, LUNCH], [PAID, OLD_PAID]))).toEqual(['p1', 'Dinner', 'Gas', 'Lunch', 'p2']);
  });

  it('#86 on the same day, expenses come first, each kind keeping the server order', () => {
    const [a, b] = [expense('a', '2026-11-03', 'me', { me: 100 }), expense('b', '2026-11-03', 'me', { me: 100 })];
    const [x, y] = [payment('x', '2026-11-03', 'arun', 'me', 100), payment('y', '2026-11-03', 'arun', 'me', 100)];
    expect(ids(mergeHistory([a, b], [x, y]))).toEqual(['a', 'b', 'x', 'y']);
  });

  it('#87 handles empty lists and does not change its input', () => {
    expect(mergeHistory([], [])).toEqual([]);
    const expenses = [LUNCH];
    const settlements = [PAID];
    mergeHistory(expenses, settlements);
    expect(expenses).toEqual([LUNCH]);
    expect(settlements).toEqual([PAID]);
  });
});

describe('filterHistory', () => {
  const ALL = mergeHistory([DINNER, GAS, LUNCH], [PAID, OLD_PAID]);

  it('#88 no filters keeps everything', () => {
    expect(filterHistory(ALL, {})).toEqual(ALL);
  });

  it('#89 a category keeps its expenses and hides payments, which have no category', () => {
    expect(ids(filterHistory(ALL, { category: 'Transport' }))).toEqual(['Gas']);
    expect(ids(filterHistory(ALL, { category: 'Food & Drink' }))).toEqual(['Dinner', 'Lunch']);
    expect(filterHistory(ALL, { category: 'Travel' })).toEqual([]);
  });

  it('#90 a person matches as a payer, a participant, or either side of a payment', () => {
    expect(ids(filterHistory(ALL, { personId: 'kai' }))).toEqual(['Gas', 'p2']);
    expect(ids(filterHistory(ALL, { personId: 'arun' }))).toEqual(['p1', 'Dinner', 'Lunch']);
    const payerOnly = expense('Gift', '2026-11-05', 'kai', { arun: 500 });
    expect(ids(filterHistory([{ kind: 'expense', expense: payerOnly }], { personId: 'kai' }))).toEqual(['Gift']);
  });

  it('#91 filters combine', () => {
    expect(ids(filterHistory(ALL, { category: 'Food & Drink', personId: 'mei' }))).toEqual(['Dinner', 'Lunch']);
    expect(ids(filterHistory(ALL, { category: 'Transport', personId: 'mei' }))).toEqual([]);
  });
});

describe('row text', () => {
  it('#92 a payment says "you" on whichever side I am', () => {
    expect(settlementText(PAID, nameOf)).toBe('Arun paid you');
    expect(settlementText(payment('p', '2026-11-01', 'me', 'kai', 100), nameOf)).toBe('You paid Kai');
    expect(settlementText(OLD_PAID, nameOf)).toBe('Mei paid Kai');
  });

  it('#93 an expense shows date, category, payer and my share as stored', () => {
    expect(expenseDetail(DINNER, nameOf)).toEqual(['2026-11-03', 'Food & Drink', 'Paid by you', 'Your share $26.00']);
    expect(expenseDetail(GAS, nameOf)).toEqual(['2026-11-02', 'Transport', 'Paid by Kai', 'Your share $25.00']);
  });

  it('#94 an expense I am not part of has no share line', () => {
    expect(expenseDetail(LUNCH, nameOf)).toEqual(['2026-11-01', 'Food & Drink', 'Paid by Mei']);
  });
});

describe('HistoryRow', () => {
  const noop = () => {};
  const row = (item: HistoryItem, confirming: boolean, busy = false) =>
    renderToStaticMarkup(<HistoryRow item={item} people={PEOPLE} confirming={confirming} busy={busy} onAsk={noop} onCancel={noop} onDelete={noop} />);

  it('#95 first shows only Delete', () => {
    const text = textOf(row({ kind: 'expense', expense: DINNER }, false));
    expect(text).toContain('Dinner');
    expect(text).toContain('$90.00');
    expect(text).toContain('Delete');
    expect(text).not.toContain('Yes, delete');
  });

  it('#96 after the first click, asks with Yes and Cancel, and Cancel sits where Delete was', () => {
    const html = row({ kind: 'settlement', settlement: PAID }, true);
    expect(textOf(html)).toContain('Arun paid you');
    expect(textOf(html)).toContain('$39.00');
    expect(html.indexOf('Yes, delete')).toBeGreaterThan(-1);
    // Delete was the last button, so a double click lands on Cancel and deletes nothing.
    expect(html.indexOf('Cancel')).toBeGreaterThan(html.indexOf('Yes, delete'));
    expect(html).not.toMatch(/>Delete</);
  });

  it('#97 both buttons are disabled while a delete is running', () => {
    expect(row({ kind: 'expense', expense: DINNER }, true, true).match(/disabled=""/g)).toHaveLength(2);
  });
});

describe('Expenses', () => {
  const render = (props: { expenses?: Expense[] | null; settlements?: Settlement[] | null; error?: string | null } = {}) =>
    renderToStaticMarkup(
      <Expenses
        expenses={props.expenses === undefined ? [DINNER, GAS, LUNCH] : props.expenses}
        settlements={props.settlements === undefined ? [PAID, OLD_PAID] : props.settlements}
        people={PEOPLE}
        error={props.error ?? null}
        onChange={() => {}}
      />,
    );

  it('#98 lists everything newest first, each row with Delete', () => {
    const html = render();
    const text = textOf(html);
    expect(text.indexOf('Arun paid you')).toBeLessThan(text.indexOf('Dinner'));
    expect(text.indexOf('Dinner')).toBeLessThan(text.indexOf('Gas'));
    expect(text.indexOf('Lunch')).toBeLessThan(text.indexOf('Mei paid Kai'));
    expect(html.match(/>Delete</g)).toHaveLength(5);
  });

  it('#99 offers every category and every person, starting on "all"', () => {
    const html = render();
    expect(html).toContain('All categories');
    expect(html).toContain('Everyone');
    expect(html).toContain('Housing &amp; Utilities');
    for (const name of ['Me', 'Arun', 'Mei', 'Kai']) expect(html).toContain(`>${name}</option>`);
  });

  it('#100 nothing recorded yet points to the chat', () => {
    const text = textOf(render({ expenses: [], settlements: [] }));
    expect(text).toContain('No expenses yet');
  });

  it('#101 loading, and an error before any data', () => {
    expect(textOf(render({ expenses: null, settlements: null }))).toBe('Loading…');
    const html = render({ expenses: null, settlements: null, error: 'Server down' });
    expect(html).toContain('role="alert"');
    expect(textOf(html)).toBe('Server down');
  });

  it('#102 an error after data keeps the list without a second alert (the left column shows it)', () => {
    const html = render({ error: 'Server down' });
    expect(textOf(html)).toContain('Dinner');
    expect(html).not.toContain('role="alert"');
  });
});
