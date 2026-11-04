import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Account, Person, SettlePlan } from '@splitbot/shared';
import { SettleUp } from '../src/components/SettleUp';
import { TransferAvatars } from '../src/components/TransferAvatars';
import { transferLabel, transferText } from '../src/settleLogic';

const PEOPLE: Person[] = [
  { id: 'me', name: 'Me' },
  { id: 'arun', name: 'Arun' },
  { id: 'kai', name: 'Kai' },
];

const ACCOUNT: Account = { owedCents: 3900, owedCount: 1, oweCents: 1400, oweCount: 1, netCents: 2500, people: [{ personId: 'arun', netCents: 3900 }, { personId: 'kai', netCents: -1400 }] };

const PLAN: SettlePlan = {
  transfers: [
    { from: 'arun', to: 'me', cents: 3900 },
    { from: 'me', to: 'kai', cents: 1400 },
  ],
  directDebtCount: 3,
  paymentsSaved: 1,
};

const nameOf = (id: string) => PEOPLE.find((p) => p.id === id)?.name ?? 'Unknown';
const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const render = () => renderToStaticMarkup(<SettleUp account={ACCOUNT} plan={PLAN} people={PEOPLE} error={null} onChange={() => {}} />);

describe('transferLabel', () => {
  it('#B26 is the sentence without the amount, and transferText still adds it', () => {
    const toMe = { from: 'arun', to: 'me', cents: 2000 };
    expect(transferLabel(toMe, nameOf)).toBe('Arun pays you');
    expect(transferText(toMe, nameOf)).toBe('Arun pays you $20.00');
    expect(transferLabel({ from: 'me', to: 'kai', cents: 2000 }, nameOf)).toBe('You pay Kai');
    expect(transferLabel({ from: 'arun', to: 'kai', cents: 2000 }, nameOf)).toBe('Arun pays Kai');
  });
});

describe('TransferAvatars', () => {
  it('#B27 goes avatar, arrow, avatar, and is decorative because the sentence says it', () => {
    const html = renderToStaticMarkup(<TransferAvatars from="arun" to="kai" people={PEOPLE} />);
    expect(html.indexOf('data-initials="A"')).toBeLessThan(html.indexOf('lucide-arrow-right'));
    expect(html.indexOf('lucide-arrow-right')).toBeLessThan(html.indexOf('data-initials="K"'));
    expect(html).toContain('aria-hidden="true"');
    expect(textOf(html)).toBe('');
  });

  it('#B28 uses the You avatar on whichever side I am', () => {
    expect(renderToStaticMarkup(<TransferAvatars from="me" to="kai" people={PEOPLE} />)).toContain('avatar-you');
    expect(renderToStaticMarkup(<TransferAvatars from="arun" to="me" people={PEOPLE} />)).toContain('avatar-you');
  });

  it('#B29 someone not in the list yet still renders', () => {
    expect(renderToStaticMarkup(<TransferAvatars from="gone" to="kai" people={PEOPLE} />)).toContain('data-initials="U"');
  });
});

describe('settlement card', () => {
  const rows = render().split('class="transfer-row').slice(1);

  it('#B30 has the avatars, the sentence, the amount and the button, in that order', () => {
    const row = rows[0]!;
    expect(row.indexOf('transfer-avatars')).toBeLessThan(row.indexOf('Arun pays you'));
    expect(row.indexOf('Arun pays you')).toBeLessThan(row.indexOf('$39.00'));
    expect(row.indexOf('$39.00')).toBeLessThan(row.indexOf('Record payment'));
  });

  it('#B31 Record payment is an action button', () => {
    expect(rows[0]).toMatch(/class="action"[^>]*>Record payment</);
  });
});

describe('Settle up states', () => {
  const noPlan: SettlePlan = { transfers: [], directDebtCount: 0, paymentsSaved: 0 };
  const renderWith = (account: Account | null, plan: SettlePlan | null, extra = {}) =>
    renderToStaticMarkup(<SettleUp account={account} plan={plan} people={PEOPLE} error={null} onChange={() => {}} {...extra} />);

  it('#B61 totals at zero are grey, the same as the balance card', () => {
    const html = renderWith({ ...ACCOUNT, owedCents: 0, owedCount: 0, oweCents: 0, oweCount: 0, netCents: 0, people: [] }, noPlan);
    expect(html.match(/<strong class="settled">\$0\.00<\/strong>/g)).toHaveLength(2);
    expect(renderWith(ACCOUNT, PLAN)).toContain('<strong class="owes-me">$39.00</strong>');
    expect(renderWith(ACCOUNT, PLAN)).toContain('<strong class="i-owe">$14.00</strong>');
  });

  it('#B32 loading is a skeleton', () => {
    const html = renderWith(null, null);
    expect(html).toContain('skeleton');
    expect(textOf(html)).toBe('Loading…');
  });

  it('#B33 nothing yet is an empty state with a way to start', () => {
    const html = renderWith({ ...ACCOUNT, people: [] }, noPlan);
    expect(html).toContain('empty-state');
    expect(html).toContain('>Add an expense<');
    expect(textOf(html)).toContain('Nothing to settle yet. Add an expense in the chat.');
  });

  it('#B34 all settled is a success state with nothing to do', () => {
    const html = renderWith(ACCOUNT, noPlan);
    expect(html).toContain('empty-state');
    expect(html).toContain('lucide-circle-check');
    expect(html).not.toContain('>Add an expense<');
    expect(textOf(html)).toContain('All settled up.');
  });
});
