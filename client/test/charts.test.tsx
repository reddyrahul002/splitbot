import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Account, Person, SpendingSummary } from '@splitbot/shared';
import { axisLabel, balanceDomain, balanceRows, categoryRows, monthLabel, monthRows, shortName, spendTotal } from '../src/chartData';
import { Charts } from '../src/components/Charts';

const PEOPLE: Person[] = [
  { id: 'me', name: 'Me' },
  { id: 'arun', name: 'Arun' },
  { id: 'mei', name: 'Mei' },
  { id: 'kai', name: 'Kai' },
];

const SUMMARY: SpendingSummary = {
  myCents: 5100,
  totalCents: 17000,
  byCategory: [
    { category: 'Food & Drink', myCents: 2600, totalCents: 12000 },
    { category: 'Groceries', myCents: 0, totalCents: 1000 },
    { category: 'Transport', myCents: 2500, totalCents: 4000 },
  ],
  byMonth: [
    { month: '2026-11', myCents: 5100, totalCents: 15000 },
    { month: '2026-12', myCents: 0, totalCents: 0 },
    { month: '2027-01', myCents: 0, totalCents: 2000 },
  ],
};

const ACCOUNT: Account = {
  owedCents: 6400,
  owedCount: 2,
  oweCents: 2500,
  oweCount: 1,
  netCents: 3900,
  people: [
    { personId: 'arun', netCents: 3800 },
    { personId: 'mei', netCents: 2600 },
    { personId: 'kai', netCents: -2500 },
    { personId: 'zed', netCents: 0 },
  ],
};

const NO_SPENDING: SpendingSummary = { myCents: 0, totalCents: 0, byCategory: [], byMonth: [] };

describe('categoryRows', () => {
  it('#104 picks the value for the mode, largest first, keeping whole cents', () => {
    expect(categoryRows(SUMMARY, 'group')).toEqual([
      { label: 'Food & Drink', cents: 12000 },
      { label: 'Transport', cents: 4000 },
      { label: 'Groceries', cents: 1000 },
    ]);
  });

  it('#105 leaves out a category with no value in this mode', () => {
    expect(categoryRows(SUMMARY, 'mine')).toEqual([
      { label: 'Food & Drink', cents: 2600 },
      { label: 'Transport', cents: 2500 },
    ]);
  });

  it('#106 ties stay in the summary order', () => {
    const tied: SpendingSummary = {
      ...SUMMARY,
      byCategory: [
        { category: 'Travel', myCents: 100, totalCents: 100 },
        { category: 'Other', myCents: 100, totalCents: 100 },
      ],
    };
    expect(categoryRows(tied, 'mine').map((r) => r.label)).toEqual(['Travel', 'Other']);
  });
});

describe('monthRows', () => {
  it('#107 keeps time order and empty months, so a gap reads as a gap', () => {
    expect(monthRows(SUMMARY, 'group')).toEqual([
      { label: 'Nov 2026', cents: 15000 },
      { label: 'Dec 2026', cents: 0 },
      { label: 'Jan 2027', cents: 2000 },
    ]);
    expect(monthRows(SUMMARY, 'mine').map((r) => r.cents)).toEqual([5100, 0, 0]);
  });

  it('#108 names every month without timezone drift', () => {
    expect(monthLabel('2026-01')).toBe('Jan 2026');
    expect(monthLabel('2026-12')).toBe('Dec 2026');
  });
});

describe('balanceRows', () => {
  it('#109 keeps signs and order, and leaves out people who are settled', () => {
    expect(balanceRows(ACCOUNT, PEOPLE)).toEqual([
      { label: 'Arun', cents: 3800 },
      { label: 'Mei', cents: 2600 },
      { label: 'Kai', cents: -2500 },
    ]);
  });

  it('#110 a person not in the list yet shows as Unknown', () => {
    expect(balanceRows({ ...ACCOUNT, people: [{ personId: 'gone', netCents: 100 }] }, PEOPLE)).toEqual([{ label: 'Unknown', cents: 100 }]);
  });
});

describe('balanceDomain', () => {
  it('#124 uses one scale for both sides, with room for the labels', () => {
    const [low, high] = balanceDomain([{ label: 'Arun', cents: 3800 }, { label: 'Kai', cents: -2500 }]);
    expect(high).toBeGreaterThan(3800);
    expect(low).toBe(-high);
  });

  it('#125 with debts in one direction, the empty side takes no space', () => {
    expect(balanceDomain([{ label: 'Arun', cents: 3800 }])[0]).toBe(0);
    expect(balanceDomain([{ label: 'Kai', cents: -2500 }])[1]).toBe(0);
  });

  it('#129 pins the scale: reach is 2.2 times the longest bar, rounded up', () => {
    expect(balanceDomain([{ label: 'A', cents: 1 }])).toEqual([0, 3]);
  });
});

describe('shortName', () => {
  it('#126 leaves a short name alone and ends a long one with an ellipsis, so the axis never clips it', () => {
    expect(shortName('Arun')).toBe('Arun');
    expect(shortName('Exactly13char')).toBe('Exactly13char');
    expect(shortName('Bartholomew Featherstonehaugh')).toBe('Bartholomew F…');
  });

  it('#128 one character over the limit is shortened', () => {
    expect(shortName('Exactly14chars')).toBe('Exactly14char…');
  });

  it('#127 the balance table keeps the full name', () => {
    const account: Account = { ...ACCOUNT, people: [{ personId: 'b', netCents: -100 }] };
    const html = renderToStaticMarkup(
      <Charts summary={SUMMARY} account={account} people={[{ id: 'b', name: 'Bartholomew Featherstonehaugh' }]} error={null} />,
    );
    expect(html).toContain('<td>Bartholomew Featherstonehaugh</td>');
  });
});

describe('spendTotal', () => {
  it('#111 picks the server total for the mode', () => {
    expect(spendTotal(SUMMARY, 'mine')).toBe(5100);
    expect(spendTotal(SUMMARY, 'group')).toBe(17000);
  });
});

describe('axisLabel', () => {
  it('#112 drops ".00" and keeps real cents', () => {
    expect(axisLabel(0)).toBe('$0');
    expect(axisLabel(2500)).toBe('$25');
    expect(axisLabel(2550)).toBe('$25.50');
    expect(axisLabel(120000)).toBe('$1,200');
    expect(axisLabel(-2500)).toBe('-$25');
  });

  it('#113 a fractional tick does not throw, as formatCents would', () => {
    expect(axisLabel(1333.5)).toBe('$13.34');
  });
});

describe('Charts', () => {
  const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  const render = (props: { summary?: SpendingSummary | null; account?: Account | null; error?: string | null; initialMode?: 'mine' | 'group' } = {}) =>
    renderToStaticMarkup(
      <Charts
        summary={props.summary === undefined ? SUMMARY : props.summary}
        account={props.account === undefined ? ACCOUNT : props.account}
        people={PEOPLE}
        error={props.error ?? null}
        initialMode={props.initialMode}
      />,
    );

  it('#114 names the three charts', () => {
    const text = textOf(render());
    expect(text).toContain('Spending by category');
    expect(text).toContain('Spending by month');
    expect(text).toContain('Balance per person');
  });

  it('#115 the toggle starts on My share and shows which is on', () => {
    const html = render();
    expect(html).toMatch(/aria-pressed="true"[^>]*>My share</);
    expect(html).toMatch(/aria-pressed="false"[^>]*>Group total</);
    expect(textOf(html)).toContain('Total $51.00');
  });

  it('#116 Group total shows the group values', () => {
    const html = render({ initialMode: 'group' });
    expect(html).toMatch(/aria-pressed="true"[^>]*>Group total</);
    const text = textOf(html);
    expect(text).toContain('Total $170.00');
    expect(text).toContain('Food & Drink $120.00');
    expect(text).toContain('Nov 2026 $150.00');
  });

  it('#117 every value is readable in a table, without hovering', () => {
    const html = render();
    const text = textOf(html);
    expect(html.match(/<table/g)).toHaveLength(3);
    expect(text).toContain('Food & Drink $26.00');
    expect(text).toContain('Transport $25.00');
    expect(text).toContain('Nov 2026 $51.00');
    expect(text).toContain('Dec 2026 $0.00');
  });

  it('#118 balances say the direction in words as well as colour', () => {
    const text = textOf(render());
    expect(text).toContain('Arun owes you $38.00');
    expect(text).toContain('Kai you owe $25.00');
  });

  it('#119 no spending at all: says so, with no tables for the spending charts', () => {
    const html = render({ summary: NO_SPENDING });
    expect(textOf(html)).toContain('No spending yet. Add an expense in the chat.');
    expect(html.match(/<table/g)).toHaveLength(1);
  });

  it('#120 group spending with no share of mine: explains the empty My share view', () => {
    const others: SpendingSummary = {
      myCents: 0,
      totalCents: 3000,
      byCategory: [{ category: 'Other', myCents: 0, totalCents: 3000 }],
      byMonth: [{ month: '2026-11', myCents: 0, totalCents: 3000 }],
    };
    const text = textOf(render({ summary: others }));
    expect(text).toContain('You have no share of this spending. Switch to Group total to see it.');
    expect(textOf(render({ summary: others, initialMode: 'group' }))).toContain('Other $30.00');
  });

  it('#121 everyone settled: the balance chart says so', () => {
    const settled: Account = { owedCents: 0, owedCount: 0, oweCents: 0, oweCount: 0, netCents: 0, people: [{ personId: 'arun', netCents: 0 }] };
    expect(textOf(render({ account: settled }))).toContain('Everyone is settled up.');
  });

  it('#122 loading, and an error before any data', () => {
    expect(textOf(render({ summary: null, account: null }))).toBe('Loading…');
    const html = render({ summary: null, account: null, error: 'Server down' });
    expect(html).toContain('role="alert"');
    expect(textOf(html)).toBe('Server down');
  });

  it('#123 an error after data keeps the charts without a second alert (the left column shows it)', () => {
    const html = render({ error: 'Server down' });
    expect(textOf(html)).toContain('Spending by category');
    expect(html).not.toContain('role="alert"');
  });
});
