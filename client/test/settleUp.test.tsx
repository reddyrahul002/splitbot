import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Account, Person, SettlePlan } from '@splitbot/shared';
import { SettleUp } from '../src/components/SettleUp';
import { savingsNote, settlementRequest, transferText } from '../src/settleLogic';

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

const PLAN: SettlePlan = {
  transfers: [
    { from: 'arun', to: 'me', cents: 3900 },
    { from: 'arun', to: 'kai', cents: 1400 },
    { from: 'mei', to: 'kai', cents: 1100 },
  ],
  directDebtCount: 4,
  paymentsSaved: 1,
};

const SETTLED: Account = { owedCents: 0, owedCount: 0, oweCents: 0, oweCount: 0, netCents: 0, people: [{ personId: 'arun', netCents: 0 }] };
const NO_PLAN: SettlePlan = { transfers: [], directDebtCount: 0, paymentsSaved: 0 };

const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const render = (props: { account?: Account | null; plan?: SettlePlan | null; error?: string | null } = {}) =>
  renderToStaticMarkup(
    <SettleUp
      account={props.account === undefined ? ACCOUNT : props.account}
      plan={props.plan === undefined ? PLAN : props.plan}
      people={PEOPLE}
      error={props.error ?? null}
      onChange={() => {}}
    />,
  );

describe('transferText', () => {
  const nameOf = (id: string) => PEOPLE.find((p) => p.id === id)?.name ?? 'Unknown';

  it('#66 uses "you" on whichever side I am', () => {
    expect(transferText({ from: 'arun', to: 'me', cents: 2000 }, nameOf)).toBe('Arun pays you $20.00');
    expect(transferText({ from: 'me', to: 'kai', cents: 2000 }, nameOf)).toBe('You pay Kai $20.00');
  });

  it('#67 names both people when I am not involved', () => {
    expect(transferText({ from: 'arun', to: 'kai', cents: 1400 }, nameOf)).toBe('Arun pays Kai $14.00');
  });
});

describe('savingsNote', () => {
  it('#68 says how many payments it saves, singular and plural', () => {
    expect(savingsNote(PLAN)).toBe('Saves 1 payment: 3 instead of 4 if everyone paid back individually.');
    expect(savingsNote({ ...PLAN, directDebtCount: 5, paymentsSaved: 2 })).toBe('Saves 2 payments: 3 instead of 5 if everyone paid back individually.');
  });

  it('#69 is hidden when nothing is saved', () => {
    expect(savingsNote({ ...PLAN, directDebtCount: 3, paymentsSaved: 0 })).toBeNull();
    expect(savingsNote(NO_PLAN)).toBeNull();
  });
});

describe('settlementRequest', () => {
  it('#70 turns a transfer into a settlement draft request by display name', () => {
    expect(settlementRequest({ from: 'arun', to: 'me', cents: 3900 }, PEOPLE)).toEqual({ kind: 'settlement', from: 'Arun', to: 'Me', cents: 3900 });
  });

  it('#130 adds the group when one is given', () => {
    expect(settlementRequest({ from: 'arun', to: 'me', cents: 3900 }, PEOPLE, 'g1')).toEqual({ kind: 'settlement', from: 'Arun', to: 'Me', cents: 3900, groupId: 'g1' });
  });

  it('#71 is null if a person is missing, so a provisional name is never created by accident', () => {
    expect(settlementRequest({ from: 'gone', to: 'me', cents: 3900 }, PEOPLE)).toBeNull();
    expect(settlementRequest({ from: 'arun', to: 'gone', cents: 3900 }, PEOPLE)).toBeNull();
  });
});

describe('SettleUp', () => {
  it('#72 shows the overall totals', () => {
    const text = textOf(render());
    expect(text).toContain('You are owed $64.00');
    expect(text).toContain('You owe $25.00');
    expect(text).toContain('Net balance +$39.00');
  });

  it('#73 lists each transfer with its own Record payment button', () => {
    const html = render();
    const text = textOf(html);
    expect(text).toContain('Arun pays you $39.00');
    expect(text).toContain('Arun pays Kai $14.00');
    expect(text).toContain('Mei pays Kai $11.00');
    expect(html.match(/Record payment/g)).toHaveLength(3);
  });

  it('#74 colours a transfer by whether it involves me: to me green, from me red, others neutral', () => {
    const html = render({ plan: { ...PLAN, transfers: [{ from: 'arun', to: 'me', cents: 100 }, { from: 'me', to: 'kai', cents: 200 }, { from: 'mei', to: 'kai', cents: 300 }] } });
    expect(html).toMatch(/class="transfer-row owes-me"[^]*Arun pays you/);
    expect(html).toMatch(/class="transfer-row i-owe"[^]*You pay Kai/);
    expect(html).toMatch(/class="transfer-row settled"[^]*Mei pays Kai/);
  });

  it('#75 shows the savings note and the caption about differing amounts', () => {
    const text = textOf(render());
    expect(text).toContain('Saves 1 payment: 3 instead of 4 if everyone paid back individually.');
    expect(text).toContain('can differ from the direct debts');
  });

  it('#76 hides the savings note when nothing is saved', () => {
    expect(textOf(render({ plan: { ...PLAN, directDebtCount: 3, paymentsSaved: 0 } }))).not.toContain('Saves');
  });

  it('#77 never calls the list "minimum"', () => {
    expect(render().toLowerCase()).not.toContain('minimum');
  });

  it('#78 no transfers with people known: all settled up, no buttons or note', () => {
    const html = render({ account: SETTLED, plan: NO_PLAN });
    expect(textOf(html)).toContain('All settled up');
    expect(html).not.toContain('Record payment');
    expect(textOf(html)).not.toContain('Saves');
    expect(textOf(html)).not.toContain('can differ');
  });

  it('#79 no one yet: points to the chat instead of saying settled', () => {
    const text = textOf(render({ account: { ...SETTLED, people: [] }, plan: NO_PLAN }));
    expect(text).toContain('Nothing to settle yet');
    expect(text).not.toContain('All settled up');
  });

  it('#80 loading, and an error before any data', () => {
    expect(textOf(render({ account: null, plan: null }))).toBe('Loading…');
    const html = render({ account: null, plan: null, error: 'Server down' });
    expect(html).toContain('role="alert"');
    expect(textOf(html)).toBe('Server down');
  });

  it('#81 an error after data keeps the list without a second alert (the left column shows it)', () => {
    const html = render({ error: 'Server down' });
    expect(textOf(html)).toContain('Arun pays you $39.00');
    expect(html).not.toContain('role="alert"');
  });
});
