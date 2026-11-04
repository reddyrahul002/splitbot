// Draft guardrails: warnings for amounts that aren't in the user's message and names close to existing people.
// They only ever add warnings; nothing here blocks a draft.
import { ME_ID, type DraftWarning, type Person, type PersonId, type SplitInput } from '@splitbot/shared';
import { formatCents, toCents } from './money';

export type CheckedSplit = Pick<SplitInput, 'totalCents' | 'splitType' | 'adjustments' | 'exact' | 'percent' | 'shares'>;

/** Absorbs float noise when comparing percentages and share counts. */
const FLOAT_EPSILON = 1e-9;

/**
 * Every number in the message, as written: "$1,800.50" → 1800.5, "90 bucks" → 90, "60/40" → 60, 40.
 * A comma is a thousands separator only when exactly 3 digits follow it, so "10,20" → 10, 20.
 */
export function extractNumbers(message: string): number[] {
  const matches = message.match(/(?:\d{1,3}(?:,\d{3})+(?!\d)|\d+)(?:\.\d+)?|\.\d+/g) ?? [];
  return matches.map((m) => Number(m.replaceAll(',', '')));
}

/** One AMOUNT_NOT_IN_MESSAGE warning per non-zero value the model gave that the user never typed. */
export function checkAmounts(message: string, split: CheckedSplit, people: Person[] = []): DraftWarning[] {
  const numbers = extractNumbers(message);
  const hasCents = (cents: number) => numbers.some((n) => toCents(n) === cents);
  const hasValue = (value: number) => numbers.some((n) => Math.abs(n - value) < FLOAT_EPSILON);
  const nameOf = (id: PersonId) => people.find((p) => p.id === id)?.name ?? id;

  const missing: string[] = [];
  if (split.totalCents !== 0 && !hasCents(split.totalCents)) missing.push(`Total ${formatCents(split.totalCents)}`);
  for (const adj of split.adjustments ?? []) {
    if (adj.cents !== 0 && !hasCents(adj.cents)) missing.push(`${nameOf(adj.person)}'s extra ${formatCents(adj.cents)}`);
  }
  const values = (map: Record<PersonId, number> | undefined) => Object.entries(map ?? {}).filter(([, v]) => v !== 0);
  if (split.splitType === 'exact') {
    for (const [id, cents] of values(split.exact)) {
      if (!hasCents(cents)) missing.push(`${nameOf(id)}'s amount ${formatCents(cents)}`);
    }
  }
  if (split.splitType === 'percent') {
    for (const [id, pct] of values(split.percent)) {
      if (!hasValue(pct)) missing.push(`${nameOf(id)}'s ${pct}%`);
    }
  }
  if (split.splitType === 'shares') {
    for (const [id, count] of values(split.shares)) {
      if (!hasValue(count)) missing.push(`${nameOf(id)}'s share count ${count}`);
    }
  }
  return missing.map((what) => ({
    code: 'AMOUNT_NOT_IN_MESSAGE',
    message: `${what} wasn't in your message, please check.`,
  }));
}

/** Edit distance on normalized names (trimmed, lowercase, NFC), counted in code points. */
export function levenshtein(a: string, b: string): number {
  const s = [...normalizeName(a)];
  const t = [...normalizeName(b)];
  let prev = Array.from({ length: t.length + 1 }, (_, j) => j);
  for (let i = 1; i <= s.length; i++) {
    const row = [i];
    for (let j = 1; j <= t.length; j++) {
      row[j] = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + (s[i - 1] === t[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[t.length]!;
}

/**
 * The existing person a new name probably means, or null. An exact match on anyone means no suggestion.
 * Close: distance ≤2 (≤1 when the longer name has ≤4 letters), or one name starts with the other
 * and the shorter has ≥3 letters. Closest wins; ties go in `people` order. Empty names are ignored.
 * `me` is never suggested, but typing me's own name counts as an exact match.
 */
export function findCloseName(name: string, people: Person[]): Person | null {
  const n = normalizeName(name);
  if (n === '' || n === ME_ID) return null;
  if (people.some((p) => normalizeName(p.name) === n)) return null;
  const others = people.filter((p) => p.id !== ME_ID);

  let best: { person: Person; distance: number } | null = null;
  for (const person of others) {
    const q = normalizeName(person.name);
    const distance = levenshtein(n, q);
    const [short, long] = [...n].length <= [...q].length ? [n, q] : [q, n];
    const threshold = [...long].length <= 4 ? 1 : 2;
    const prefix = [...short].length >= 3 && long.startsWith(short);
    if ((distance <= threshold || prefix) && (!best || distance < best.distance)) best = { person, distance };
  }
  return best?.person ?? null;
}

/** One CLOSE_NAME warning per distinct payer/participant name that looks like an existing person. */
export function checkNames(names: { paidBy: string; participants: string[] }, people: Person[]): DraftWarning[] {
  const seen = new Set<string>();
  const warnings: DraftWarning[] = [];
  for (const raw of [names.paidBy, ...names.participants]) {
    const typed = raw.trim();
    if (typed === '' || seen.has(normalizeName(typed))) continue;
    seen.add(normalizeName(typed));
    const person = findCloseName(typed, people);
    if (person) {
      warnings.push({
        code: 'CLOSE_NAME',
        message: `'${typed}' looks like existing person '${person.name}'. Use ${person.name}?`,
        suggestion: { name: typed, person },
      });
    }
  }
  return warnings;
}

/**
 * Pronouns and common words in expense messages. They never count as naming someone, so "split with me" doesn't
 * name Mei and "pizza and drinks" doesn't name Ana (both are one edit away).
 */
const NOT_NAMES = new Set(
  ('i me my mine myself you your we us our ours he him his she her hers they them their it its ' +
    'a an and or the of at on in to for from with by just all both everyone back paid pay pays owe owes had has was ' +
    'is split ways way each per half').split(' '),
);

/**
 * The names (other than the user) that don't appear in `text`, the user's own messages. A name counts as written if
 * it is a word or phrase in the text, or a close spelling of one (same rule as findCloseName: "Arun" for "Aroon").
 * Each missing name is returned once, trimmed, in the order given.
 */
export function unnamedPeople(names: string[], text: string, meName?: string): string[] {
  return compareWithText(names, text, meName)
    .filter((name) => !name.exact && name.closeWord === null)
    .map((name) => name.raw);
}

/**
 * The names the model changed: not written exactly in `text`, the user's own messages, but a close spelling is ("molya"
 * passed as "mowlya"). `typed` keeps the user's casing. Differences in case alone aren't reported.
 */
export function respelledNames(names: string[], text: string, meName?: string): { typed: string; used: string }[] {
  return compareWithText(names, text, meName).flatMap((name) =>
    !name.exact && name.closeWord !== null ? [{ typed: name.closeWord, used: name.raw }] : [],
  );
}

/** Each distinct name (other than the user), once, and how it compares with the words in `text`. */
function compareWithText(names: string[], text: string, meName?: string): { raw: string; exact: boolean; closeWord: string | null }[] {
  const plain = (s: string) => normalizeName(s).replaceAll('’', "'");
  // A hyphenated name is one word, so "Anne-Mari" is reported whole. Its parts still count as written ("Marie").
  const words = (text.normalize('NFC').match(/[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*/gu) ?? [])
    .map((w) => w.replace(/['’]s$/iu, ''))
    .filter((w) => !NOT_NAMES.has(normalizeName(w)));
  const phrase = ` ${words.map(plain).flatMap((w) => (w.includes('-') ? [w, w.replaceAll('-', ' ')] : [w])).join(' ')} `;
  const asPeople = words.map((w, i) => ({ id: `word${i}`, name: w }));
  const self = new Set([ME_ID, ...(meName === undefined ? [] : [plain(meName)])]);

  const seen = new Set<string>();
  const compared: { raw: string; exact: boolean; closeWord: string | null }[] = [];
  for (const raw of names) {
    const n = plain(raw).replace(/\s+/gu, ' ');
    if (n === '' || self.has(n) || seen.has(n)) continue;
    seen.add(n);
    compared.push({ raw: raw.trim(), exact: phrase.includes(` ${n} `), closeWord: findCloseName(n, asPeople)?.name ?? null });
  }
  return compared;
}

const MONTHS = 'january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec';
const ORDINAL = '(?:st|nd|rd|th)';

const DATE_PHRASE = new RegExp(
  [
    '\\b(?:today|tonight|yesterday|tomorrow|ago)\\b',
    '\\b(?:last|this)\\s+(?:night|morning|afternoon|evening|week|weekend|month|year)\\b',
    '\\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\\b',
    // Short days and bare months need a lead-in: "I sat with Mei" and "Lunch with April" aren't dates.
    '\\b(?:on|last|this)\\s+(?:mon|tues?|wed|thu|thurs?|fri|sat|sun)\\b',
    `\\b(?:in|on|last|this)\\s+(?:${MONTHS})\\b`,
    `\\b\\d{1,2}${ORDINAL}?(?:\\s+of)?\\s+(?:${MONTHS})\\b`,
    `\\b(?:${MONTHS})\\s+\\d{1,2}${ORDINAL}?\\b`,
    `\\b(?:the|on)\\s+\\d{1,2}${ORDINAL}\\b`,
    '\\b\\d{4}[-/]\\d{1,2}[-/]\\d{1,2}\\b',
    '\\b\\d{1,2}[-./]\\d{1,2}[-./]\\d{2,4}\\b',
  ].join('|'),
  'iu',
);

/** "27/10", "27-10" or "27.10", not part of an amount ("$27.10", "1,800.10") or a ratio ("1.5:1"). */
const DAY_MONTH = /(?<![$\d.,/-])(\d{1,2})([-/.])(\d{1,2})(?![:\d]|[-./]\d)/g;

/**
 * Whether the user mentioned a date ("yesterday", "last Friday", "27/10", "Oct 27"). The model's date is only used if
 * so, because it invents them. "27/10" needs a possible day and month, so "60/40" isn't a date. With a dot it must read
 * day.month with a two-digit month, because "12.5" and "12.25" are amounts. A false match just keeps the model's date,
 * so this leans towards matching.
 */
export function hasDatePhrase(text: string): boolean {
  if (DATE_PHRASE.test(text)) return true;
  return [...text.matchAll(DAY_MONTH)].some((m) => {
    const [a, b] = [Number(m[1]), Number(m[3])];
    if (a < 1 || b < 1) return false;
    if (m[2] === '.') return m[3]!.length === 2 && a <= 31 && b <= 12;
    return Math.max(a, b) <= 31 && Math.min(a, b) <= 12;
  });
}

/**
 * The user messages about the expense being drafted: the latest one with a number in it (the amount, usually), plus
 * any after it, e.g. the "Arun" that answers "who's the third person?". All messages if none has a number.
 */
export function currentExpenseMessages(messages: string[]): string[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (extractNumbers(messages[i]!).length > 0) return messages.slice(i);
  }
  return [...messages];
}

const NUMBER_WORDS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/**
 * How many ways the user said to split: "3 ways", "three ways", "3-ways", or "N-way split" / "4 way split". A bare
 * "3-way" is not enough ("3-way adapter"). The last mention wins, since a later message usually corrects an earlier
 * one. Null when there's no such phrase.
 */
export function splitWays(text: string): number | null {
  const n = `(\\d+|${Object.keys(NUMBER_WORDS).join('|')})`;
  const pattern = new RegExp(`\\b${n}(?:\\s+|-)(?:ways|way\\s+split)\\b`, 'giu');
  const last = [...text.matchAll(pattern)].at(-1)?.[1]?.toLowerCase();
  if (last === undefined) return null;
  return NUMBER_WORDS[last] ?? Number(last);
}

/** How names are compared everywhere: NFC, trimmed, lowercase. */
export function normalizeName(name: string): string {
  return name.normalize('NFC').trim().toLowerCase();
}

/** A new person's display name: "mary-jane" → "Mary-Jane". Only first letters change, so "McDonald" stays as typed. */
export function capitalizeName(name: string): string {
  return name.trim().replace(/(^|[\s-])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toUpperCase());
}
