import { describe, expect, it } from 'vitest';
import type { Draft, ExpenseDraftInput, Person } from '@splitbot/shared';
import {
  applyEdits,
  buildExpenseDraft,
  buildSettlementDraft,
  createDraftStore,
  DraftError,
  finalizeDraft,
} from '../src/drafts';
import { SplitError } from '../src/domain/split';

const ME: Person = { id: 'me', name: 'Rahul' };
const ARUN: Person = { id: 'arun', name: 'Arun' };
const MEI: Person = { id: 'mei', name: 'Mei' };
const JOSE: Person = { id: 'jose', name: 'José' };
const PEOPLE = [ME, ARUN, MEI, JOSE];
const TODAY = '2026-11-03';
const OPTS = { today: TODAY };

const DINNER: ExpenseDraftInput = {
  description: 'Dinner',
  category: 'Food & Drink',
  totalCents: 9000,
  paidBy: 'me',
  participants: ['me', 'Arun', 'Mei'],
  splitType: 'equal',
  adjustments: [{ person: 'Arun', cents: 1200, note: 'drinks' }],
};

function expenseOf(draft: Draft) {
  if (draft.kind !== 'expense') throw new Error('expected an expense draft');
  return draft.expense;
}

function sharesOf(draft: Draft): Record<string, number> {
  return Object.fromEntries(expenseOf(draft).shares.map((s) => [s.personId, s.cents]));
}

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof DraftError || e instanceof SplitError) return e.code;
    throw e;
  }
  return undefined;
}

function sequentialIds(): () => string {
  let n = 0;
  return () => `id${++n}`;
}

describe('draft store', () => {
  const draft = () => buildExpenseDraft(DINNER, PEOPLE, OPTS);

  it('#11 put/get round trip; builder ids are unique', () => {
    const store = createDraftStore();
    const a = draft();
    const b = draft();
    store.put(a);
    expect(store.get(a.id)).toEqual(a);
    expect(a.id).not.toBe(b.id);
    expect(store.get(b.id)).toBeUndefined();
  });

  it('#12 found at TTL − 1 ms, gone at TTL', () => {
    let now = 1_000;
    const store = createDraftStore({ ttlMs: 60_000, now: () => now });
    const a = draft();
    store.put(a);
    now += 59_999;
    expect(store.get(a.id)).toEqual(a);
    now += 1;
    expect(store.get(a.id)).toBeUndefined();
  });

  it('#13 take removes; a second take → undefined; restore brings it back', () => {
    const store = createDraftStore();
    const a = draft();
    store.put(a);
    expect(store.take(a.id)).toEqual(a);
    expect(store.take(a.id)).toBeUndefined();
    expect(store.get(a.id)).toBeUndefined();
    store.restore(a);
    expect(store.get(a.id)).toEqual(a);
  });

  it('#14 expired drafts are swept on put', () => {
    let now = 0;
    const store = createDraftStore({ ttlMs: 1_000, now: () => now });
    store.put(draft());
    store.put(draft());
    expect(store.size()).toBe(2);
    now = 1_000;
    store.put(draft());
    expect(store.size()).toBe(1);
  });
});

describe('buildExpenseDraft', () => {
  it('#15 dinner: 2600/3800/2600, no new people, no warnings', () => {
    const d = buildExpenseDraft(DINNER, PEOPLE, OPTS);
    expect(d.kind).toBe('expense');
    expect(expenseOf(d).shares).toEqual([
      { personId: 'me', cents: 2600 },
      { personId: 'arun', cents: 3800 },
      { personId: 'mei', cents: 2600 },
    ]);
    expect(expenseOf(d)).toMatchObject({
      description: 'Dinner',
      category: 'Food & Drink',
      date: TODAY,
      totalCents: 9000,
      paidBy: 'me',
      splitMeta: { splitType: 'equal', adjustments: [{ person: 'arun', cents: 1200, note: 'drinks' }] },
    });
    expect(d.newPeople).toEqual([]);
    expect(d.warnings).toEqual([]);
  });

  it('#16 names resolve trimmed, case-insensitive and NFC; "me" and me\'s name → me', () => {
    const d = buildExpenseDraft(
      { ...DINNER, adjustments: undefined, paidBy: 'Rahul', participants: ['me', ' arun ', 'MEI', 'José'] },
      PEOPLE,
      OPTS,
    );
    expect(expenseOf(d).paidBy).toBe('me');
    expect(expenseOf(d).shares.map((s) => s.personId)).toEqual(['me', 'arun', 'mei', 'jose']);
    expect(d.newPeople).toEqual([]);
    const upper = buildExpenseDraft({ ...DINNER, adjustments: undefined, participants: ['ARUN', 'me'] }, PEOPLE, OPTS);
    expect(expenseOf(upper).shares.map((s) => s.personId)).toEqual(['arun', 'me']);
  });

  it('#17 unknown "Kai" → new:kai everywhere, listed in newPeople', () => {
    const d = buildExpenseDraft(
      { ...DINNER, adjustments: undefined, paidBy: 'Kai', participants: ['me', 'Kai'], totalCents: 1000 },
      PEOPLE,
      OPTS,
    );
    expect(expenseOf(d).paidBy).toBe('new:kai');
    expect(sharesOf(d)).toEqual({ me: 500, 'new:kai': 500 });
    expect(d.newPeople).toEqual([{ id: 'new:kai', name: 'Kai' }]);
  });

  it('#18 "Kai" and "kai" in one expense → DUPLICATE_PARTICIPANT', () => {
    expect(
      codeOf(() => buildExpenseDraft({ ...DINNER, adjustments: undefined, participants: ['Kai', 'kai'] }, PEOPLE, OPTS)),
    ).toBe('DUPLICATE_PARTICIPANT');
  });

  it('#19 name-keyed adjustments and split maps become id-keyed splitMeta', () => {
    const base = { ...DINNER, adjustments: undefined, participants: ['me', 'Arun'], totalCents: 9000 };
    const exact = buildExpenseDraft({ ...base, splitType: 'exact', exact: { Rahul: 5000, arun: 4000 } }, PEOPLE, OPTS);
    expect(expenseOf(exact).splitMeta).toEqual({ splitType: 'exact', exact: { me: 5000, arun: 4000 } });
    expect(sharesOf(exact)).toEqual({ me: 5000, arun: 4000 });

    const percent = buildExpenseDraft({ ...base, splitType: 'percent', percent: { me: 60, ARUN: 40 } }, PEOPLE, OPTS);
    expect(expenseOf(percent).splitMeta).toEqual({ splitType: 'percent', percent: { me: 60, arun: 40 } });

    const shares = buildExpenseDraft(
      { ...base, splitType: 'shares', shares: { me: 2, ' Arun': 1 }, adjustments: [{ person: 'ARUN', cents: 300 }] },
      PEOPLE,
      OPTS,
    );
    expect(expenseOf(shares).splitMeta).toEqual({
      splitType: 'shares',
      shares: { me: 2, arun: 1 },
      adjustments: [{ person: 'arun', cents: 300 }],
    });
    expect(sharesOf(shares)).toEqual({ me: 5800, arun: 3200 });
  });

  it('#20 "Aroon" → new person plus a CLOSE_NAME warning suggesting Arun', () => {
    const d = buildExpenseDraft({ ...DINNER, adjustments: undefined, participants: ['me', 'Aroon'] }, PEOPLE, OPTS);
    expect(d.newPeople).toEqual([{ id: 'new:aroon', name: 'Aroon' }]);
    expect(d.warnings).toEqual([
      {
        code: 'CLOSE_NAME',
        message: "'Aroon' looks like existing person 'Arun'. Use Arun?",
        suggestion: { name: 'Aroon', person: ARUN },
      },
    ]);
  });

  it('#21 amount check runs only when a message is given', () => {
    const input = { ...DINNER, adjustments: undefined, totalCents: 9500 };
    const withMsg = buildExpenseDraft(input, PEOPLE, { ...OPTS, message: 'Dinner $90 split with Arun and Mei' });
    expect(withMsg.warnings.map((w) => w.message)).toEqual(["Total $95.00 wasn't in your message, please check."]);
    expect(buildExpenseDraft(input, PEOPLE, OPTS).warnings).toEqual([]);
  });

  it('#22 date defaults to today; an impossible date → INVALID_DATE', () => {
    expect(expenseOf(buildExpenseDraft(DINNER, PEOPLE, OPTS)).date).toBe(TODAY);
    expect(expenseOf(buildExpenseDraft({ ...DINNER, date: '2026-10-31' }, PEOPLE, OPTS)).date).toBe('2026-10-31');
    expect(codeOf(() => buildExpenseDraft({ ...DINNER, date: '2026-02-30' }, PEOPLE, OPTS))).toBe('INVALID_DATE');
  });

  it('#23 split errors pass through with their code and dollar message', () => {
    const input: ExpenseDraftInput = {
      ...DINNER,
      adjustments: undefined,
      participants: ['me', 'Arun'],
      splitType: 'exact',
      exact: { me: 5000, Arun: 3700 },
    };
    expect(() => buildExpenseDraft(input, PEOPLE, OPTS)).toThrow(SplitError);
    expect(() => buildExpenseDraft(input, PEOPLE, OPTS)).toThrow('$87.00');
    expect(codeOf(() => buildExpenseDraft(input, PEOPLE, OPTS))).toBe('EXACT_SUM_MISMATCH');
  });

  it('#25 "constructor" is just a new person', () => {
    const d = buildExpenseDraft(
      { ...DINNER, adjustments: undefined, participants: ['me', 'constructor'], splitType: 'exact', exact: { me: 4500, constructor: 4500 } },
      PEOPLE,
      OPTS,
    );
    expect(d.newPeople).toEqual([{ id: 'new:constructor', name: 'constructor' }]);
    expect(sharesOf(d)).toEqual({ me: 4500, 'new:constructor': 4500 });
  });
});

describe('buildSettlementDraft', () => {
  it('#24 resolves names, rejects same person and bad amounts, warns on close names', () => {
    const d = buildSettlementDraft({ from: 'Arun', to: 'me', cents: 2000 }, PEOPLE, OPTS);
    expect(d).toMatchObject({ kind: 'settlement', newPeople: [], warnings: [] });
    if (d.kind !== 'settlement') throw new Error('expected a settlement draft');
    expect(d.settlement).toMatchObject({ from: 'arun', to: 'me', cents: 2000, date: TODAY });

    expect(codeOf(() => buildSettlementDraft({ from: 'arun', to: ' Arun', cents: 2000 }, PEOPLE, OPTS))).toBe('SAME_PERSON');
    for (const cents of [0, -100, 12.5]) {
      expect(codeOf(() => buildSettlementDraft({ from: 'Arun', to: 'me', cents }, PEOPLE, OPTS))).toBe('INVALID_AMOUNT');
    }

    const close = buildSettlementDraft({ from: 'Aroon', to: 'me', cents: 2000 }, PEOPLE, OPTS);
    expect(close.newPeople).toEqual([{ id: 'new:aroon', name: 'Aroon' }]);
    expect(close.warnings.map((w) => w.code)).toEqual(['CLOSE_NAME']);
  });
});

describe('finalizeDraft', () => {
  it('#26 every new: id is replaced with a real id', () => {
    const d = buildExpenseDraft(
      {
        ...DINNER,
        paidBy: 'Kai',
        participants: ['Kai', 'Arun', 'Lee'],
        splitType: 'percent',
        percent: { Kai: 50, Arun: 25, Lee: 25 },
        adjustments: [{ person: 'Lee', cents: 100 }],
      },
      PEOPLE,
      OPTS,
    );
    const result = finalizeDraft(d, PEOPLE, { newId: sequentialIds(), now: '2026-11-03T12:00:00.000Z' });
    expect(result.createdPeople).toEqual([
      { id: 'id1', name: 'Kai' },
      { id: 'id2', name: 'Lee' },
    ]);
    if (result.kind !== 'expense') throw new Error('expected an expense');
    expect(result.expense.paidBy).toBe('id1');
    expect(result.expense.shares.map((s) => s.personId)).toEqual(['id1', 'arun', 'id2']);
    expect(result.expense.splitMeta).toEqual({
      splitType: 'percent',
      percent: { id1: 50, arun: 25, id2: 25 },
      adjustments: [{ person: 'id2', cents: 100 }],
    });
    expect(result.expense.createdAt).toBe('2026-11-03T12:00:00.000Z');
    expect(JSON.stringify(result)).not.toContain('new:');

    const s = buildSettlementDraft({ from: 'Kai', to: 'me', cents: 500 }, PEOPLE, OPTS);
    const settled = finalizeDraft(s, PEOPLE, { newId: sequentialIds(), now: '2026-11-03T12:00:00.000Z' });
    if (settled.kind !== 'settlement') throw new Error('expected a settlement');
    expect(settled.settlement.from).toBe('id1');
    expect(JSON.stringify(settled)).not.toContain('new:');
  });

  it('#27 a person with the same name created meanwhile is reused', () => {
    const d = buildExpenseDraft({ ...DINNER, adjustments: undefined, participants: ['me', 'Kai'] }, PEOPLE, OPTS);
    const later = [...PEOPLE, { id: 'k1', name: 'KAI' }];
    const result = finalizeDraft(d, later, { newId: sequentialIds(), now: '2026-11-03T12:00:00.000Z' });
    expect(result.createdPeople).toEqual([]);
    if (result.kind !== 'expense') throw new Error('expected an expense');
    expect(result.expense.shares.map((s) => s.personId)).toEqual(['me', 'k1']);
  });
});

describe('applyEdits', () => {
  it('#28 total, description, category, date and payer edits; recomputed shares', () => {
    const d = buildExpenseDraft(DINNER, PEOPLE, OPTS);
    const edited = applyEdits(
      d,
      { totalCents: 9300, description: 'Team dinner', category: 'Entertainment', date: '2026-11-01' },
      PEOPLE,
    );
    expect(edited.id).toBe(d.id);
    expect(sharesOf(edited)).toEqual({ me: 2700, arun: 3900, mei: 2700 });
    expect(expenseOf(edited)).toMatchObject({
      totalCents: 9300,
      description: 'Team dinner',
      category: 'Entertainment',
      date: '2026-11-01',
      splitMeta: expenseOf(d).splitMeta,
    });

    const odd = buildExpenseDraft({ ...DINNER, adjustments: undefined, totalCents: 1000 }, PEOPLE, OPTS);
    expect(sharesOf(odd)).toEqual({ me: 334, arun: 333, mei: 333 });
    expect(sharesOf(applyEdits(odd, { paidBy: 'mei' }, PEOPLE))).toEqual({ me: 333, arun: 333, mei: 334 });

    const s = buildSettlementDraft({ from: 'Arun', to: 'me', cents: 2000 }, PEOPLE, OPTS);
    const s2 = applyEdits(s, { cents: 2500, date: '2026-11-02' }, PEOPLE);
    expect(s2.kind === 'settlement' && s2.settlement).toMatchObject({ cents: 2500, date: '2026-11-02' });
  });

  it('#29 "Use Arun" swaps the new person for Arun', () => {
    const d = buildExpenseDraft({ ...DINNER, adjustments: [{ person: 'Aroon', cents: 1200 }], participants: ['me', 'Aroon', 'Mei'] }, PEOPLE, OPTS);
    expect(d.warnings.map((w) => w.code)).toEqual(['CLOSE_NAME']);
    const edited = applyEdits(d, { replace: [{ from: 'new:aroon', to: 'arun' }] }, PEOPLE);
    expect(edited.newPeople).toEqual([]);
    expect(edited.warnings).toEqual([]);
    expect(sharesOf(edited)).toEqual({ me: 2600, arun: 3800, mei: 2600 });
    expect(expenseOf(edited).splitMeta.adjustments).toEqual([{ person: 'arun', cents: 1200 }]);
    const result = finalizeDraft(edited, PEOPLE, { newId: sequentialIds(), now: '2026-11-03T12:00:00.000Z' });
    expect(result.createdPeople).toEqual([]);
  });

  it('#30 bad replacements and edits for the wrong kind are rejected', () => {
    const d = buildExpenseDraft({ ...DINNER, adjustments: undefined, participants: ['me', 'Aroon', 'Mei'] }, PEOPLE, OPTS);
    expect(codeOf(() => applyEdits(d, { replace: [{ from: 'new:aroon', to: 'mei' }] }, PEOPLE))).toBe('DUPLICATE_PARTICIPANT');
    expect(codeOf(() => applyEdits(d, { replace: [{ from: 'new:aroon', to: 'zed' }] }, PEOPLE))).toBe('UNKNOWN_PERSON');
    expect(codeOf(() => applyEdits(d, { replace: [{ from: 'nobody', to: 'arun' }] }, PEOPLE))).toBe('UNKNOWN_PERSON');
    expect(codeOf(() => applyEdits(d, { paidBy: 'zed' }, PEOPLE))).toBe('UNKNOWN_PERSON');
    expect(codeOf(() => applyEdits(d, { cents: 100 }, PEOPLE))).toBe('INVALID_EDIT');

    const s = buildSettlementDraft({ from: 'Arun', to: 'me', cents: 2000 }, PEOPLE, OPTS);
    expect(codeOf(() => applyEdits(s, { totalCents: 100 }, PEOPLE))).toBe('INVALID_EDIT');
    expect(codeOf(() => applyEdits(s, { replace: [{ from: 'arun', to: 'me' }] }, PEOPLE))).toBe('SAME_PERSON');
  });

  it('#31 a total edit on an exact split → EXACT_SUM_MISMATCH; the draft is unchanged', () => {
    const d = buildExpenseDraft(
      { ...DINNER, adjustments: undefined, participants: ['me', 'Arun'], splitType: 'exact', exact: { me: 5000, Arun: 4000 } },
      PEOPLE,
      OPTS,
    );
    const before = structuredClone(d);
    expect(codeOf(() => applyEdits(d, { totalCents: 9500 }, PEOPLE))).toBe('EXACT_SUM_MISMATCH');
    expect(d).toEqual(before);
  });

  it('#57 an amount edit clears AMOUNT_NOT_IN_MESSAGE warnings; other edits keep them', () => {
    const d = buildExpenseDraft(
      { ...DINNER, adjustments: undefined, totalCents: 9500 },
      PEOPLE,
      { ...OPTS, message: 'Dinner $90 split with Arun and Mei' },
    );
    expect(d.warnings.map((w) => w.code)).toEqual(['AMOUNT_NOT_IN_MESSAGE']);
    expect(applyEdits(d, { description: 'Dinner out' }, PEOPLE).warnings.map((w) => w.code)).toEqual(['AMOUNT_NOT_IN_MESSAGE']);
    expect(applyEdits(d, { totalCents: 9000 }, PEOPLE).warnings).toEqual([]);
  });
});

describe('error messages use names, not ids (Step 4 review)', () => {
  const PRIYA: Person = { id: 'p_9xQ2', name: 'Priya' };

  it('Step 4 #60: SplitError messages from the builder name people, including new ones, and keep the code', () => {
    const notParticipant = codeAndMessage(() =>
      buildExpenseDraft({ ...DINNER, participants: ['me', 'Mei'], adjustments: [{ person: 'Kai', cents: 500 }] }, PEOPLE, OPTS),
    );
    expect(notParticipant).toEqual({ code: 'ADJUSTMENT_NOT_PARTICIPANT', message: '"Kai" has an adjustment but is not a participant.' });

    const missing = codeAndMessage(() =>
      buildExpenseDraft(
        { ...DINNER, adjustments: undefined, participants: ['me', 'Priya', 'Kai'], splitType: 'exact', exact: { me: 4500, Kai: 4500 } },
        [...PEOPLE, PRIYA],
        OPTS,
      ),
    );
    expect(missing).toEqual({ code: 'MISSING_SPLIT_VALUE', message: '"Priya" has no exact value.' });
    expect(missing.message).not.toContain('p_9xQ2');

    const zero = codeAndMessage(() =>
      buildExpenseDraft(
        { ...DINNER, adjustments: undefined, participants: ['Kai', 'Rahul'], splitType: 'shares', shares: { Kai: 0, Rahul: 1 } },
        PEOPLE,
        OPTS,
      ),
    );
    expect(zero.message).toBe('Share count for "Kai" is 0; it must be more than 0.');
  });

  it('Step 4 #61: applyEdits errors name people too: "Use Priya" when Priya is already in the draft', () => {
    const people = [...PEOPLE, PRIYA];
    const d = buildExpenseDraft({ ...DINNER, adjustments: undefined, participants: ['me', 'Priya', 'Pria'] }, people, OPTS);
    const err = codeAndMessage(() => applyEdits(d, { replace: [{ from: 'new:pria', to: PRIYA.id }] }, people));
    expect(err).toEqual({ code: 'DUPLICATE_PARTICIPANT', message: '"Priya" is listed more than once.' });
  });
});

function codeAndMessage(fn: () => unknown): { code: string; message: string } {
  try {
    fn();
  } catch (err) {
    const e = err as SplitError;
    return { code: e.code, message: e.message };
  }
  throw new Error('expected an error');
}
