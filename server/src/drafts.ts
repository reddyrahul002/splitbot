// Drafts: every write is built here, shown to the user, and saved only on Confirm.
// The draft store is in memory with a TTL; the builders are pure so they can be unit tested.
import { nanoid } from 'nanoid';
import {
  ME_ID,
  NEW_PERSON_PREFIX,
  type ConfirmResult,
  type Draft,
  type DraftEdits,
  type DraftWarning,
  type Expense,
  type ExpenseDraftInput,
  type Group,
  type Person,
  type PersonId,
  type Settlement,
  type SettlementDraftInput,
  type SplitMeta,
} from '@splitbot/shared';
import { capitalizeName, checkAmounts, checkNames, normalizeName } from './domain/guardrails';
import { describeCents } from './domain/money';
import { computeShares, SplitError } from './domain/split';
import { assertDate } from './domain/summary';

export type DraftErrorCode = 'SAME_PERSON' | 'UNKNOWN_PERSON' | 'UNKNOWN_GROUP' | 'INVALID_AMOUNT' | 'INVALID_DATE' | 'INVALID_NAME' | 'INVALID_EDIT';

/** A draft that can't be built or edited. Like SplitError, the message is meant for the user (and the model). */
export class DraftError extends Error {
  override readonly name = 'DraftError';
  constructor(
    readonly code: DraftErrorCode,
    message: string,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Draft store

export interface DraftStore {
  put(draft: Draft): void;
  get(id: string): Draft | undefined;
  /** Stores an edited version of a live draft and restarts its TTL. False if the draft is gone. */
  replace(draft: Draft): boolean;
  /** Removes and returns the draft, so only one confirm can win. */
  take(id: string): Draft | undefined;
  /** Puts a taken draft back, e.g. after a failed write. */
  restore(draft: Draft): void;
  delete(id: string): boolean;
  /** Live drafts, after removing expired ones. */
  size(): number;
}

export const DRAFT_TTL_MS = 30 * 60 * 1000;

export function createDraftStore(options: { ttlMs?: number; now?: () => number } = {}): DraftStore {
  const { ttlMs = DRAFT_TTL_MS, now = Date.now } = options;
  const entries = new Map<string, { draft: Draft; expiresAt: number }>();

  // Expiry is checked lazily, so there are no timers to clean up.
  const live = (id: string) => {
    const entry = entries.get(id);
    if (entry && now() >= entry.expiresAt) entries.delete(id);
    return entries.get(id)?.draft;
  };
  const sweep = () => {
    for (const id of [...entries.keys()]) live(id);
  };
  const set = (draft: Draft) => entries.set(draft.id, { draft: structuredClone(draft), expiresAt: now() + ttlMs });

  return {
    put(draft) {
      sweep();
      set(draft);
    },
    get: (id) => structuredClone(live(id)),
    replace(draft) {
      if (!live(draft.id)) return false;
      set(draft);
      return true;
    },
    take(id) {
      const draft = live(id);
      entries.delete(id);
      return draft;
    },
    restore: (draft) => set(draft),
    delete(id) {
      const found = live(id) !== undefined;
      entries.delete(id);
      return found;
    },
    size() {
      sweep();
      return entries.size;
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Builders

export interface BuildOptions {
  /** YYYY-MM-DD, used when the input has no date. */
  today: string;
  /** The user's chat message; when given, amounts that aren't in it get a warning. */
  message?: string;
}

/** Resolves typed names to ids: `me`, an existing person (normalized exact match), or a provisional `new:` id. */
function nameResolver(people: Person[]) {
  const newPeople: Person[] = [];
  const resolve = (name: string): PersonId => {
    const n = normalizeName(name);
    if (n === '') throw new DraftError('INVALID_NAME', 'A name is empty.');
    if (n === ME_ID) return ME_ID;
    const existing = people.find((p) => normalizeName(p.name) === n);
    if (existing) return existing.id;
    const id = `${NEW_PERSON_PREFIX}${n}`;
    if (!newPeople.some((p) => p.id === id)) newPeople.push({ id, name: capitalizeName(name) });
    return id;
  };
  const resolveMap = (map: Record<string, number> | undefined): Record<PersonId, number> | undefined => {
    if (map === undefined) return undefined;
    const out: Record<PersonId, number> = {};
    for (const [name, value] of Object.entries(map)) {
      const id = resolve(name);
      if (Object.hasOwn(out, id)) throw new DraftError('INVALID_NAME', `"${name.trim()}" is listed more than once.`);
      out[id] = value;
    }
    return out;
  };
  return { resolve, resolveMap, newPeople };
}

function checkDate(date: string): string {
  try {
    assertDate(date, 'Date');
  } catch (err) {
    if (err instanceof RangeError) throw new DraftError('INVALID_DATE', err.message);
    throw err;
  }
  return date;
}

function checkSettlementCents(cents: number): number {
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new DraftError('INVALID_AMOUNT', `A payment must be more than $0.00, in whole cents (got ${describeCents(cents)}).`);
  }
  return cents;
}

/** Drops undefined keys so splitMeta only holds what was given. */
function compactMeta(meta: SplitMeta): SplitMeta {
  return Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== undefined)) as SplitMeta;
}

/**
 * Recomputes shares from the expense's participants (in order), payer, total and splitMeta. SplitError messages quote
 * person ids ("new:kai", nanoids); they are rewritten to display names from `people`, because the user and the model
 * read them.
 */
function withShares(expense: Expense, people: Person[]): Expense {
  try {
    const shares = computeShares({
      totalCents: expense.totalCents,
      paidBy: expense.paidBy,
      participants: expense.shares.map((s) => s.personId),
      ...expense.splitMeta,
    });
    return { ...expense, shares };
  } catch (err) {
    if (!(err instanceof SplitError)) throw err;
    const nameOf = new Map(people.map((p) => [p.id, p.name]));
    const message = err.message.replace(/"([^"]+)"/g, (quoted, id: string) => (nameOf.has(id) ? `"${nameOf.get(id)}"` : quoted));
    throw new SplitError(err.code, message);
  }
}

export function buildExpenseDraft(input: ExpenseDraftInput, people: Person[], options: BuildOptions): Draft {
  const { resolve, resolveMap, newPeople } = nameResolver(people);
  const paidBy = resolve(input.paidBy);
  const participants = input.participants.map(resolve);
  const splitMeta = compactMeta({
    splitType: input.splitType,
    adjustments: input.adjustments?.map((a) => ({ ...a, person: resolve(a.person) })),
    exact: resolveMap(input.exact),
    percent: resolveMap(input.percent),
    shares: resolveMap(input.shares),
  });
  const expense = withShares({
    id: nanoid(),
    description: input.description.trim(),
    category: input.category,
    date: checkDate(input.date ?? options.today),
    totalCents: input.totalCents,
    paidBy,
    shares: participants.map((personId) => ({ personId, cents: 0 })),
    splitMeta,
    createdAt: new Date().toISOString(),
    ...(input.groupId === undefined ? {} : { groupId: input.groupId }),
  }, [...people, ...newPeople]);

  const warnings: DraftWarning[] = [
    ...(options.message === undefined ? [] : checkAmounts(options.message, { totalCents: expense.totalCents, ...splitMeta }, [...people, ...newPeople])),
    ...checkNames({ paidBy: input.paidBy, participants: input.participants }, people),
  ];
  return { id: nanoid(), kind: 'expense', expense, newPeople, warnings };
}

export function buildSettlementDraft(input: SettlementDraftInput, people: Person[], options: BuildOptions): Draft {
  const { resolve, newPeople } = nameResolver(people);
  const settlement: Settlement = {
    id: nanoid(),
    from: resolve(input.from),
    to: resolve(input.to),
    cents: checkSettlementCents(input.cents),
    date: checkDate(input.date ?? options.today),
    ...(input.groupId === undefined ? {} : { groupId: input.groupId }),
  };
  if (settlement.from === settlement.to) {
    throw new DraftError('SAME_PERSON', `A payment needs two different people (got "${input.from.trim()}" twice).`);
  }
  const warnings = checkNames({ paidBy: input.from, participants: [input.to] }, people);
  return { id: nanoid(), kind: 'settlement', settlement, newPeople, warnings };
}

// ---------------------------------------------------------------------------------------------------------------
// Edits

/** Applies `map` to every person id in an expense: payer, shares, adjustments and split-value keys. */
function remapExpense(expense: Expense, map: (id: PersonId) => PersonId): Expense {
  const remapKeys = (values: Record<PersonId, number> | undefined) =>
    values && Object.fromEntries(Object.entries(values).map(([id, v]) => [map(id), v]));
  const meta = expense.splitMeta;
  return {
    ...expense,
    paidBy: map(expense.paidBy),
    shares: expense.shares.map((s) => ({ ...s, personId: map(s.personId) })),
    splitMeta: compactMeta({
      ...meta,
      adjustments: meta.adjustments?.map((a) => ({ ...a, person: map(a.person) })),
      exact: remapKeys(meta.exact),
      percent: remapKeys(meta.percent),
      shares: remapKeys(meta.shares),
    }),
  };
}

function remapSettlement(settlement: Settlement, map: (id: PersonId) => PersonId): Settlement {
  return { ...settlement, from: map(settlement.from), to: map(settlement.to) };
}

/** Applies a group edit: undefined keeps the group, null removes the field, and an id sets it. */
function withGroup<T extends { groupId?: string }>(record: T, groupId: string | null | undefined): T {
  if (groupId === undefined) return record;
  const { groupId: _old, ...rest } = record;
  return (groupId === null ? rest : { ...rest, groupId }) as T;
}

function draftPeople(draft: Draft): Set<PersonId> {
  if (draft.kind === 'settlement') return new Set([draft.settlement.from, draft.settlement.to]);
  const e = draft.expense;
  return new Set([e.paidBy, ...e.shares.map((s) => s.personId)]);
}

/**
 * Returns the edited draft (same id) with shares recomputed. Throws DraftError/SplitError and leaves `draft` unchanged
 * if an edit is invalid. New people no longer in the draft are dropped. CLOSE_NAME and NAME_RESPELLED warnings are kept
 * only for people who remain; an amount edit clears AMOUNT_NOT_IN_MESSAGE warnings, because the user typed the new amount
 * themselves.
 */
export function applyEdits(draft: Draft, edits: DraftEdits, people: Person[]): Draft {
  const isExpense = draft.kind === 'expense';
  const wrongKind = isExpense
    ? (['cents'] as const).filter((k) => edits[k] !== undefined)
    : (['totalCents', 'paidBy', 'description', 'category'] as const).filter((k) => edits[k] !== undefined);
  if (wrongKind.length > 0) {
    throw new DraftError('INVALID_EDIT', `A ${draft.kind} draft can't change ${wrongKind.join(', ')}.`);
  }

  // Replacements: "Use Arun" swaps a person in the draft for an existing person.
  const replacements = new Map<PersonId, PersonId>();
  const inDraft = draftPeople(draft);
  for (const { from, to } of edits.replace ?? []) {
    if (!inDraft.has(from)) throw new DraftError('UNKNOWN_PERSON', `"${from}" isn't in this draft.`);
    if (!people.some((p) => p.id === to)) throw new DraftError('UNKNOWN_PERSON', `"${to}" isn't an existing person.`);
    replacements.set(from, to);
  }
  const map = (id: PersonId) => replacements.get(id) ?? id;
  const newPeople = draft.newPeople.filter((p) => !replacements.has(p.id));

  const known = (id: PersonId) => people.some((p) => p.id === id) || newPeople.some((p) => p.id === id);
  const date = edits.date === undefined ? undefined : checkDate(edits.date);

  let next: Draft;
  if (draft.kind === 'expense') {
    const remapped = remapExpense(draft.expense, map);
    if (edits.paidBy !== undefined && !known(edits.paidBy)) {
      throw new DraftError('UNKNOWN_PERSON', `"${edits.paidBy}" isn't a person in this draft or an existing person.`);
    }
    const expense = withShares({
      ...remapped,
      description: edits.description?.trim() ?? remapped.description,
      category: edits.category ?? remapped.category,
      date: date ?? remapped.date,
      totalCents: edits.totalCents ?? remapped.totalCents,
      paidBy: edits.paidBy ?? remapped.paidBy,
    }, [...people, ...draft.newPeople]);
    next = { ...draft, expense: withGroup(expense, edits.groupId), newPeople };
  } else {
    const settlement = {
      ...remapSettlement(draft.settlement, map),
      cents: edits.cents === undefined ? draft.settlement.cents : checkSettlementCents(edits.cents),
      date: date ?? draft.settlement.date,
    };
    if (settlement.from === settlement.to) throw new DraftError('SAME_PERSON', 'A payment needs two different people.');
    next = { ...draft, settlement: withGroup(settlement, edits.groupId), newPeople };
  }

  // A new person no longer in the draft (e.g. the payer was changed) must not be created on Confirm.
  const stillInDraft = draftPeople(next);
  next.newPeople = newPeople.filter((p) => stillInDraft.has(p.id));

  const amountEdited = edits.totalCents !== undefined || edits.cents !== undefined;
  const remaining = new Set(next.newPeople.map((p) => normalizeName(p.name)));
  next.warnings = draft.warnings.filter((w) => {
    if (w.code === 'CLOSE_NAME') return remaining.has(normalizeName(w.suggestion?.name ?? ''));
    if (w.code === 'NAME_RESPELLED') return w.personId !== undefined && stillInDraft.has(w.personId);
    return !amountEdited;
  });
  return next;
}

// ---------------------------------------------------------------------------------------------------------------
// Confirm

/**
 * Turns a draft into the record to save. Each provisional `new:` person becomes an existing person with the same
 * name if one exists by now (e.g. created by another confirm), or a new person with a real id.
 */
export function finalizeDraft(
  draft: Draft,
  people: Person[],
  options: { newId?: () => string; now: string },
): ConfirmResult {
  const { newId = nanoid } = options;
  const createdPeople: Person[] = [];
  const ids = new Map<PersonId, PersonId>();
  for (const p of draft.newPeople) {
    const existing = people.find((q) => normalizeName(q.name) === normalizeName(p.name));
    if (existing) {
      ids.set(p.id, existing.id);
    } else {
      const person = { id: newId(), name: p.name };
      createdPeople.push(person);
      ids.set(p.id, person.id);
    }
  }
  const map = (id: PersonId) => ids.get(id) ?? id;

  if (draft.kind === 'expense') {
    return { kind: 'expense', expense: { ...remapExpense(draft.expense, map), createdAt: options.now }, createdPeople };
  }
  return { kind: 'settlement', settlement: remapSettlement(draft.settlement, map), createdPeople };
}

/** Adds anyone on a confirmed record who isn't a member yet to the record's group. */
export function joinGroup(group: Group, result: ConfirmResult): void {
  const onRecord =
    result.kind === 'expense'
      ? [result.expense.paidBy, ...result.expense.shares.map((s) => s.personId)]
      : [result.settlement.from, result.settlement.to];
  for (const id of onRecord) {
    if (!group.memberIds.includes(id)) group.memberIds.push(id);
  }
}
