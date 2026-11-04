import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Account, Person } from '@splitbot/shared';
import { AccountSummary } from '../src/components/AccountSummary';
import { ToneIcon } from '../src/components/ToneIcon';

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
    { personId: 'zed', netCents: 0 },
  ],
};

const render = (account: Account, people = PEOPLE) => renderToStaticMarkup(<AccountSummary account={account} people={people} error={null} />);
const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('balance card', () => {
  it('#B1 leads with the net balance', () => {
    const html = render(ACCOUNT);
    expect(html.indexOf('class="net')).toBeLessThan(html.indexOf('You are owed'));
    expect(html.indexOf('class="net')).toBeLessThan(html.indexOf('You owe'));
  });

  it('#B2 shows who is behind each side of the split, as avatars with their names for screen readers', () => {
    const html = render(ACCOUNT);
    expect(html).toContain('aria-label="Arun, Mei"');
    expect(html).toContain('aria-label="Kai"');
  });

  it('#B3 a side with nobody on it has no avatars', () => {
    const html = render({ ...ACCOUNT, oweCents: 0, oweCount: 0, people: ACCOUNT.people.filter((p) => p.netCents >= 0) });
    expect(html).toContain('aria-label="Arun, Mei"');
    expect(html).not.toContain('aria-label="Kai"');
  });

  it('#B4 the net balance has an icon as well as a colour', () => {
    expect(render(ACCOUNT)).toContain('lucide-arrow-down-left');
    expect(render({ ...ACCOUNT, netCents: -100 })).toContain('lucide-arrow-up-right');
    expect(render({ ...ACCOUNT, netCents: 0 })).toContain('lucide-check');
  });

  it('#B59 a side at zero is grey, because nothing is owed', () => {
    const html = render({ owedCents: 0, owedCount: 0, oweCents: 0, oweCount: 0, netCents: 0, people: [] });
    expect(html).toContain('<strong class="settled">$0.00</strong>');
    expect(html).not.toContain('<strong class="owes-me">');
    expect(html).not.toContain('<strong class="i-owe">');
  });

  it('#B60 a side with money on it keeps its colour', () => {
    const html = render(ACCOUNT);
    expect(html).toContain('<strong class="owes-me">$64.00</strong>');
    expect(html).toContain('<strong class="i-owe">$25.00</strong>');
  });

  it('#B5 before the first person there is an empty state, not a blank card', () => {
    const html = render({ owedCents: 0, owedCount: 0, oweCents: 0, oweCount: 0, netCents: 0, people: [] });
    expect(html).toContain('empty-state');
    expect(textOf(html)).toContain('No one to show yet. Add an expense in the chat.');
  });
});

describe('person row', () => {
  it('#B6 has an avatar, a name and an amount', () => {
    const row = render(ACCOUNT).split('person-row')[1]!;
    expect(row).toContain('data-initials="A"');
    expect(textOf(`<${row}`)).toContain('Arun owes you $38.00');
  });

  it('#B7 the inner list adds no list semantics, so each person reads as one row', () => {
    expect(render(ACCOUNT).match(/<ul class="person-line" role="none">/g)).toHaveLength(4);
    expect(render(ACCOUNT).match(/class="person-row"/g)).toHaveLength(4);
  });

  it('#B8 each direction has its own icon, so it never rests on colour', () => {
    const rows = render(ACCOUNT).split('class="person-row"').slice(1);
    expect(rows[0]).toContain('lucide-arrow-down-left');
    expect(rows[2]).toContain('lucide-arrow-up-right');
    expect(rows[3]).toContain('lucide-check');
  });

  it('#B9 a person not in the list yet still gets an avatar', () => {
    expect(render(ACCOUNT, [{ id: 'me', name: 'Me' }])).toContain('data-initials="U"');
  });
});

describe('ToneIcon', () => {
  it('#B10 is decorative, and coloured by the same tone as the amount', () => {
    const html = renderToStaticMarkup(<ToneIcon cents={100} />);
    expect(html).toContain('owes-me');
    expect(html).toContain('aria-hidden="true"');
    expect(textOf(html)).toBe('');
  });
});
