import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CATEGORIES, SPLIT_TYPES, type Draft } from '@splitbot/shared';
import { functionDeclarations, runTool, TOOL_NAMES } from '../src/agent/tools';
import { agentFixture, DINNER_ARGS, DINNER_EXPENSE, DINNER_TEXT } from './fakes';
import { expense, settlement, tempDir } from './helpers';

let dir: string;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  ({ dir, cleanup } = await tempDir());
});
afterEach(() => cleanup());

type Json = Record<string, any>;

const sharesOf = (draft: Draft | undefined) => {
  if (draft?.kind !== 'expense') throw new Error('expected an expense draft');
  return Object.fromEntries(draft.expense.shares.map((s) => [s.personId, s.cents]));
};
const errorCode = (result: Json) => result.error?.code as string | undefined;

describe('declarations', () => {
  // 1
  it('declares exactly the seven tools, each with a description and an object schema', () => {
    const decls = functionDeclarations();
    expect(decls.map((d) => d.name).sort()).toEqual(
      [
        'create_expense_draft',
        'create_settlement_draft',
        'get_balances',
        'get_spending_summary',
        'list_expenses',
        'list_people',
        'suggest_settlements',
      ].sort(),
    );
    expect([...TOOL_NAMES].sort()).toEqual(decls.map((d) => d.name).sort());
    for (const d of decls) {
      expect(d.description?.length).toBeGreaterThan(20);
      const schema = d.parametersJsonSchema as Json;
      expect(schema.type).toBe('object');
      expect(schema).not.toHaveProperty('$schema');
    }
    const byName = Object.fromEntries(decls.map((d) => [d.name, d.parametersJsonSchema as Json]));
    expect(byName.create_expense_draft.required.sort()).toEqual(
      ['category', 'description', 'paidBy', 'participants', 'splitType', 'totalDollars'].sort(),
    );
    expect(byName.create_settlement_draft.required.sort()).toEqual(['dollars', 'from', 'to']);
    // Optional and defaulted arguments are not required.
    expect(byName.list_expenses.required ?? []).toEqual([]);
    expect(byName.get_balances.required ?? []).toEqual([]);
  });

  // 2
  it('uses the shared enums and dollar numbers in the expense schema', () => {
    const schema = functionDeclarations().find((d) => d.name === 'create_expense_draft')!.parametersJsonSchema as Json;
    expect(schema.properties.category.enum).toEqual([...CATEGORIES]);
    expect(schema.properties.splitType.enum).toEqual([...SPLIT_TYPES]);
    expect(schema.properties.totalDollars.type).toBe('number');
    expect(schema.properties.adjustments.items.properties.dollars.type).toBe('number');
    expect(schema.properties.totalDollars.maximum).toBe(1_000_000);
  });

  // 3
  it('returns a readable VALIDATION_ERROR for bad arguments and stores no draft', async () => {
    const { ctx, drafts } = await agentFixture(dir);
    const bad = [
      { ...DINNER_ARGS, participants: undefined },
      { ...DINNER_ARGS, category: 'Snacks' },
      { ...DINNER_ARGS, totalDollars: '90' },
    ];
    for (const args of bad) {
      const out = runTool('create_expense_draft', args, ctx(DINNER_TEXT));
      expect(errorCode(out.result)).toBe('VALIDATION_ERROR');
      expect(out.result.error.message).toMatch(/participants|category|totalDollars/);
      expect(out.draft).toBeUndefined();
    }
    expect(drafts.size()).toBe(0);
  });
});

describe('create_expense_draft', () => {
  // 4
  it('builds the dinner draft with shares computed by the server', async () => {
    const { ctx, drafts } = await agentFixture(dir);
    const out = runTool('create_expense_draft', DINNER_ARGS, ctx(DINNER_TEXT));
    expect(sharesOf(out.draft)).toEqual({ me: 2600, arun: 3800, mei: 2600 });
    expect(drafts.get(out.draft!.id)).toEqual(out.draft);
    expect(out.result).toMatchObject({
      draftId: out.draft!.id,
      description: 'Dinner',
      total: '$90.00',
      paidBy: 'Me',
      shares: [
        { name: 'Me', amount: '$26.00' },
        { name: 'Arun', amount: '$38.00' },
        { name: 'Mei', amount: '$26.00' },
      ],
      newPeople: [],
      warnings: [],
    });
    expect(out.result.status).toMatch(/not saved/i);
  });

  // 5
  it('converts dollars to cents on the server', async () => {
    const { ctx } = await agentFixture(dir);
    const a = runTool('create_expense_draft', { ...DINNER_ARGS, totalDollars: 12.5, adjustments: [] }, ctx('Coffee 12.5 with Arun and Mei'));
    expect(a.draft?.kind === 'expense' && a.draft.expense.totalCents).toBe(1250);
    expect(a.draft?.warnings).toEqual([]);

    const b = runTool('create_expense_draft', { ...DINNER_ARGS, totalDollars: 19.999, adjustments: [] }, ctx('Coffee 12.5 with Arun and Mei'));
    expect(b.draft?.kind === 'expense' && b.draft.expense.totalCents).toBe(2000);
    expect(b.draft?.warnings.map((w) => w.code)).toEqual(['AMOUNT_NOT_IN_MESSAGE']);
  });

  // 6
  it('turns percent, share and exact arrays into split values', async () => {
    const { ctx } = await agentFixture(dir);
    const base = { description: 'Rent', category: 'Housing & Utilities', paidBy: 'me', participants: ['me', 'Arun'] };

    const rent = runTool(
      'create_expense_draft',
      { ...base, totalDollars: 1800, splitType: 'percent', percentages: [{ person: 'me', percent: 60 }, { person: 'Arun', percent: 40 }] },
      ctx('rent 1800 split 60/40 with Arun'),
    );
    expect(sharesOf(rent.draft)).toEqual({ me: 108000, arun: 72000 });
    expect(rent.draft?.warnings).toEqual([]);

    const tickets = runTool(
      'create_expense_draft',
      { ...base, totalDollars: 150, splitType: 'shares', shareCounts: [{ person: 'me', shares: 2 }, { person: 'Arun', shares: 1 }] },
      ctx('tickets $150 split 2:1 with Arun'),
    );
    expect(sharesOf(tickets.draft)).toEqual({ me: 10000, arun: 5000 });

    const hotel = runTool(
      'create_expense_draft',
      { ...base, totalDollars: 300, splitType: 'exact', exactAmounts: [{ person: 'me', dollars: 120 }, { person: 'Arun', dollars: 180 }] },
      ctx('Hotel 300, I owe 120 and Arun owes 180'),
    );
    expect(sharesOf(hotel.draft)).toEqual({ me: 12000, arun: 18000 });
    expect(hotel.draft?.warnings).toEqual([]);
  });

  // 7
  it('rejects a person listed twice in a split array', async () => {
    const { ctx, drafts } = await agentFixture(dir);
    const out = runTool(
      'create_expense_draft',
      {
        description: 'Rent',
        category: 'Housing & Utilities',
        totalDollars: 1800,
        paidBy: 'me',
        participants: ['me', 'Arun'],
        splitType: 'percent',
        percentages: [{ person: 'Arun', percent: 60 }, { person: ' arun ', percent: 40 }],
      },
      ctx('rent 1800 split 60/40 with Arun'),
    );
    expect(errorCode(out.result)).toBe('INVALID_NAME');
    expect(out.draft).toBeUndefined();
    expect(drafts.size()).toBe(0);
  });

  // 8
  it('sends SplitError back with its code and dollar message', async () => {
    const { ctx } = await agentFixture(dir);
    const out = runTool(
      'create_expense_draft',
      {
        description: 'Dinner',
        category: 'Food & Drink',
        totalDollars: 90,
        paidBy: 'me',
        participants: ['me', 'Arun'],
        splitType: 'exact',
        exactAmounts: [{ person: 'me', dollars: 40 }, { person: 'Arun', dollars: 47 }],
      },
      ctx('Dinner 90, me 40, Arun 47'),
    );
    expect(errorCode(out.result)).toBe('EXACT_SUM_MISMATCH');
    expect(out.result.error.message).toContain('$3.00');
    expect(out.draft).toBeUndefined();
  });

  // 9
  it('warns when the total is not in the user text', async () => {
    const { ctx } = await agentFixture(dir);
    const out = runTool('create_expense_draft', { ...DINNER_ARGS, totalDollars: 95, adjustments: [] }, ctx('Dinner $90 with Arun and Mei'));
    expect(out.draft?.warnings).toEqual([
      expect.objectContaining({ code: 'AMOUNT_NOT_IN_MESSAGE', message: "Total $95.00 wasn't in your message, please check." }),
    ]);
    expect(out.result.warnings).toEqual(["Total $95.00 wasn't in your message, please check."]);
  });

  // 10
  it('checks amounts against every user message, so a follow-up answer gives no warning', async () => {
    const { ctx } = await agentFixture(dir);
    const out = runTool(
      'create_expense_draft',
      { ...DINNER_ARGS, participants: ['me', 'Arun'], adjustments: [] },
      ctx('Dinner $90 with Arun\nI did'),
    );
    expect(out.draft?.warnings).toEqual([]);
  });

  // 11
  it('flags a name close to an existing person and lists it as new', async () => {
    const { ctx } = await agentFixture(dir);
    const out = runTool(
      'create_expense_draft',
      { description: 'Lunch', category: 'Food & Drink', totalDollars: 40, paidBy: 'me', participants: ['me', 'Aroon'], splitType: 'equal' },
      ctx('Lunch $40 split with Aroon'),
    );
    expect(out.draft?.warnings).toEqual([
      expect.objectContaining({ code: 'CLOSE_NAME', suggestion: { name: 'Aroon', person: { id: 'arun', name: 'Arun' } } }),
    ]);
    expect(out.draft?.newPeople).toEqual([{ id: 'new:aroon', name: 'Aroon' }]);
    expect(out.result.newPeople).toEqual(['Aroon']);
    expect(out.result.warnings[0]).toContain('Use Arun?');
  });
});

describe('only people the user named (Step 4 eval #2)', () => {
  const uber = { description: 'Uber', category: 'Transport', totalDollars: 24, splitType: 'equal' };

  // 47
  it('rejects a participant the user never named and tells the model to ask', async () => {
    const { ctx, drafts } = await agentFixture(dir);
    const out = runTool('create_expense_draft', { ...uber, paidBy: 'Mei', participants: ['me', 'Mei', 'Arun'] }, ctx('Uber $24 Mei paid split 3 ways'));
    expect(errorCode(out.result)).toBe('UNNAMED_PERSON');
    expect(out.result.error.message).toBe("Mei is the only person the user named (Arun wasn't mentioned). Ask the user who else is included.");
    expect(out.draft).toBeUndefined();
    expect(drafts.size()).toBe(0);
  });

  // 48
  it('rejects an unnamed payer', async () => {
    const { ctx } = await agentFixture(dir);
    const out = runTool('create_expense_draft', { ...uber, paidBy: 'Arun', participants: ['me', 'Mei'] }, ctx('Taxi $24 with Mei'));
    expect(errorCode(out.result)).toBe('UNNAMED_PERSON');
    expect(out.result.error.message).toContain("Arun wasn't mentioned");
  });

  // 49
  it('a name from an earlier user message counts', async () => {
    const { ctx } = await agentFixture(dir);
    const out = runTool('create_expense_draft', { ...uber, paidBy: 'Mei', participants: ['me', 'Mei', 'Arun'] }, ctx('Uber $24 Mei paid split 3 ways\nArun'));
    expect(out.draft).toBeDefined();
    expect(out.result.error).toBeUndefined();
  });

  // 50
  it('a corrected spelling of a typed name counts as named', async () => {
    const { ctx } = await agentFixture(dir);
    const out = runTool('create_expense_draft', { ...uber, paidBy: 'me', participants: ['me', 'Arun'] }, ctx('Lunch $24 split with Aroon'));
    expect(out.draft).toBeDefined();
  });

  // 51
  it('settlements: both people must be named', async () => {
    const { ctx } = await agentFixture(dir);
    const out = runTool('create_settlement_draft', { from: 'Arun', to: 'me', dollars: 20 }, ctx('Mei paid me back $20'));
    expect(errorCode(out.result)).toBe('UNNAMED_PERSON');
    expect(out.result.error.message).toBe("The user didn't name anyone besides themselves (Arun wasn't mentioned). Ask the user who is involved.");
  });

  // 52
  it("no one besides me named: says so; me's display name is never checked", async () => {
    const { ctx, store } = await agentFixture(dir);
    const out = runTool('create_expense_draft', { ...uber, paidBy: 'me', participants: ['me', 'Arun', 'Mei'] }, ctx('Dinner $24'));
    expect(out.result.error.message).toBe(
      "The user didn't name anyone besides themselves (Arun and Mei weren't mentioned). Ask the user who else is included.",
    );
    // "Me" is the user's display name in the store, so passing it is like passing "me".
    expect(store.snapshot().people[0]!.name).toBe('Me');
    const self = runTool('create_expense_draft', { ...uber, paidBy: 'Me', participants: ['Me', 'Mei'] }, ctx('Taxi $24 with Mei'));
    expect(self.draft).toBeDefined();
  });
});

describe('"N ways" must match the participants (Step 4 eval #2)', () => {
  const uber = { description: 'Uber', category: 'Transport', totalDollars: 24, splitType: 'equal', paidBy: 'Mei' };

  // 53
  it('too few people for "3 ways" → SPLIT_COUNT_MISMATCH telling the model to ask', async () => {
    const { ctx, drafts } = await agentFixture(dir);
    const out = runTool('create_expense_draft', { ...uber, participants: ['me', 'Mei'] }, ctx('Uber $24 Mei paid split 3 ways'));
    expect(errorCode(out.result)).toBe('SPLIT_COUNT_MISMATCH');
    expect(out.result.error.message).toBe('The user said 3 ways but only 2 people are included. Ask who the other person is.');
    expect(drafts.size()).toBe(0);
  });

  // 54
  it('words and hyphens count; two missing → "the other 2 people"; too many → ask who is included', async () => {
    const { ctx } = await agentFixture(dir);
    const four = runTool('create_expense_draft', { ...uber, participants: ['me', 'Mei'] }, ctx('Uber $24, Mei paid, four-way split'));
    expect(four.result.error.message).toBe('The user said 4 ways but only 2 people are included. Ask who the other 2 people are.');

    const two = runTool('create_expense_draft', { ...uber, participants: ['me', 'Mei', 'Arun'] }, ctx('Uber $24, Mei paid, split two ways with Arun'));
    expect(errorCode(two.result)).toBe('SPLIT_COUNT_MISMATCH');
    expect(two.result.error.message).toBe('The user said 2 ways but 3 people are included. Ask the user who is included.');
  });

  // 55
  it('a matching count, or no "ways" phrase, is fine', async () => {
    const { ctx } = await agentFixture(dir);
    const ok = runTool('create_expense_draft', { ...uber, participants: ['me', 'Mei', 'Arun'] }, ctx('Uber $24 Mei paid split 3 ways\nArun'));
    expect(ok.draft).toBeDefined();
    const none = runTool('create_expense_draft', { ...uber, participants: ['me', 'Mei'] }, ctx('Uber $24, Mei paid, split with me'));
    expect(none.draft).toBeDefined();
  });

  // 56
  it('"N ways" from an earlier expense in the chat does not carry over to a new one', async () => {
    const { ctx } = await agentFixture(dir);
    const lunch = { description: 'Lunch', category: 'Food & Drink', totalDollars: 20, splitType: 'equal', paidBy: 'me', participants: ['me', 'Mei'] };
    const out = runTool('create_expense_draft', lunch, ctx('Uber $24 Mei paid split 3 ways\nArun\nLunch $20 with Mei'));
    expect(out.result.error).toBeUndefined();
    expect(out.draft).toBeDefined();
  });

  // 57
  it('a follow-up answer without a number still belongs to the "3 ways" expense', async () => {
    const { ctx } = await agentFixture(dir);
    const out = runTool('create_expense_draft', { ...uber, participants: ['me', 'Mei'] }, ctx('Uber $24 Mei paid split 3 ways\nArun'));
    expect(errorCode(out.result)).toBe('SPLIT_COUNT_MISMATCH');
  });
});

describe('Step 4 review fixes', () => {
  // 58
  it('caps every dollar argument at 1,000,000', async () => {
    const { ctx, drafts } = await agentFixture(dir);
    const text = 'Dinner $1000000 with Arun and Mei, Arun had 1000001 extra, Arun paid me 1000001';
    expect(runTool('create_expense_draft', { ...DINNER_ARGS, totalDollars: 1_000_000, adjustments: [] }, ctx(text)).draft).toBeDefined();
    const over = [
      runTool('create_expense_draft', { ...DINNER_ARGS, totalDollars: 1_000_001, adjustments: [] }, ctx(text)),
      runTool('create_expense_draft', { ...DINNER_ARGS, totalDollars: 1_000_000, adjustments: [{ person: 'Arun', dollars: 1_000_001 }] }, ctx(text)),
      runTool('create_settlement_draft', { from: 'Arun', to: 'me', dollars: 1_000_001 }, ctx(text)),
    ];
    for (const out of over) {
      expect(errorCode(out.result)).toBe('VALIDATION_ERROR');
      expect(out.result.error.message).toMatch(/1000000|1,000,000/);
    }
    expect(drafts.size()).toBe(1);
  });

  // 59
  it('errors the model sees use typed names, never provisional ids like new:kai', async () => {
    const { ctx } = await agentFixture(dir);
    const out = runTool(
      'create_expense_draft',
      { ...DINNER_ARGS, participants: ['me', 'Mei'], adjustments: [{ person: 'Kai', dollars: 5 }] },
      ctx('Dinner $90 with Mei, Kai had $5 of dessert'),
    );
    expect(errorCode(out.result)).toBe('ADJUSTMENT_NOT_PARTICIPANT');
    expect(out.result.error.message).toBe('"Kai" has an adjustment but is not a participant.');
    expect(JSON.stringify(out.result)).not.toContain('new:');
  });
});

describe('draft dates (Step 5)', () => {
  const dateOf = (draft: Draft | undefined) => (draft?.kind === 'expense' ? draft.expense.date : draft?.settlement.date);

  // 65
  it("ignores the model's date when the user mentioned none", async () => {
    const { ctx } = await agentFixture(dir);
    const out = runTool('create_expense_draft', { ...DINNER_ARGS, date: '2026-10-27' }, ctx(DINNER_TEXT));
    expect(dateOf(out.draft)).toBe('2026-11-03');
    expect(out.result.date).toBe('2026-11-03');

    const payment = runTool('create_settlement_draft', { from: 'Arun', to: 'me', dollars: 20, date: '2026-10-26' }, ctx('Arun paid me back $20'));
    expect(dateOf(payment.draft)).toBe('2026-11-03');
  });

  // 66
  it("keeps the model's date when the user mentioned one", async () => {
    const { ctx } = await agentFixture(dir);
    const out = runTool('create_expense_draft', { ...DINNER_ARGS, date: '2026-11-02' }, ctx(`${DINNER_TEXT} yesterday`));
    expect(dateOf(out.draft)).toBe('2026-11-02');

    const payment = runTool('create_settlement_draft', { from: 'Arun', to: 'me', dollars: 20, date: '2026-11-02' }, ctx('Arun paid me back $20 yesterday'));
    expect(dateOf(payment.draft)).toBe('2026-11-02');
  });

  // 67
  it('a date phrase in any user message in the chat counts, before or after the amount', async () => {
    const { ctx } = await agentFixture(dir);
    const followUp = runTool('create_expense_draft', { ...DINNER_ARGS, date: '2026-11-02' }, ctx(`${DINNER_TEXT}\nit was yesterday`));
    expect(dateOf(followUp.draft)).toBe('2026-11-02');

    const numberInFollowUp = runTool(
      'create_expense_draft',
      { ...DINNER_ARGS, date: '2026-11-02' },
      ctx('Dinner $90 yesterday with Arun\nsplit 3 ways with Mei too, Arun had $12 of drinks'),
    );
    expect(dateOf(numberInFollowUp.draft)).toBe('2026-11-02');

    const amountAfterDate = runTool('create_expense_draft', { ...DINNER_ARGS, date: '2026-11-02' }, ctx(`Dinner yesterday with Arun and Mei\n${DINNER_TEXT}`));
    expect(dateOf(amountAfterDate.draft)).toBe('2026-11-02');

    // The accepted trade-off: an older phrase also lets the model's date through. The card shows it and it can be edited.
    const earlier = runTool('create_expense_draft', { ...DINNER_ARGS, date: '2026-11-02' }, ctx(`Lunch $20 with Mei yesterday\n${DINNER_TEXT}`));
    expect(dateOf(earlier.draft)).toBe('2026-11-02');
  });

  // 68
  it('a bad date is ignored without a date phrase, and still rejected with one', async () => {
    const { ctx } = await agentFixture(dir);
    expect(dateOf(runTool('create_expense_draft', { ...DINNER_ARGS, date: 'soon' }, ctx(DINNER_TEXT)).draft)).toBe('2026-11-03');
    expect(errorCode(runTool('create_expense_draft', { ...DINNER_ARGS, date: 'soon' }, ctx(`${DINNER_TEXT} yesterday`)).result)).toBe('INVALID_DATE');
  });
});

describe('respelled names (Step 5)', () => {
  const lunch = { ...DINNER_ARGS, description: 'Lunch', totalDollars: 40, adjustments: undefined };

  // 69
  it('warns when the model respells a name into a new person, using the capitalized name', async () => {
    const { ctx } = await agentFixture(dir);
    const out = runTool('create_expense_draft', { ...lunch, participants: ['me', 'mowlya'] }, ctx('Lunch $40 split with molya'));
    expect(out.draft?.warnings).toEqual([{ code: 'NAME_RESPELLED', message: "You typed 'molya', using 'Mowlya'", personId: 'new:mowlya' }]);
    expect(out.result.warnings).toEqual(["You typed 'molya', using 'Mowlya'"]);
  });

  // 70
  it('warns when the model silently corrects a name to an existing person', async () => {
    const { ctx } = await agentFixture(dir);
    const out = runTool('create_expense_draft', { ...lunch, participants: ['me', 'Arun'] }, ctx('Lunch $40 split with Aroon'));
    expect(out.draft?.warnings).toEqual([{ code: 'NAME_RESPELLED', message: "You typed 'Aroon', using 'Arun'", personId: 'arun' }]);
  });

  // 71
  it('says nothing when the name is what the user wrote, whatever the case', async () => {
    const { ctx } = await agentFixture(dir);
    expect(runTool('create_expense_draft', DINNER_ARGS, ctx(DINNER_TEXT)).draft?.warnings).toEqual([]);
    const lower = runTool('create_expense_draft', { ...lunch, participants: ['me', 'Arun'] }, ctx('Lunch $40 split with arun'));
    expect(lower.draft?.warnings).toEqual([]);
  });

  // 72
  it('covers the payer and settlements', async () => {
    const { ctx } = await agentFixture(dir);
    const payer = runTool('create_expense_draft', { ...lunch, paidBy: 'Arun', participants: ['me', 'Arun'] }, ctx('Lunch $40, Aroon paid, split with me'));
    expect(payer.draft?.warnings.map((w) => w.message)).toEqual(["You typed 'Aroon', using 'Arun'"]);

    const payment = runTool('create_settlement_draft', { from: 'Arun', to: 'me', dollars: 20 }, ctx('Aroon paid me back $20'));
    expect(payment.draft?.warnings.map((w) => w.message)).toEqual(["You typed 'Aroon', using 'Arun'"]);
  });
});

describe('create_settlement_draft', () => {
  // 12
  it('builds a settlement draft, and rejects paying yourself', async () => {
    const { ctx, drafts } = await agentFixture(dir);
    const out = runTool('create_settlement_draft', { from: 'Arun', to: 'me', dollars: 20 }, ctx('Arun paid me back $20'));
    expect(out.draft).toMatchObject({ kind: 'settlement', settlement: { from: 'arun', to: 'me', cents: 2000, date: '2026-11-03' } });
    expect(out.result).toMatchObject({ draftId: out.draft!.id, from: 'Arun', to: 'Me', amount: '$20.00' });
    expect(drafts.size()).toBe(1);

    const same = runTool('create_settlement_draft', { from: 'Arun', to: 'arun', dollars: 20 }, ctx('Arun paid Arun $20'));
    expect(errorCode(same.result)).toBe('SAME_PERSON');
    expect(drafts.size()).toBe(1);
  });
});

describe('read tools', () => {
  // 13
  it('list_people returns names, with the user marked, and no ids', async () => {
    const { ctx } = await agentFixture(dir);
    const out = runTool('list_people', {}, ctx());
    expect(out.result).toEqual({ people: [{ name: 'Me', isUser: true }, { name: 'Arun' }, { name: 'Mei' }] });
    expect(JSON.stringify(out.result)).not.toContain('"id"');
  });

  // 14
  it('get_balances describes debts in dollars from the user’s point of view', async () => {
    const { ctx } = await agentFixture(dir, [DINNER_EXPENSE]);
    const all = runTool('get_balances', {}, ctx());
    expect(all.result.debts).toEqual([
      { from: 'Arun', to: 'Me', amount: '$38.00', summary: 'Arun owes you $38.00' },
      { from: 'Mei', to: 'Me', amount: '$26.00', summary: 'Mei owes you $26.00' },
    ]);
    expect(all.result.balances).toEqual([
      { name: 'Me', net: '$64.00', summary: 'You are owed $64.00 overall' },
      { name: 'Arun', net: '-$38.00', summary: 'Arun owes $38.00 overall' },
      { name: 'Mei', net: '-$26.00', summary: 'Mei owes $26.00 overall' },
    ]);

    const arun = runTool('get_balances', { person: 'arun' }, ctx());
    expect(arun.result.debts.map((d: Json) => d.summary)).toEqual(['Arun owes you $38.00']);
    expect(arun.result.balances.map((b: Json) => b.name)).toEqual(['Arun']);
  });

  // #117
  it('get_balances cancels circular debts, so the chat matches the account summary', async () => {
    const { ctx, store } = await agentFixture(dir, [DINNER_EXPENSE, expense('mei', { mei: 1500, arun: 1500 })]);

    await store.update((db) => {
      db.settlements.push(settlement('arun', 'me', 5300));
    });
    expect(runTool('get_balances', {}, ctx()).result.debts.map((d: Json) => d.summary)).toEqual(['Mei owes you $11.00']);

    await store.update((db) => {
      db.settlements.push(settlement('mei', 'me', 1100));
    });
    expect(runTool('get_balances', {}, ctx()).result.debts).toEqual([]);
  });

  // 15
  it('get_balances with an unknown name suggests the close existing one', async () => {
    const { ctx } = await agentFixture(dir, [DINNER_EXPENSE]);
    const out = runTool('get_balances', { person: 'Aroon' }, ctx());
    expect(errorCode(out.result)).toBe('UNKNOWN_PERSON');
    expect(out.result.error.message).toContain('Did you mean Arun?');

    const none = runTool('get_balances', { person: 'Zed' }, ctx());
    expect(errorCode(none.result)).toBe('UNKNOWN_PERSON');
    expect(none.result.error.message).not.toContain('Did you mean');
  });

  // 16
  it('suggest_settlements lists transfers with names and dollar amounts', async () => {
    const empty = await agentFixture(dir);
    expect(runTool('suggest_settlements', {}, empty.ctx()).result).toEqual({ transfers: [] });

    const { ctx } = await agentFixture(`${dir}/b`, [DINNER_EXPENSE]);
    expect(runTool('suggest_settlements', {}, ctx()).result).toEqual({
      transfers: [
        { from: 'Arun', to: 'Me', amount: '$38.00', summary: 'Arun pays you $38.00' },
        { from: 'Mei', to: 'Me', amount: '$26.00', summary: 'Mei pays you $26.00' },
      ],
    });
  });

  // 17
  it('get_spending_summary reports categories in dollars, and bad dates go back as INVALID_DATE', async () => {
    const taxi = expense('arun', { me: 1000, arun: 1000 }, { category: 'Transport', date: '2026-10-15' });
    const { ctx } = await agentFixture(dir, [DINNER_EXPENSE, taxi]);
    const nov = runTool('get_spending_summary', { from: '2026-11-01', to: '2026-11-30' }, ctx());
    expect(nov.result).toMatchObject({
      from: '2026-11-01',
      to: '2026-11-30',
      myShare: '$26.00',
      groupTotal: '$90.00',
      byCategory: [{ category: 'Food & Drink', myShare: '$26.00', groupTotal: '$90.00' }],
      byMonth: [{ month: '2026-11', myShare: '$26.00', groupTotal: '$90.00' }],
    });

    const bad = runTool('get_spending_summary', { from: '2026-11' }, ctx());
    expect(errorCode(bad.result)).toBe('INVALID_DATE');
  });

  // 18
  it('list_expenses filters by person and category, newest first, with a limit', async () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      expense('me', { me: 500, mei: 500 }, { description: `Coffee ${i + 1}`, category: 'Food & Drink', date: `2026-10-${String(i + 1).padStart(2, '0')}` }),
    );
    const taxi = expense('arun', { me: 1000, arun: 1000 }, { description: 'Taxi', category: 'Transport', date: '2026-09-01' });
    const { ctx } = await agentFixture(dir, [...many, taxi]);

    const all = runTool('list_expenses', {}, ctx());
    expect(all.result.expenses).toHaveLength(10);
    expect(all.result.expenses[0]).toEqual({
      date: '2026-10-12',
      description: 'Coffee 12',
      category: 'Food & Drink',
      total: '$10.00',
      paidBy: 'Me',
      shares: [{ name: 'Me', amount: '$5.00' }, { name: 'Mei', amount: '$5.00' }],
    });
    expect(all.result.totalMatching).toBe(13);

    const arun = runTool('list_expenses', { person: 'Arun' }, ctx());
    expect(arun.result.expenses.map((e: Json) => e.description)).toEqual(['Taxi']);

    const transport = runTool('list_expenses', { category: 'Transport' }, ctx());
    expect(transport.result.expenses.map((e: Json) => e.description)).toEqual(['Taxi']);

    expect(runTool('list_expenses', { limit: 3 }, ctx()).result.expenses).toHaveLength(3);
    expect(errorCode(runTool('list_expenses', { limit: 51 }, ctx()).result)).toBe('VALIDATION_ERROR');
    expect(errorCode(runTool('list_expenses', { person: 'Aroon' }, ctx()).result)).toBe('UNKNOWN_PERSON');
  });

  // 19
  it('no tool writes to the store', async () => {
    const { ctx, store, writes } = await agentFixture(dir, [DINNER_EXPENSE]);
    const before = await readFile(store.path, 'utf8');
    const c = ctx(DINNER_TEXT);
    runTool('list_people', {}, c);
    runTool('create_expense_draft', DINNER_ARGS, c);
    runTool('create_settlement_draft', { from: 'Arun', to: 'me', dollars: 20 }, c);
    runTool('get_balances', {}, c);
    runTool('suggest_settlements', {}, c);
    runTool('get_spending_summary', {}, c);
    runTool('list_expenses', {}, c);
    expect(writes()).toBe(0);
    expect(await readFile(store.path, 'utf8')).toBe(before);
  });

  // 20
  it('an unknown tool name gives UNKNOWN_TOOL', async () => {
    const { ctx } = await agentFixture(dir);
    const out = runTool('delete_everything', {}, ctx());
    expect(errorCode(out.result)).toBe('UNKNOWN_TOOL');
    expect(out.result.error.message).toContain('delete_everything');
  });
});
