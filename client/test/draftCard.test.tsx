import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Draft, Person } from '@splitbot/shared';
import { DraftCard } from '../src/components/DraftCard';
import { DraftHeader, DraftSummary, ShareRow } from '../src/components/DraftParts';

const PEOPLE: Person[] = [
  { id: 'me', name: 'Me' },
  { id: 'arun', name: 'Arun' },
  { id: 'mei', name: 'Mei' },
];

const EXPENSE = {
  id: 'd1',
  kind: 'expense',
  expense: {
    id: 'e1',
    description: 'Dinner',
    category: 'Food & Drink',
    date: '2026-11-03',
    totalCents: 9000,
    paidBy: 'me',
    shares: [
      { personId: 'me', cents: 2600 },
      { personId: 'arun', cents: 3800 },
      { personId: 'new:aroon', cents: 2600 },
    ],
    splitMeta: { splitType: 'equal' },
    createdAt: '2026-11-03T10:00:00.000Z',
  },
  newPeople: [{ id: 'new:aroon', name: 'Aroon' }],
  warnings: [
    { code: 'CLOSE_NAME', message: "'Aroon' looks like existing person 'Arun'. Use Arun?", suggestion: { name: 'Aroon', person: { id: 'arun', name: 'Arun' } } },
    { code: 'AMOUNT_NOT_IN_MESSAGE', message: "Total $95.00 wasn't in your message, please check." },
  ],
} as unknown as Draft;

const PAYMENT = {
  id: 'd2',
  kind: 'settlement',
  settlement: { id: 's1', from: 'arun', to: 'me', cents: 2000, date: '2026-11-03' },
  newPeople: [],
  warnings: [],
} as unknown as Draft;

const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ').trim();
const render = (draft: Draft) => renderToStaticMarkup(<DraftCard draft={draft} people={PEOPLE} onSaved={() => {}} />);

describe('DraftHeader', () => {
  it('#C1 an open draft asks for review and says what kind it is', () => {
    const text = textOf(renderToStaticMarkup(<DraftHeader kind="expense" status="open" />));
    expect(text).toContain('Review before saving');
    expect(text).toContain('Expense');
    expect(textOf(renderToStaticMarkup(<DraftHeader kind="settlement" status="open" />))).toContain('Payment');
  });

  it('#C2 a saved draft says so with a check icon, not just colour', () => {
    const html = renderToStaticMarkup(<DraftHeader kind="expense" status="saved" />);
    expect(textOf(html)).toContain('Saved');
    expect(textOf(html)).not.toContain('Review before saving');
    expect(html).toContain('lucide-check');
  });

  it('#C3 an expired draft says so', () => {
    const html = renderToStaticMarkup(<DraftHeader kind="expense" status="expired" />);
    expect(textOf(html)).toContain('Draft expired');
    expect(textOf(html)).not.toContain('Review before saving');
  });
});

describe('DraftSummary', () => {
  it('#C4 a saved expense reads as a line, with its chip, payer, date, group and total', () => {
    const html = renderToStaticMarkup(<DraftSummary draft={EXPENSE} nameOf={(id) => PEOPLE.find((p) => p.id === id)?.name ?? 'Unknown'} people={PEOPLE} groupName="Goa trip" />);
    const text = textOf(html);
    expect(html).toContain('aria-label="Food &amp; Drink"');
    expect(text).toContain('Dinner');
    expect(text).toContain('Paid by you');
    expect(text).toContain('Goa trip');
    expect(text).toContain('$90.00');
  });

  it('#C5 a saved payment reads as who paid whom, with avatars', () => {
    const html = renderToStaticMarkup(<DraftSummary draft={PAYMENT} nameOf={(id) => PEOPLE.find((p) => p.id === id)?.name ?? 'Unknown'} people={PEOPLE} />);
    expect(html).toContain('transfer-avatars');
    expect(textOf(html)).toContain('Arun paid you');
    expect(textOf(html)).toContain('$20.00');
  });
});

describe('ShareRow', () => {
  const row = (props: { personId?: string; isNew?: boolean } = {}) =>
    renderToStaticMarkup(
      <table>
        <tbody>
          <ShareRow personId={props.personId ?? 'arun'} name="Arun" cents={3800} isNew={props.isNew ?? false} />
        </tbody>
      </table>,
    );

  it('#C6 has an avatar, the name and the formatted share', () => {
    const html = row();
    expect(html).toContain('data-initials="A"');
    expect(textOf(html)).toBe('Arun $38.00');
  });

  it('#C7 me gets the You avatar', () => {
    expect(row({ personId: 'me' })).toContain('avatar-you');
  });

  it('#C8 a new person is marked in words', () => {
    expect(textOf(row({ isNew: true }))).toBe('Arun new $38.00');
  });
});

describe('DraftCard, open', () => {
  const html = render(EXPENSE);

  it('#C9 has the review heading and an accent style', () => {
    expect(textOf(html)).toContain('Review before saving');
    expect(html).toContain('class="card open"');
  });

  it('#C10 each warning is an amber callout with an icon', () => {
    expect(html.match(/class="warning"/g)).toHaveLength(2);
    expect(html.match(/lucide-triangle-alert/g)).toHaveLength(2);
    expect(textOf(html)).toContain("'Aroon' looks like existing person 'Arun'. Use Arun?");
  });

  it('#C11 the one-click fix stays, only on the warning that has one', () => {
    expect(html.match(/>Use Arun</g)).toHaveLength(1);
  });

  it('#C12 Confirm is the primary button, Discard the ghost', () => {
    expect(html).toMatch(/class="primary with-icon"[^]*>Confirm</);
    expect(html).toMatch(/class="ghost"[^>]*>Discard</);
    expect(html.indexOf('>Confirm<')).toBeLessThan(html.indexOf('>Discard<'));
  });

  it('#C13 the share table shows avatars and amounts, and new people are marked', () => {
    expect(html).toContain('<table class="shares">');
    expect(html).toContain('avatar-you');
    expect(textOf(html)).toContain('Arun $38.00');
    expect(textOf(html)).toContain('Aroon new $26.00');
  });

  it('#C14 every editable field is still there', () => {
    for (const label of ['Description', 'Amount', 'Paid by', 'Category', 'Date']) expect(html).toContain(`<span>${label}</span>`);
    expect(html).not.toContain('disabled=""');
  });

  it('#C15 money in the amount field comes from formatCents', () => {
    expect(html).toContain('value="$90.00"');
  });
});

describe('DraftCard, payment', () => {
  const html = render(PAYMENT);

  it('#C16 shows who pays whom with avatars, and only the fields a payment has', () => {
    expect(html).toContain('transfer-avatars');
    expect(textOf(html)).toContain('Arun paid you');
    expect(html).toContain('<span>Amount</span>');
    expect(html).not.toContain('<span>Description</span>');
    expect(html).not.toContain('<table');
  });

  it('#C47 says "you" on whichever side I am, matching the saved wording', () => {
    const fromMe = { ...PAYMENT, settlement: { id: 's1', from: 'me', to: 'arun', cents: 2000, date: '2026-11-03' } } as Draft;
    expect(textOf(render(fromMe))).toContain('You paid Arun');
    expect(textOf(render(PAYMENT))).not.toContain('paid Me');
  });

  it('#C48 a new person keeps their badge in the sentence', () => {
    const toNew = { ...PAYMENT, settlement: { id: 's1', from: 'me', to: 'new:kai', cents: 2000, date: '2026-11-03' }, newPeople: [{ id: 'new:kai', name: 'Kai' }] } as Draft;
    expect(textOf(render(toNew))).toContain('You paid Kai new');
  });
});
