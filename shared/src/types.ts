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

/** Prefix of the provisional ids that people who don't exist yet get inside a draft, e.g. `new:kai`. */
export const NEW_PERSON_PREFIX = 'new:';

interface DraftBase {
  id: string;
  /** People who don't exist yet, with provisional `new:` ids; created only on Confirm. */
  newPeople: Person[];
  warnings: DraftWarning[];
}

export type Draft =
  | (DraftBase & { kind: 'expense'; expense: Expense })
  | (DraftBase & { kind: 'settlement'; settlement: Settlement });

/** Expense draft request. People are given by name ("me" is the user); money is integer cents. */
export interface ExpenseDraftInput {
  description: string;
  category: Category;
  /** YYYY-MM-DD; defaults to today. */
  date?: string;
  totalCents: number;
  paidBy: string;
  participants: string[];
  splitType: SplitType;
  adjustments?: { person: string; cents: number; note?: string }[];
  exact?: Record<string, number>;
  percent?: Record<string, number>;
  shares?: Record<string, number>;
}

/** Settlement draft request: `from` paid `to`. */
export interface SettlementDraftInput {
  from: string;
  to: string;
  cents: number;
  /** YYYY-MM-DD; defaults to today. */
  date?: string;
}

export type DraftRequest = ({ kind: 'expense' } & ExpenseDraftInput) | ({ kind: 'settlement' } & SettlementDraftInput);

/** Edits to a draft. Ids refer to people in the draft (including `new:` ids) or existing people. */
export interface DraftEdits {
  description?: string;
  category?: Category;
  date?: string;
  /** Expense only. */
  totalCents?: number;
  /** Expense only. */
  paidBy?: PersonId;
  /** Settlement only. */
  cents?: number;
  /** "Use Arun": swap a person in the draft for an existing person. */
  replace?: { from: PersonId; to: PersonId }[];
}

export type ConfirmResult =
  | { kind: 'expense'; expense: Expense; createdPeople: Person[] }
  | { kind: 'settlement'; settlement: Settlement; createdPeople: Person[] };

export interface BalancesResponse {
  balances: Balance[];
  debts: Transfer[];
}

export interface ApiError {
  error: { code: string; message: string };
}

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

/** POST /api/chat body. The client keeps the history and sends all of it, ending with the user's new message. */
export interface ChatRequest {
  messages: ChatMessage[];
}

/** The agent's reply plus every draft it created for this message, in creation order. Nothing is saved yet. */
export interface ChatResponse {
  reply: string;
  drafts: Draft[];
}
