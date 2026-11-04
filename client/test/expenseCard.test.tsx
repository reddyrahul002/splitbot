import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Expense, Group, Person, Settlement } from '@splitbot/shared';
import { Expenses, HistoryRow } from '../src/components/Expenses';
import { shortDate } from '../src/display';
import type { HistoryItem } from '../src/history';

const PEOPLE: Person[] = [
  { id: 'me', name: 'Me' },
  { id: 'arun', name: 'Arun' },
  { id: 'kai', name: 'Kai' },
];

const GROUPS: Group[] = [{ id: 'trip', name: 'Goa trip', memberIds: ['me', 'arun', 'kai'] }];

const GAS: Expense = {
  id: 'gas',
  description: 'Gas',
  category: 'Transport',
  date: '2026-11-02',
  totalCents: 5000,
  paidBy: 'kai',
  shares: [
    { personId: 'kai', cents: 2500 },
    { personId: 'me', cents: 2500 },
  ],
  splitMeta: { splitType: 'equal' },
  createdAt: '2026-11-02T10:00:00.000Z',
} as Expense;

const PAID: Settlement = { id: 'p1', from: 'arun', to: 'me', cents: 2000, date: '2026-11-03' };

const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const row = (item: HistoryItem, groups?: Group[]) =>
  renderToStaticMarkup(<HistoryRow item={item} people={PEOPLE} groups={groups} confirming={false} busy={false} onAsk={() => {}} onCancel={() => {}} onDelete={() => {}} />);

describe('shortDate', () => {
  it('#B11 reads as day and month, without a leading zero', () => {
    expect(shortDate('2026-11-03', 2026)).toBe('3 Nov');
    expect(shortDate('2026-01-31', 2026)).toBe('31 Jan');
  });

  it('#B12 adds the year when it is not this year', () => {
    expect(shortDate('2025-12-31', 2026)).toBe('31 Dec 2025');
  });

  it('#B13 comes from the text, so a timezone cannot move the day', () => {
    const before = process.env.TZ;
    process.env.TZ = 'Pacific/Auckland';
    expect(shortDate('2026-03-01', 2026)).toBe('1 Mar');
    process.env.TZ = 'Pacific/Honolulu';
    expect(shortDate('2026-03-01', 2026)).toBe('1 Mar');
    process.env.TZ = before;
  });
});

describe('expense card', () => {
  const expense: HistoryItem = { kind: 'expense', expense: GAS };

  it('#B14 has the category chip with its name for screen readers', () => {
    const html = row(expense);
    expect(html).toContain('category-chip icon-only');
    expect(html).toContain('aria-label="Transport"');
    expect(html).toContain('title="Transport"');
  });

  it('#B15 says who paid and when, then the total and my share', () => {
    const text = textOf(row(expense));
    expect(text).toContain('Gas');
    expect(text).toContain(`Paid by Kai · ${shortDate('2026-11-02')}`);
    expect(text).toContain('Your share $25.00');
    expect(text).toContain('$50.00');
  });

  it('#B16 an expense I paid says "you"', () => {
    expect(textOf(row({ kind: 'expense', expense: { ...GAS, paidBy: 'me' } }))).toContain('Paid by you');
  });

  it('#B17 has no share line when I am not part of it', () => {
    const notMine = { ...GAS, shares: [{ personId: 'kai', cents: 5000 }] };
    expect(textOf(row({ kind: 'expense', expense: notMine }))).not.toContain('Your share');
  });

  it('#B18 shows the group badge only for an expense in a known group', () => {
    expect(textOf(row({ kind: 'expense', expense: { ...GAS, groupId: 'trip' } }, GROUPS))).toContain('Goa trip');
    expect(row(expense, GROUPS)).not.toContain('Goa trip');
    expect(row({ kind: 'expense', expense: { ...GAS, groupId: 'gone' } }, GROUPS)).not.toContain('badge group');
    expect(row({ kind: 'expense', expense: { ...GAS, groupId: 'trip' } })).not.toContain('badge group');
  });

  it('#B19 Delete keeps its word and gains an icon', () => {
    const html = row(expense);
    expect(html).toMatch(/lucide-trash[^]*>Delete</);
  });
});

describe('payment in the list', () => {
  const payment: HistoryItem = { kind: 'settlement', settlement: PAID };

  it('#B20 shows avatar to avatar instead of a category', () => {
    const html = row(payment);
    expect(html).toContain('data-initials="A"');
    expect(html).toContain('avatar-you');
    expect(html).toContain('lucide-arrow-right');
    expect(html).not.toContain('category-chip');
  });

  it('#B21 says it is a payment, with the date and amount', () => {
    const text = textOf(row(payment));
    expect(text).toContain('Arun paid you');
    expect(text).toContain(`Payment · ${shortDate('2026-11-03')}`);
    expect(text).toContain('$20.00');
  });

  it('#B22 can carry a group badge too', () => {
    expect(textOf(row({ kind: 'settlement', settlement: { ...PAID, groupId: 'trip' } }, GROUPS))).toContain('Goa trip');
  });
});

describe('Expenses list', () => {
  const render = (props: { expenses?: Expense[] | null; settlements?: Settlement[] | null } = {}) =>
    renderToStaticMarkup(<Expenses expenses={[GAS]} settlements={[PAID]} people={PEOPLE} groups={GROUPS} error={null} onChange={() => {}} {...props} />);

  it('#B23 passes groups down to its rows', () => {
    expect(textOf(render({ expenses: [{ ...GAS, groupId: 'trip' }] }))).toContain('Goa trip');
  });

  it('#B24 loading is a skeleton list', () => {
    const html = render({ expenses: null });
    expect(html).toContain('skeleton');
    expect(textOf(html)).toBe('Loading…');
  });

  it('#B25 nothing recorded is an empty state with a way to start', () => {
    const html = render({ expenses: [], settlements: [] });
    expect(html).toContain('empty-state');
    expect(textOf(html)).toContain('No expenses yet. Add one in the chat.');
    expect(html).toContain('>Add an expense<');
  });
});
