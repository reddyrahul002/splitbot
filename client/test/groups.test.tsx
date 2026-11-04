import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Draft, Group, GroupSummary, Person } from '@splitbot/shared';
import { DraftCard } from '../src/components/DraftCard';
import { Groups } from '../src/components/Groups';
import { SettleUp } from '../src/components/SettleUp';
import { addablePeople, joiningNames, memberBalanceText } from '../src/groupLogic';

const PEOPLE: Person[] = [
  { id: 'me', name: 'Me' },
  { id: 'arun', name: 'Arun' },
  { id: 'mei', name: 'Mei' },
  { id: 'kai', name: 'Kai' },
];
const nameOf = (id: string) => PEOPLE.find((p) => p.id === id)?.name ?? 'Unknown';

const TRIP: Group = { id: 'trip', name: 'Trip', memberIds: ['me', 'arun', 'mei'] };
const HOME: Group = { id: 'home', name: 'Home', memberIds: ['me'] };

const TRIP_SUMMARY: GroupSummary = {
  group: TRIP,
  balances: [
    { personId: 'me', netCents: 6400 },
    { personId: 'arun', netCents: -3800 },
    { personId: 'mei', netCents: -2600 },
  ],
  account: {
    owedCents: 6400,
    owedCount: 2,
    oweCents: 0,
    oweCount: 0,
    netCents: 6400,
    people: [
      { personId: 'arun', netCents: 3800 },
      { personId: 'mei', netCents: 2600 },
    ],
  },
  plan: {
    transfers: [
      { from: 'arun', to: 'me', cents: 3800 },
      { from: 'mei', to: 'me', cents: 2600 },
    ],
    directDebtCount: 2,
    paymentsSaved: 0,
  },
  recordCount: 1,
};

const HOME_SUMMARY: GroupSummary = {
  group: HOME,
  recordCount: 0,
  balances: [{ personId: 'me', netCents: 0 }],
  account: { owedCents: 0, owedCount: 0, oweCents: 0, oweCount: 0, netCents: 0, people: [] },
  plan: { transfers: [], directDebtCount: 0, paymentsSaved: 0 },
};

const EXPENSE_DRAFT: Draft = {
  id: 'd1',
  kind: 'expense',
  newPeople: [{ id: 'new:kai', name: 'Kai' }],
  warnings: [],
  expense: {
    id: 'e1',
    description: 'Dinner',
    category: 'Food & Drink',
    date: '2026-11-03',
    totalCents: 9000,
    paidBy: 'me',
    shares: [
      { personId: 'me', cents: 4500 },
      { personId: 'new:kai', cents: 4500 },
    ],
    splitMeta: { splitType: 'equal' },
    createdAt: '2026-11-03T00:00:00.000Z',
  },
};

const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('memberBalanceText', () => {
  it('#135 says who owes and who is owed, with "you" for me', () => {
    expect(memberBalanceText({ personId: 'me', netCents: 6400 }, nameOf)).toBe('You are owed $64.00');
    expect(memberBalanceText({ personId: 'me', netCents: -500 }, nameOf)).toBe('You owe $5.00');
    expect(memberBalanceText({ personId: 'arun', netCents: -3800 }, nameOf)).toBe('Arun owes $38.00');
    expect(memberBalanceText({ personId: 'kai', netCents: 2500 }, nameOf)).toBe('Kai is owed $25.00');
  });

  it('#136 zero reads as settled', () => {
    expect(memberBalanceText({ personId: 'me', netCents: 0 }, nameOf)).toBe('You are settled up');
    expect(memberBalanceText({ personId: 'mei', netCents: 0 }, nameOf)).toBe('Mei is settled up');
  });
});

describe('addablePeople', () => {
  it('#137 lists only people who are not members yet', () => {
    expect(addablePeople(TRIP, PEOPLE).map((p) => p.id)).toEqual(['kai']);
    expect(addablePeople({ ...TRIP, memberIds: PEOPLE.map((p) => p.id) }, PEOPLE)).toEqual([]);
  });
});

describe('joiningNames', () => {
  const known = [...PEOPLE, ...EXPENSE_DRAFT.newPeople];

  it('#138 names draft people who are not in the group, including new ones', () => {
    expect(joiningNames(EXPENSE_DRAFT, HOME, known)).toEqual(['Kai']);
    expect(joiningNames(EXPENSE_DRAFT, { ...HOME, memberIds: ['me', 'new:kai'] }, known)).toEqual([]);
  });

  it('#139 counts a payer with no share, and both sides of a payment, once each', () => {
    const base = EXPENSE_DRAFT as Extract<Draft, { kind: 'expense' }>;
    const payerOnly: Draft = { ...base, newPeople: [], expense: { ...base.expense, paidBy: 'mei', shares: [{ personId: 'me', cents: 9000 }] } };
    expect(joiningNames(payerOnly, HOME, PEOPLE)).toEqual(['Mei']);

    const payment: Draft = { id: 'd2', kind: 'settlement', newPeople: [], warnings: [], settlement: { id: 's1', from: 'arun', to: 'mei', cents: 100, date: '2026-11-03' } };
    expect(joiningNames(payment, HOME, PEOPLE)).toEqual(['Arun', 'Mei']);
  });
});

describe('DraftCard group dropdown', () => {
  const render = (draft: Draft, groups: Group[] = [TRIP, HOME]) =>
    renderToStaticMarkup(<DraftCard draft={draft} people={PEOPLE} groups={groups} onSaved={() => {}} />);

  it('#140 offers every group and "No group", starting on "No group"', () => {
    const html = render(EXPENSE_DRAFT);
    expect(html).toContain('<span>Group</span>');
    expect(html).toMatch(/<option value="" selected="">No group<\/option>/);
    expect(html).toContain('<option value="trip">Trip</option>');
    expect(html).toContain('<option value="home">Home</option>');
  });

  it('#141 is hidden when there are no groups, so the card looks as before', () => {
    expect(render(EXPENSE_DRAFT, [])).not.toContain('<span>Group</span>');
    expect(renderToStaticMarkup(<DraftCard draft={EXPENSE_DRAFT} people={PEOPLE} onSaved={() => {}} />)).not.toContain('<span>Group</span>');
  });

  it('#142 a draft already in a group shows it, and says who will join', () => {
    const inHome = { ...EXPENSE_DRAFT, expense: { ...(EXPENSE_DRAFT as Extract<Draft, { kind: 'expense' }>).expense, groupId: 'home' } } as Draft;
    const html = render(inHome);
    expect(html).toMatch(/<option value="home" selected="">Home<\/option>/);
    expect(textOf(html)).toContain('Adds Kai to Home');
  });

  it('#143 no note when no one would join, or no group is picked', () => {
    expect(textOf(render(EXPENSE_DRAFT))).not.toContain('Adds');
    const allIn = { ...EXPENSE_DRAFT, newPeople: [], expense: { ...(EXPENSE_DRAFT as Extract<Draft, { kind: 'expense' }>).expense, groupId: 'trip', shares: [{ personId: 'arun', cents: 9000 }] } } as Draft;
    expect(textOf(render(allIn))).not.toContain('Adds');
  });

  it('#144 a payment draft offers groups too', () => {
    const payment: Draft = { id: 'd2', kind: 'settlement', newPeople: [], warnings: [], settlement: { id: 's1', from: 'arun', to: 'me', cents: 100, date: '2026-11-03', groupId: 'trip' } };
    expect(render(payment)).toMatch(/<option value="trip" selected="">Trip<\/option>/);
  });
});

describe('SettleUp inside a group', () => {
  const render = (groupId?: string) =>
    renderToStaticMarkup(<SettleUp account={TRIP_SUMMARY.account} plan={TRIP_SUMMARY.plan} people={PEOPLE} error={null} onChange={() => {}} groupId={groupId} groups={[TRIP]} />);

  it('#145 the caption talks about the group, not the left column', () => {
    expect(textOf(render('trip'))).toContain('simplify across this group');
    expect(textOf(render('trip'))).not.toContain('on the left');
    expect(textOf(render())).toContain('on the left');
  });

  const NOTE = 'If this payment belongs to a group, pick it on the card, or record it in the Groups tab.';

  it('#155 the overall tab warns about group payments, only when groups exist and there is something to pay', () => {
    expect(textOf(render().replace(/&#x27;/g, "'"))).toContain(NOTE);
    const noGroups = renderToStaticMarkup(<SettleUp account={TRIP_SUMMARY.account} plan={TRIP_SUMMARY.plan} people={PEOPLE} error={null} onChange={() => {}} groups={[]} />);
    expect(textOf(noGroups)).not.toContain('belongs to a group');
    const settled = renderToStaticMarkup(<SettleUp account={TRIP_SUMMARY.account} plan={HOME_SUMMARY.plan} people={PEOPLE} error={null} onChange={() => {}} groups={[TRIP]} />);
    expect(textOf(settled)).not.toContain('belongs to a group');
  });

  it('#156 inside a group the note is not shown', () => {
    expect(textOf(render('trip'))).not.toContain('belongs to a group');
  });
});

describe('Groups', () => {
  const render = (props: { groups?: GroupSummary[] | null; error?: string | null } = {}) =>
    renderToStaticMarkup(<Groups groups={props.groups === undefined ? [TRIP_SUMMARY, HOME_SUMMARY] : props.groups} people={PEOPLE} error={props.error ?? null} onChange={() => {}} />);

  it('#146 always offers a way to create a group', () => {
    expect(textOf(render())).toContain('Create group');
    expect(textOf(render({ groups: [] }))).toContain('Create group');
  });

  it('#147 no groups yet: says what to do, with nothing else', () => {
    const text = textOf(render({ groups: [] }));
    expect(text).toContain('No groups yet');
    expect(text).not.toContain('Members');
  });

  it('#148 starts on the first group, with the others to choose from', () => {
    const html = render();
    expect(html).toMatch(/<option value="trip" selected="">Trip<\/option>/);
    expect(html).toContain('<option value="home">Home</option>');
  });

  it('#149 shows members, balances and the group’s own settle-up', () => {
    const html = render();
    const text = textOf(html);
    expect(text).toContain('Members');
    expect(text).toContain('You are owed $64.00');
    expect(text).toContain('Arun owes $38.00');
    expect(text).toContain('Mei owes $26.00');
    expect(text).toContain('Arun pays you $38.00');
    expect(html.match(/Record payment/g)).toHaveLength(2);
  });

  it('#150 can add only people who are not members yet', () => {
    const html = render();
    expect(html).toContain('<option value="kai">Kai</option>');
    expect(html).not.toContain('<option value="arun">Arun</option>');
    expect(textOf(html)).toContain('Add member');
  });

  it('#151 says how to bring in someone who is not in the app yet', () => {
    expect(textOf(render())).toContain('joins this group automatically');
  });

  it('#152 warns that payments outside the group do not change it', () => {
    expect(textOf(render())).toContain('Payments recorded outside this group');
  });

  it('#157 a group with members but no records says nothing to settle yet, and how to start', () => {
    const fresh: GroupSummary = { ...HOME_SUMMARY, group: { ...HOME, memberIds: ['me', 'arun'] }, account: { ...HOME_SUMMARY.account, people: [{ personId: 'arun', netCents: 0 }] } };
    const text = textOf(render({ groups: [fresh] }));
    expect(text).toContain('Nothing to settle yet. Add an expense in the chat and pick this group on its card.');
    expect(text).not.toContain('All settled up');
  });

  it('#158 a group whose records are all paid says all settled up', () => {
    const paid: GroupSummary = { ...TRIP_SUMMARY, recordCount: 3, plan: HOME_SUMMARY.plan, account: { ...HOME_SUMMARY.account, people: [{ personId: 'arun', netCents: 0 }] } };
    const text = textOf(render({ groups: [paid] }));
    expect(text).toContain('All settled up');
    expect(text).not.toContain('Nothing to settle yet');
  });

  it('#153 loading, and an error before any data', () => {
    expect(textOf(render({ groups: null }))).toBe('Loading…');
    const html = render({ groups: null, error: 'Server down' });
    expect(html).toContain('role="alert"');
    expect(textOf(html)).toBe('Server down');
  });

  it('#154 an error after data keeps the group without a second alert (the left column shows it)', () => {
    const html = render({ error: 'Server down' });
    expect(textOf(html)).toContain('Arun owes $38.00');
    expect(html).not.toContain('role="alert"');
  });
});
