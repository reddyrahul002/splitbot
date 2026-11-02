// Types shared by server and client. All money values are integer cents.

export type PersonId = string;

/** The built-in person representing the user ("I", "me"). */
export const ME_ID: PersonId = 'me';

export interface Person {
  id: PersonId;
  name: string;
}

export const CATEGORIES = [
  'Food & Drink',
  'Groceries',
  'Transport',
  'Housing & Utilities',
  'Entertainment',
  'Travel',
  'Shopping',
  'Other',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const SPLIT_TYPES = ['equal', 'exact', 'percent', 'shares'] as const;
export type SplitType = (typeof SPLIT_TYPES)[number];

/** An itemized extra charged only to one person, e.g. "Arun had $12 of drinks". */
export interface Adjustment {
  person: PersonId;
  cents: number;
  note?: string;
}

export interface SplitInput {
  totalCents: number;
  /** Who paid. Gets leftover cents first when they are a participant. */
  paidBy: PersonId;
  /** Output shares follow this order. */
  participants: PersonId[];
  splitType: SplitType;
  adjustments?: Adjustment[];
  /** splitType 'exact': cents per participant, summing to totalCents. */
  exact?: Record<PersonId, number>;
  /** splitType 'percent': percent per participant, summing to 100 (±0.01). */
  percent?: Record<PersonId, number>;
  /** splitType 'shares': positive weight per participant. */
  shares?: Record<PersonId, number>;
}

export interface Share {
  personId: PersonId;
  cents: number;
}

/** How an expense was split, kept so a draft can be edited and recomputed. */
export type SplitMeta = Pick<SplitInput, 'splitType' | 'adjustments' | 'exact' | 'percent' | 'shares'>;

export interface Expense {
  id: string;
  description: string;
  category: Category;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  totalCents: number;
  paidBy: PersonId;
  shares: Share[];
  splitMeta: SplitMeta;
  /** ISO timestamp. */
  createdAt: string;
}

/** A payment between two people, e.g. "Arun paid me back $20". */
export interface Settlement {
  id: string;
  from: PersonId;
  to: PersonId;
  cents: number;
  /** ISO date, YYYY-MM-DD. */
  date: string;
}

export type DraftWarningCode = 'AMOUNT_NOT_IN_MESSAGE' | 'CLOSE_NAME';

/** A guardrail finding shown on a draft. Warnings never block a draft. */
export interface DraftWarning {
  code: DraftWarningCode;
  message: string;
  /** CLOSE_NAME: the typed `name` looks like existing `person` ("Use Arun"). */
  suggestion?: { name: string; person: Person };
}

interface DraftBase {
  id: string;
  /** Names that don't exist yet; created only on Confirm. */
  newPeople: string[];
  warnings: DraftWarning[];
}

export type Draft =
  | (DraftBase & { kind: 'expense'; expense: Expense })
  | (DraftBase & { kind: 'settlement'; settlement: Settlement });

/** Net position: positive means the person is owed money, negative means they owe. */
export interface Balance {
  personId: PersonId;
  netCents: number;
}

export interface Transfer {
  from: PersonId;
  to: PersonId;
  cents: number;
}

/** Spending for one bucket: one person's share and the group total. */
export interface SpendRow {
  myCents: number;
  totalCents: number;
}

export interface CategorySpend extends SpendRow {
  category: Category;
}

export interface MonthSpend extends SpendRow {
  /** YYYY-MM. */
  month: string;
}

export interface SpendingSummary extends SpendRow {
  byCategory: CategorySpend[];
  byMonth: MonthSpend[];
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}
