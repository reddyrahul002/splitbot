import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Expense, GroupSummary, Person, Settlement } from '@splitbot/shared';
import { GroupCard } from '../src/components/GroupCard';
import { Groups } from '../src/components/Groups';
import { lastActivity } from '../src/groupLogic';

const PEOPLE: Person[] = [
  { id: 'me', name: 'Me' },
  { id: 'arun', name: 'Arun' },
  { id: 'mei', name: 'Mei' },
  { id: 'kai', name: 'Kai' },
  { id: 'tom', name: 'Tom' },
  { id: 'sara', name: 'Sara' },
];

const summary = (id: string, name: string, memberIds: string[], myCents: number, recordCount = 1): GroupSummary => ({
  group: { id, name, memberIds },
  balances: memberIds.map((personId) => ({ personId, netCents: personId === 'me' ? myCents : 0 })),
  account: { owedCents: 0, owedCount: 0, oweCents: 0, oweCount: 0, netCents: myCents, people: [] },
  plan: { transfers: [], directDebtCount: 0, paymentsSaved: 0 },
  recordCount,
});

const TRIP = summary('trip', 'Goa trip', ['me', 'arun', 'mei'], 6400);
const HOME = summary('home', 'Flat', ['me', 'kai'], -500);

const expense = (date: string, groupId?: string) => ({ id: date, date, groupId }) as unknown as Expense;
const payment = (date: string, groupId?: string) => ({ id: date, date, groupId, from: 'arun', to: 'me', cents: 100 }) as Settlement;
const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('lastActivity', () => {
  it('#D1 is the newest date among the group\'s expenses and payments', () => {
    expect(lastActivity('trip', [expense('2026-10-01', 'trip'), expense('2026-11-02', 'trip')], [payment('2026-10-20', 'trip')])).toBe('2026-11-02');
    expect(lastActivity('trip', [expense('2026-10-01', 'trip')], [payment('2026-11-05', 'trip')])).toBe('2026-11-05');
  });

  it('#D2 ignores other groups and records with no group', () => {
    expect(lastActivity('trip', [expense('2026-12-01', 'home'), expense('2026-12-02')], [payment('2026-12-03')])).toBeNull();
  });

  it('#D3 nothing yet is null', () => {
    expect(lastActivity('trip', [], [])).toBeNull();
  });
});

describe('GroupCard', () => {
  const card = (props: Partial<Parameters<typeof GroupCard>[0]> = {}) =>
    renderToStaticMarkup(<GroupCard summary={TRIP} people={PEOPLE} selected={false} lastDate="2026-11-03" onSelect={() => {}} {...props} />);

  it('#D4 has the name, an avatar stack and the member count', () => {
    const html = card();
    expect(textOf(html)).toContain('Goa trip');
    expect(html).toContain('aria-label="You, Arun, Mei"');
    expect(textOf(html)).toContain('3 members');
  });

  it('#D5 one member is singular', () => {
    expect(textOf(card({ summary: summary('solo', 'Solo', ['me'], 0, 0) }))).toContain('1 member');
    expect(textOf(card({ summary: summary('solo', 'Solo', ['me'], 0, 0) }))).not.toContain('1 members');
  });

  it('#D6 stacks past four members show "+N"', () => {
    const big = summary('big', 'Big', ['me', 'arun', 'mei', 'kai', 'tom', 'sara'], 0);
    expect(card({ summary: big })).toContain('data-initials="+2"');
  });

  it('#D7 shows my balance in the group in words, with an icon and tone', () => {
    const owed = card();
    expect(textOf(owed)).toContain('You are owed $64.00');
    expect(owed).toContain('lucide-arrow-down-left');
    expect(owed).toContain('group-card-balance owes-me');

    const owing = card({ summary: HOME });
    expect(textOf(owing)).toContain('You owe $5.00');
    expect(owing).toContain('lucide-arrow-up-right');
    expect(owing).toContain('group-card-balance i-owe');

    const settled = card({ summary: summary('s', 'S', ['me', 'arun'], 0) });
    expect(textOf(settled)).toContain('You are settled up');
    expect(settled).toContain('group-card-balance settled');
  });

  it('#D8 shows the last activity, or says there is none', () => {
    expect(textOf(card({ lastDate: '2025-03-01' }))).toContain('Last activity 1 Mar 2025');
    expect(textOf(card({ lastDate: null }))).toContain('No activity yet');
  });

  it('#D9 is a real button that says whether it is selected', () => {
    expect(card()).toMatch(/<button type="button" class="group-card" aria-pressed="false"/);
    expect(card({ selected: true })).toMatch(/<button type="button" class="group-card selected" aria-pressed="true"/);
  });
});

describe('Groups tab', () => {
  const render = () =>
    renderToStaticMarkup(<Groups groups={[TRIP, HOME]} people={PEOPLE} expenses={[expense('2026-11-03', 'trip')]} settlements={[]} error={null} onChange={() => {}} />);

  it('#D10 has a card per group, with the first selected', () => {
    const html = render();
    expect(html.match(/class="group-card( selected)?"/g)).toHaveLength(2);
    expect(html.match(/class="group-card selected"/g)).toHaveLength(1);
    expect(html.indexOf('group-card selected')).toBeLessThan(html.indexOf('Flat'));
  });

  it('#D11 each card has its own last activity', () => {
    const text = textOf(render());
    expect(text).toContain('Last activity');
    expect(text).toContain('No activity yet');
  });

  it('#D12 members show as avatars with names, and I am "You"', () => {
    const html = render();
    expect(html).toContain('member-chips');
    expect(textOf(html.slice(html.indexOf('member-chips')))).toMatch(/^.*You Arun Mei/);
    expect(textOf(html)).not.toContain('Me, Arun');
  });

  it('#D13 the compact switcher stays, labelled for what it does', () => {
    expect(render()).toContain('<span>Viewing</span>');
    expect(render()).toContain('<option value="trip" selected="">Goa trip</option>');
  });
});
