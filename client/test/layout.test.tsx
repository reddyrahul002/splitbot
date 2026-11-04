import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Account, Person } from '@splitbot/shared';
import { AccountSummary } from '../src/components/AccountSummary';
import { Tabs } from '../src/components/Tabs';

const PEOPLE: Person[] = [
  { id: 'me', name: 'Me' },
  { id: 'arun', name: 'Arun' },
  { id: 'mei', name: 'Mei' },
  { id: 'kai', name: 'Kai' },
];

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
  ],
};

const NOTHING: Account = { owedCents: 0, owedCount: 0, oweCents: 0, oweCount: 0, netCents: 0, people: [] };

const render = (account: Account | null, error: string | null = null, people = PEOPLE) =>
  renderToStaticMarkup(<AccountSummary account={account} people={people} error={error} />);
const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('AccountSummary', () => {
  it('#52 shows the totals with plural and singular people', () => {
    const text = textOf(render(ACCOUNT));
    expect(text).toContain('You are owed $64.00 from 2 people');
    expect(text).toContain('You owe $25.00 to 1 person');
  });

  it('#53 a positive net shows a plus sign in green, a negative one a minus sign in red', () => {
    const positive = render(ACCOUNT);
    expect(textOf(positive)).toContain('Net balance +$39.00');
    expect(positive).toContain('class="net owes-me"');

    const negative = render({ ...ACCOUNT, netCents: -1250 });
    expect(textOf(negative)).toContain('Net balance -$12.50');
    expect(negative).toContain('class="net i-owe"');
  });

  it('#54 each person has their amount: green for owes me, red for I owe, with words as well as colour', () => {
    const html = render(ACCOUNT);
    expect(html).toContain('<li class="person owes-me"><span>Arun</span><span>owes you $38.00</span></li>');
    expect(html).toContain('<li class="person i-owe"><span>Kai</span><span>you owe $25.00</span></li>');
  });

  it('#55 someone at $0 is listed as settled up, with no colour', () => {
    const html = render({ ...NOTHING, people: [{ personId: 'mei', netCents: 0 }] });
    expect(html).toContain('<li class="person settled"><span>Mei</span><span>settled up</span></li>');
  });

  it('#56 nothing owed drops "from 0 people" and the net has no sign', () => {
    const text = textOf(render(NOTHING));
    expect(text).toContain('You are owed $0.00');
    expect(text).toContain('You owe $0.00');
    expect(text).not.toContain('0 people');
    expect(text).toContain('Net balance $0.00');
    expect(text).toContain('No one to show yet');
  });

  it('#57 before the first response it says loading', () => {
    expect(textOf(render(null))).toBe('Loading…');
  });

  it('#58 an error before any data is shown as an alert', () => {
    const html = render(null, "Can't reach the server. Is it running?");
    expect(html).toContain('role="alert"');
    expect(textOf(html)).not.toContain('Loading');
  });

  it('#59 an error after data keeps the last numbers and shows the alert', () => {
    const html = render(ACCOUNT, 'Server down');
    expect(html).toContain('role="alert"');
    expect(textOf(html)).toContain('You are owed $64.00 from 2 people');
  });

  it('#60 a name that is not in the people list yet shows as Unknown', () => {
    const html = render(ACCOUNT, null, [{ id: 'me', name: 'Me' }]);
    expect(html).toContain('<span>Unknown</span>');
  });
});

describe('Tabs', () => {
  const TABS = [
    { id: 'one', label: 'First', content: <p>first panel</p> },
    { id: 'two', label: 'Second', content: <p>second panel</p> },
  ];

  it('#61 starts on the first tab and renders only its panel', () => {
    const html = renderToStaticMarkup(<Tabs tabs={TABS} />);
    expect(html).toContain('first panel');
    expect(html).not.toContain('second panel');
  });

  it('#62 marks the tabs for screen readers', () => {
    const html = renderToStaticMarkup(<Tabs tabs={TABS} />);
    expect(html).toContain('role="tablist"');
    expect(html.match(/role="tab"/g)).toHaveLength(2);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html).toContain('role="tabpanel"');
  });
});
