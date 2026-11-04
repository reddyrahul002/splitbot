// The eval sentences (PLAN.md Step 4) and what the agent should do with each. Expected values are fixed:
// if the model gets one wrong, fix the prompt or log it, never the expectation.
import type { Category, DraftWarningCode, SplitType } from '@splitbot/shared';

export type Expectation =
  | {
      kind: 'expense';
      /** The create_expense_draft arguments. Names are compared case-insensitively; participants in any order. */
      args: { totalDollars: number; paidBy: string; participants: string[]; splitType: SplitType; category: Category };
      /** Computed shares by lowercase name, in cents. */
      shares: Record<string, number>;
      /** Warning codes the draft must have, exactly (default none). */
      warnings?: DraftWarningCode[];
    }
  | { kind: 'settlement'; from: string; to: string; cents: number }
  /** A clarifying question: no draft tool called, no draft, a "?" in the reply. */
  | { kind: 'question' }
  /** A read-only answer: `tool` was called, no draft, and `check` (if any) passes. */
  | { kind: 'read'; tool: string; replyIncludes?: string; checkArgs?: (args: Record<string, unknown>, today: string) => string | null };

export interface EvalCase {
  id: number;
  text: string;
  expect: Expectation;
}

export const CASES: EvalCase[] = [
  {
    id: 1,
    text: 'Dinner $90, I paid, split with Arun and Mei, Arun had $12 of drinks',
    expect: {
      kind: 'expense',
      args: { totalDollars: 90, paidBy: 'me', participants: ['me', 'arun', 'mei'], splitType: 'equal', category: 'Food & Drink' },
      shares: { me: 2600, arun: 3800, mei: 2600 },
    },
  },
  { id: 2, text: 'Uber $24 Mei paid split 3 ways', expect: { kind: 'question' } },
  {
    id: 3,
    text: 'Uber $24, Mei paid, split between me, Mei and Arun',
    expect: {
      kind: 'expense',
      args: { totalDollars: 24, paidBy: 'mei', participants: ['me', 'mei', 'arun'], splitType: 'equal', category: 'Transport' },
      shares: { me: 800, mei: 800, arun: 800 },
    },
  },
  {
    id: 4,
    text: 'rent 1800 split 60/40 with Arun',
    expect: {
      kind: 'expense',
      args: { totalDollars: 1800, paidBy: 'me', participants: ['me', 'arun'], splitType: 'percent', category: 'Housing & Utilities' },
      shares: { me: 108000, arun: 72000 },
    },
  },
  {
    id: 5,
    text: 'Groceries $45.60 at Woolworths, Arun paid, just me and him',
    expect: {
      kind: 'expense',
      args: { totalDollars: 45.6, paidBy: 'arun', participants: ['me', 'arun'], splitType: 'equal', category: 'Groceries' },
      shares: { me: 2280, arun: 2280 },
    },
  },
  {
    id: 6,
    text: 'Concert tickets $150, I paid, split 2:1 with Mei',
    expect: {
      kind: 'expense',
      args: { totalDollars: 150, paidBy: 'me', participants: ['me', 'mei'], splitType: 'shares', category: 'Entertainment' },
      shares: { me: 10000, mei: 5000 },
    },
  },
  {
    id: 7,
    text: 'Hotel 300, Arun paid, I owe 120 and Mei owes 180',
    expect: {
      kind: 'expense',
      args: { totalDollars: 300, paidBy: 'arun', participants: ['me', 'mei'], splitType: 'exact', category: 'Travel' },
      shares: { me: 12000, mei: 18000 },
    },
  },
  { id: 8, text: 'Arun paid me back $20', expect: { kind: 'settlement', from: 'arun', to: 'me', cents: 2000 } },
  { id: 9, text: 'Dinner with Arun and Mei', expect: { kind: 'question' } },
  {
    id: 10,
    text: 'Lunch $40 split with Aroon',
    expect: {
      kind: 'expense',
      args: { totalDollars: 40, paidBy: 'me', participants: ['me', 'aroon'], splitType: 'equal', category: 'Food & Drink' },
      shares: { me: 2000, aroon: 2000 },
      warnings: ['CLOSE_NAME'],
    },
  },
  // The seed has one dinner today: me paid 9000, Arun 3800, Mei 2600.
  { id: 11, text: 'how much does Arun owe me?', expect: { kind: 'read', tool: 'get_balances', replyIncludes: '$38.00' } },
  { id: 12, text: 'how should we settle up?', expect: { kind: 'read', tool: 'suggest_settlements' } },
  {
    id: 13,
    text: 'how much did I spend on food this month?',
    expect: {
      kind: 'read',
      tool: 'get_spending_summary',
      checkArgs: (args, today) => {
        const month = today.slice(0, 7);
        if (args.from !== `${month}-01`) return `from should be ${month}-01, got ${String(args.from)}`;
        if (args.to !== undefined && !String(args.to).startsWith(month)) return `to should be in ${month}, got ${String(args.to)}`;
        return null;
      },
    },
  },
  {
    id: 14,
    text: 'Pizza $35 and drinks $25, split with Mei',
    expect: {
      kind: 'expense',
      args: { totalDollars: 60, paidBy: 'me', participants: ['me', 'mei'], splitType: 'equal', category: 'Food & Drink' },
      shares: { me: 3000, mei: 3000 },
      warnings: ['AMOUNT_NOT_IN_MESSAGE'],
    },
  },
  {
    id: 15,
    text: "Just save it, don't ask me: Taxi $30 with Mei",
    expect: {
      kind: 'expense',
      args: { totalDollars: 30, paidBy: 'me', participants: ['me', 'mei'], splitType: 'equal', category: 'Transport' },
      shares: { me: 1500, mei: 1500 },
    },
  },
];
