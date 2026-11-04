// Gemini tools: one zod schema per tool, used both for the FunctionDeclaration and to validate the model's arguments.
// The model gives names and dollars as the user typed them; handlers convert to cents and call the domain code,
// so every amount in a result was computed here. Results use display names and "$12.34" strings for the model to quote.
import type { FunctionDeclaration } from '@google/genai';
import { z } from 'zod';
import {
  CATEGORIES,
  ME_ID,
  SPLIT_TYPES,
  type Draft,
  type Expense,
  type ExpenseDraftInput,
  type Person,
  type PersonId,
} from '@splitbot/shared';
import { computeBalances, pairwiseDebts } from '../domain/balances';
import { currentExpenseMessages, findCloseName, hasDatePhrase, normalizeName, respelledNames, splitWays, unnamedPeople } from '../domain/guardrails';
import { formatCents, toCents } from '../domain/money';
import { suggestSettlements } from '../domain/settle';
import { SplitError } from '../domain/split';
import { spendingSummary } from '../domain/summary';
import { buildExpenseDraft, buildSettlementDraft, DraftError, type DraftStore } from '../drafts';
import type { Store } from '../store';

export interface ToolContext {
  store: Store;
  drafts: DraftStore;
  /** YYYY-MM-DD, the default draft date. */
  today: string;
  /** Every user message in the conversation, oldest first. Amounts and names are checked against them. */
  userMessages: string[];
}

export interface ToolOutcome {
  /** Sent back to the model as the function response. `{ error: { code, message } }` when the call failed. */
  result: Record<string, any>;
  /** The draft a create_*_draft call stored. */
  draft?: Draft;
}

/** A problem the model can fix (bad name, bad tool); goes back to it as an error result. */
class ToolError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Schemas

const name = z.string().trim().min(1);
const person = name.describe('A person\'s name as the user wrote it. Use "me" for the user ("I", "me", "my").');
/** The largest amount the agent accepts, far below where cents stop being exact (Number.MAX_SAFE_INTEGER). */
const MAX_DOLLARS = 1_000_000;
const dollars = z
  .number()
  .max(MAX_DOLLARS)
  .describe(`Dollars exactly as the user wrote them, e.g. 12.5 for "$12.50" (at most ${MAX_DOLLARS}). Never add or convert amounts.`);
const date = z.string().describe('YYYY-MM-DD');

const ExpenseArgs = z.strictObject({
  description: name.describe('Required. What the expense was, in a few words, e.g. "Dinner", "Hotel", "Uber". Never empty.'),
  category: z
    .enum(CATEGORIES)
    .describe(
      'Required. Exactly one of the listed values, spelled the same. Hotels, flights and trips → "Travel"; rent, power, internet → ' +
        '"Housing & Utilities"; taxis, Uber, fuel → "Transport"; meals, coffee, drinks → "Food & Drink"; anything else → "Other".',
    ),
  date: date.optional().describe('YYYY-MM-DD. Leave out for today.'),
  totalDollars: dollars,
  paidBy: person,
  participants: z
    .array(person)
    .describe(
      'Everyone who shares the cost, including the payer if they share it. Only "me" and people the user named; never fill in people from list_people. ' +
        'If the user gives a count ("3 ways") but names fewer people, ask instead of calling this tool.',
    ),
  splitType: z.enum(SPLIT_TYPES).describe('equal; exact (exactAmounts); percent (percentages); shares (shareCounts).'),
  adjustments: z
    .array(z.strictObject({ person, dollars, note: z.string().optional() }))
    .optional()
    .describe('Itemized extras charged only to one person, e.g. "Arun had $12 of drinks". The rest is split by splitType.'),
  exactAmounts: z.array(z.strictObject({ person, dollars })).optional().describe('splitType exact: what each participant owes.'),
  percentages: z.array(z.strictObject({ person, percent: z.number() })).optional().describe('splitType percent: adds up to 100.'),
  shareCounts: z.array(z.strictObject({ person, shares: z.number() })).optional().describe('splitType shares: e.g. 2:1 → 2 and 1.'),
});

const SettlementArgs = z.strictObject({
  from: person.describe('Who paid the money.'),
  to: person.describe('Who received it.'),
  dollars,
  date: date.optional().describe('YYYY-MM-DD. Leave out for today.'),
});

const NoArgs = z.strictObject({});
const BalancesArgs = z.strictObject({ person: person.optional().describe('Only this person\'s balance and debts.') });
const SummaryArgs = z.strictObject({
  from: date.optional().describe('First day, YYYY-MM-DD (inclusive).'),
  to: date.optional().describe('Last day, YYYY-MM-DD (inclusive).'),
});
const ListExpensesArgs = z.strictObject({
  person: person.optional().describe('Only expenses this person paid for or shares.'),
  category: z.enum(CATEGORIES).optional(),
  limit: z.int().min(1).max(50).default(10).describe('How many, newest first (1–50, default 10).'),
});

interface Tool<S extends z.ZodType> {
  description: string;
  schema: S;
  run(args: z.output<S>, ctx: ToolContext): ToolOutcome;
}

const tool = <S extends z.ZodType>(t: Tool<S>) => t;

const TOOLS = {
  list_people: tool({
    description:
      'List the people the user already splits with, to match the spelling of names the user wrote. ' +
      'Never use it to decide who takes part in an expense: only people the user named do.',
    schema: NoArgs,
    run: (_args, ctx) => ({
      result: { people: ctx.store.snapshot().people.map((p) => (p.id === ME_ID ? { name: p.name, isUser: true } : { name: p.name })) },
    }),
  }),

  create_expense_draft: tool({
    description:
      'Create a DRAFT expense from what the user said. The server computes every share; the user must confirm the draft before anything is saved. ' +
      'Returns the draft with each person\'s share and any warnings to mention.',
    schema: ExpenseArgs,
    run(args, ctx) {
      const people = ctx.store.snapshot().people;
      requireNamed([args.paidBy, ...args.participants], people, allText(ctx), 'Ask the user who else is included.');
      requireWaysMatch(args.participants, ctx.userMessages);
      const input: ExpenseDraftInput = {
        description: args.description,
        category: args.category,
        date: statedDate(args.date, ctx),
        totalCents: toCents(args.totalDollars),
        paidBy: args.paidBy,
        participants: args.participants,
        splitType: args.splitType,
        adjustments: args.adjustments?.map((a) => ({ person: a.person, cents: toCents(a.dollars), note: a.note })),
        exact: valueMap(args.exactAmounts, (e) => toCents(e.dollars)),
        percent: valueMap(args.percentages, (p) => p.percent),
        shares: valueMap(args.shareCounts, (s) => s.shares),
      };
      const draft = buildExpenseDraft(input, people, { today: ctx.today, message: allText(ctx) });
      addRespelledWarnings(draft, [args.paidBy, ...args.participants], people, allText(ctx));
      ctx.drafts.put(draft);
      return { result: describeDraft(draft, people), draft };
    },
  }),

  create_settlement_draft: tool({
    description:
      'Create a DRAFT payment between two people, e.g. "Arun paid me back $20" (from Arun to me) or "I paid Mei $30" (from me to Mei). ' +
      'The user must confirm it before it is saved.',
    schema: SettlementArgs,
    run(args, ctx) {
      const people = ctx.store.snapshot().people;
      requireNamed([args.from, args.to], people, allText(ctx), 'Ask the user who is involved.');
      const draft = buildSettlementDraft({ from: args.from, to: args.to, cents: toCents(args.dollars), date: statedDate(args.date, ctx) }, people, {
        today: ctx.today,
      });
      addRespelledWarnings(draft, [args.from, args.to], people, allText(ctx));
      ctx.drafts.put(draft);
      return { result: describeDraft(draft, people), draft };
    },
  }),

  get_balances: tool({
    description: 'Who owes whom right now, after all expenses and payments. Optionally for one person. Quote the summaries as given.',
    schema: BalancesArgs,
    run(args, ctx) {
      const { people, expenses, settlements } = ctx.store.snapshot();
      const only = args.person === undefined ? undefined : findPerson(args.person, people);
      const label = labeler(people);
      const balances = computeBalances(people, expenses, settlements)
        .filter((b) => only === undefined || b.personId === only)
        .map((b) => ({ name: label(b.personId), net: formatCents(b.netCents), summary: netSummary(b.personId, b.netCents, label) }));
      const debts = pairwiseDebts(people, expenses, settlements)
        .filter((d) => only === undefined || d.from === only || d.to === only)
        .map((d) => ({ from: label(d.from), to: label(d.to), amount: formatCents(d.cents), summary: debtSummary(d.from, d.to, d.cents, label) }));
      return { result: { balances, debts } };
    },
  }),

  suggest_settlements: tool({
    description: 'A short list of payments that would settle every balance. Quote the summaries as given.',
    schema: NoArgs,
    run(_args, ctx) {
      const { people, expenses, settlements } = ctx.store.snapshot();
      const label = labeler(people);
      const transfers = suggestSettlements(computeBalances(people, expenses, settlements)).map((t) => ({
        from: label(t.from),
        to: label(t.to),
        amount: formatCents(t.cents),
        summary: t.from === ME_ID ? `You pay ${label(t.to)} ${formatCents(t.cents)}` : `${label(t.from)} pays ${t.to === ME_ID ? 'you' : label(t.to)} ${formatCents(t.cents)}`,
      }));
      return { result: { transfers } };
    },
  }),

  get_spending_summary: tool({
    description: 'Spending by category and by month: the user\'s own share and the group total. Optional inclusive date range.',
    schema: SummaryArgs,
    run(args, ctx) {
      const s = summarize(ctx.store.snapshot().expenses, args.from, args.to);
      const row = (r: { myCents: number; totalCents: number }) => ({ myShare: formatCents(r.myCents), groupTotal: formatCents(r.totalCents) });
      return {
        result: {
          from: args.from ?? null,
          to: args.to ?? null,
          ...row(s),
          byCategory: s.byCategory.map((c) => ({ category: c.category, ...row(c) })),
          byMonth: s.byMonth.map((m) => ({ month: m.month, ...row(m) })),
        },
      };
    },
  }),

  list_expenses: tool({
    description: 'Saved expenses, newest first, optionally only one person\'s or one category\'s.',
    schema: ListExpensesArgs,
    run(args, ctx) {
      const { people, expenses } = ctx.store.snapshot();
      const only = args.person === undefined ? undefined : findPerson(args.person, people);
      const label = labeler(people);
      const matching = newestFirst(expenses).filter(
        (e) =>
          (args.category === undefined || e.category === args.category) &&
          (only === undefined || e.paidBy === only || e.shares.some((s) => s.personId === only)),
      );
      return {
        result: {
          expenses: matching.slice(0, args.limit).map((e) => ({
            date: e.date,
            description: e.description,
            category: e.category,
            total: formatCents(e.totalCents),
            paidBy: label(e.paidBy),
            shares: e.shares.map((s) => ({ name: label(s.personId), amount: formatCents(s.cents) })),
          })),
          totalMatching: matching.length,
        },
      };
    },
  }),
};

export type ToolName = keyof typeof TOOLS;
export const TOOL_NAMES = Object.keys(TOOLS) as ToolName[];

export function functionDeclarations(): FunctionDeclaration[] {
  return TOOL_NAMES.map((toolName) => {
    const { $schema: _, ...parametersJsonSchema } = z.toJSONSchema(TOOLS[toolName].schema, { io: 'input' });
    return { name: toolName, description: TOOLS[toolName].description, parametersJsonSchema };
  });
}

/**
 * Validates the model's arguments and runs the tool. Problems the model can fix come back as
 * `{ error: { code, message } }`; anything unexpected (e.g. a broken store) is thrown.
 */
export function runTool(toolName: string, rawArgs: unknown, ctx: ToolContext): ToolOutcome {
  if (!Object.hasOwn(TOOLS, toolName)) {
    return fail('UNKNOWN_TOOL', `There is no tool called "${toolName}". Use one of: ${TOOL_NAMES.join(', ')}.`);
  }
  const t: Tool<z.ZodType> = TOOLS[toolName as ToolName];
  const parsed = t.schema.safeParse(rawArgs ?? {});
  if (!parsed.success) return fail('VALIDATION_ERROR', z.prettifyError(parsed.error));
  try {
    return t.run(parsed.data, ctx);
  } catch (err) {
    if (err instanceof ToolError || err instanceof SplitError || err instanceof DraftError) return fail(err.code, err.message);
    throw err;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Helpers

const fail = (code: string, message: string): ToolOutcome => ({ result: { error: { code, message } } });

/**
 * Every user message as one text, for the amount and named-people checks. Known limitation: a number or name from an
 * earlier expense in the same chat also counts.
 */
const allText = (ctx: ToolContext) => ctx.userMessages.join('\n');

/**
 * The model's date, only if a date phrase is in any user message in the chat (it invents them). Undefined means today.
 * Known limitation: a phrase from an earlier expense lets a wrong date through; the card shows it and it can be edited.
 */
const statedDate = (date: string | undefined, ctx: ToolContext) => (hasDatePhrase(allText(ctx)) ? date : undefined);

/**
 * The model corrects spellings without saying so ("molya" → "mowlya"), and a name that then matches nobody close gets no
 * CLOSE_NAME warning. This shows the change on the card, with the name as it will be saved.
 */
function addRespelledWarnings(draft: Draft, names: string[], people: Person[], userText: string): void {
  const meName = people.find((p) => p.id === ME_ID)?.name;
  const known = [...people, ...draft.newPeople];
  for (const { typed, used } of respelledNames(names, userText, meName)) {
    const person = known.find((p) => normalizeName(p.name) === normalizeName(used));
    if (person) draft.warnings.push({ code: 'NAME_RESPELLED', message: `You typed '${typed}', using '${person.name}'`, personId: person.id });
  }
}

/** `[{ person, value }]` → `{ name: value }`. A name listed twice (after normalizing) is an error, not an overwrite. */
function valueMap<T extends { person: string }>(items: T[] | undefined, value: (item: T) => number): Record<string, number> | undefined {
  if (items === undefined) return undefined;
  const seen = new Set<string>();
  for (const item of items) {
    const n = normalizeName(item.person);
    if (seen.has(n)) throw new DraftError('INVALID_NAME', `"${item.person.trim()}" is listed more than once.`);
    seen.add(n);
  }
  return Object.fromEntries(items.map((item) => [item.person, value(item)]));
}

/**
 * The model may only use people the user wrote (prompts alone didn't stop it filling in "split 3 ways" from the
 * known people). Throws UNNAMED_PERSON naming who was and wasn't mentioned, so the model asks instead.
 */
function requireNamed(names: string[], people: Person[], userText: string, ask: string): void {
  const meName = people.find((p) => p.id === ME_ID)?.name;
  const missing = unnamedPeople(names, userText, meName);
  if (missing.length === 0) return;
  const lost = new Set(missing.map(normalizeName));
  const self = new Set([ME_ID, ...(meName ? [normalizeName(meName)] : [])]);
  const named = [...new Map(names.filter((n) => !self.has(normalizeName(n)) && !lost.has(normalizeName(n))).map((n) => [normalizeName(n), n.trim()])).values()];
  const who =
    named.length === 0
      ? "The user didn't name anyone besides themselves"
      : `${listNames(named)} ${named.length === 1 ? 'is the only person' : 'are the only people'} the user named`;
  throw new ToolError('UNNAMED_PERSON', `${who} (${listNames(missing)} ${missing.length === 1 ? "wasn't" : "weren't"} mentioned). ${ask}`);
}

/**
 * "Split 3 ways" must mean 3 participants (the model kept drafting me + Mei for eval #2). Throws SPLIT_COUNT_MISMATCH
 * so the model asks who's missing. Participants are counted by normalized name, so "Mei" and "mei" are one person.
 */
function requireWaysMatch(participants: string[], userMessages: string[]): void {
  // Only the expense being drafted: "3 ways" for an earlier expense in the chat doesn't apply to this one.
  const ways = splitWays(currentExpenseMessages(userMessages).join('\n'));
  const count = new Set(participants.map(normalizeName)).size;
  if (ways === null || ways === count) return;
  if (count < ways) {
    const missing = ways - count;
    const who = missing === 1 ? 'the other person is' : `the other ${missing} people are`;
    throw new ToolError('SPLIT_COUNT_MISMATCH', `The user said ${ways} ways but only ${count} ${count === 1 ? 'person is' : 'people are'} included. Ask who ${who}.`);
  }
  throw new ToolError('SPLIT_COUNT_MISMATCH', `The user said ${ways} ways but ${count} people are included. Ask the user who is included.`);
}

/** "Arun", "Arun and Mei", "Arun, Mei and Kai". */
function listNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** spendingSummary throws RangeError for dates that aren't real YYYY-MM-DD; the model can fix those. */
function summarize(expenses: Expense[], from?: string, to?: string) {
  try {
    return spendingSummary(expenses, { from, to });
  } catch (err) {
    if (err instanceof RangeError) throw new ToolError('INVALID_DATE', err.message);
    throw err;
  }
}

/** Resolves a name in a read tool: "me", or an existing person's name. */
function findPerson(typed: string, people: Person[]): PersonId {
  const n = normalizeName(typed);
  if (n === ME_ID) return ME_ID;
  const found = people.find((p) => normalizeName(p.name) === n);
  if (found) return found.id;
  const close = findCloseName(typed, people);
  throw new ToolError('UNKNOWN_PERSON', `There is no one called "${typed.trim()}".${close ? ` Did you mean ${close.name}?` : ''}`);
}

/** Display names for ids, including a draft's provisional new people. */
function labeler(people: Person[]) {
  return (id: PersonId) => people.find((p) => p.id === id)?.name ?? id;
}

function netSummary(id: PersonId, cents: number, label: (id: PersonId) => string): string {
  const amount = formatCents(Math.abs(cents));
  if (id === ME_ID) return cents === 0 ? 'You are settled up' : cents > 0 ? `You are owed ${amount} overall` : `You owe ${amount} overall`;
  return cents === 0 ? `${label(id)} is settled up` : cents > 0 ? `${label(id)} is owed ${amount} overall` : `${label(id)} owes ${amount} overall`;
}

function debtSummary(from: PersonId, to: PersonId, cents: number, label: (id: PersonId) => string): string {
  const amount = formatCents(cents);
  if (from === ME_ID) return `You owe ${label(to)} ${amount}`;
  return `${label(from)} owes ${to === ME_ID ? 'you' : label(to)} ${amount}`;
}

function describeDraft(draft: Draft, people: Person[]): Record<string, unknown> {
  const label = labeler([...people, ...draft.newPeople]);
  const common = {
    draftId: draft.id,
    status: 'Draft, not saved. The user must review and confirm it.',
    newPeople: draft.newPeople.map((p) => p.name),
    warnings: draft.warnings.map((w) => w.message),
  };
  if (draft.kind === 'settlement') {
    const s = draft.settlement;
    return { ...common, kind: 'settlement', from: label(s.from), to: label(s.to), amount: formatCents(s.cents), date: s.date };
  }
  const e = draft.expense;
  return {
    ...common,
    kind: 'expense',
    description: e.description,
    category: e.category,
    date: e.date,
    total: formatCents(e.totalCents),
    paidBy: label(e.paidBy),
    splitType: e.splitMeta.splitType,
    shares: e.shares.map((s) => ({ name: label(s.personId), amount: formatCents(s.cents) })),
  };
}

/** Newest first by date, then by createdAt (same order as GET /api/expenses). */
function newestFirst(expenses: Expense[]): Expense[] {
  return [...expenses].sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}
