// The split engine: turns a SplitInput into integer-cent shares that always add up to the total.
// Order of operations: validate → apply itemized adjustments → split the remainder by splitType.
import { SPLIT_TYPES, type PersonId, type Share, type SplitInput } from '@splitbot/shared';
import { describeCents, formatCents } from './money';

export type SplitErrorCode =
  | 'INVALID_TOTAL'
  | 'NO_PARTICIPANTS'
  | 'DUPLICATE_PARTICIPANT'
  | 'INVALID_SPLIT_TYPE'
  | 'SPLIT_VALUES_TYPE_MISMATCH'
  | 'INVALID_AMOUNT'
  | 'INVALID_SHARES'
  | 'ADJUSTMENTS_WITH_EXACT'
  | 'ADJUSTMENT_NOT_PARTICIPANT'
  | 'ADJUSTMENTS_EXCEED_TOTAL'
  | 'MISSING_SPLIT_VALUE'
  | 'UNKNOWN_PERSON_IN_SPLIT_VALUES'
  | 'EXACT_SUM_MISMATCH'
  | 'PERCENT_SUM_NOT_100';

/** A validation failure. The message is in dollars because it goes back to the model as a tool result. */
export class SplitError extends Error {
  override readonly name = 'SplitError';
  constructor(
    readonly code: SplitErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** Percentages must add up to 100 within this tolerance, checked on the raw values. */
const PERCENT_TOLERANCE = 0.01;
/** Absorbs binary float noise, e.g. 50.005 + 50.005 = 100.00999999999999. */
const FLOAT_EPSILON = 1e-9;
/** Percentages become integer weights in millionths of a percent, so allocation uses integer math. */
const PERCENT_SCALE = 1_000_000;
/** Share weights are scaled to integers so fractional shares like 1.5 still use integer math. */
const SHARE_SCALE = 1000;
const SPLIT_VALUE_KINDS = ['exact', 'percent', 'shares'] as const;

export function computeShares(input: SplitInput): Share[] {
  const { totalCents, paidBy, participants, splitType } = input;
  const adjustments = input.adjustments ?? [];

  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    throw new SplitError('INVALID_TOTAL', `The total must be more than $0.00, in whole cents (got ${describeCents(totalCents)}).`);
  }
  if (!SPLIT_TYPES.includes(splitType)) {
    throw new SplitError('INVALID_SPLIT_TYPE', `Unknown split type "${splitType}". Use one of: ${SPLIT_TYPES.join(', ')}.`);
  }
  for (const kind of SPLIT_VALUE_KINDS) {
    const values = input[kind];
    if (kind !== splitType && values && Object.keys(values).length > 0) {
      throw new SplitError(
        'SPLIT_VALUES_TYPE_MISMATCH',
        `The split type is "${splitType}" but ${kind} values were given. Set the split type to "${kind}", or remove the ${kind} values.`,
      );
    }
  }
  if (participants.length === 0) {
    throw new SplitError('NO_PARTICIPANTS', 'An expense needs at least one participant.');
  }
  const seen = new Set<PersonId>();
  for (const p of participants) {
    if (seen.has(p)) throw new SplitError('DUPLICATE_PARTICIPANT', `"${p}" is listed more than once.`);
    seen.add(p);
  }

  // Itemized adjustments: each one is charged only to its person.
  if (splitType === 'exact' && adjustments.length > 0) {
    throw new SplitError(
      'ADJUSTMENTS_WITH_EXACT',
      'Itemized adjustments cannot be combined with an exact split; include them in the exact amounts instead.',
    );
  }
  const extra = new Map<PersonId, number>();
  let adjustmentsTotal = 0;
  for (const adj of adjustments) {
    if (!Number.isInteger(adj.cents) || adj.cents < 0) {
      throw new SplitError(
        'INVALID_AMOUNT',
        `Adjustment for "${adj.person}" is ${describeCents(adj.cents)}; it must be $0.00 or more, in whole cents.`,
      );
    }
    if (!seen.has(adj.person)) {
      throw new SplitError('ADJUSTMENT_NOT_PARTICIPANT', `"${adj.person}" has an adjustment but is not a participant.`);
    }
    extra.set(adj.person, (extra.get(adj.person) ?? 0) + adj.cents);
    adjustmentsTotal += adj.cents;
  }
  if (adjustmentsTotal > totalCents) {
    throw new SplitError(
      'ADJUSTMENTS_EXCEED_TOTAL',
      `Itemized adjustments add up to ${formatCents(adjustmentsTotal)}, more than the total of ${formatCents(totalCents)}.`,
    );
  }
  const remainder = totalCents - adjustmentsTotal;

  // Leftover cents go to the payer first (if participating), then in listed order.
  const tieOrder = participants.includes(paidBy)
    ? [paidBy, ...participants.filter((p) => p !== paidBy)]
    : participants;
  const tieRank = participants.map((p) => tieOrder.indexOf(p));

  let base: number[];
  switch (splitType) {
    case 'equal':
      base = allocate(remainder, participants.map(() => 1), tieRank);
      break;

    case 'exact': {
      const values = splitValues(input.exact, participants, 'exact');
      for (const [i, v] of values.entries()) {
        if (!Number.isInteger(v) || v < 0) {
          throw new SplitError(
            'INVALID_AMOUNT',
            `Exact amount for "${participants[i]}" is ${describeCents(v)}; it must be $0.00 or more, in whole cents.`,
          );
        }
      }
      const sum = values.reduce((a, b) => a + b, 0);
      if (sum !== totalCents) {
        throw new SplitError(
          'EXACT_SUM_MISMATCH',
          `Exact amounts add up to ${formatCents(sum)} but the total is ${formatCents(totalCents)} (off by ${formatCents(Math.abs(totalCents - sum))}).`,
        );
      }
      base = values;
      break;
    }

    case 'percent': {
      const values = splitValues(input.percent, participants, 'percent');
      for (const [i, v] of values.entries()) {
        if (!Number.isFinite(v) || v < 0) {
          throw new SplitError('INVALID_AMOUNT', `Percentage for "${participants[i]}" is ${v}; it must be 0 or more.`);
        }
      }
      const sum = values.reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 100) > PERCENT_TOLERANCE + FLOAT_EPSILON) {
        throw new SplitError('PERCENT_SUM_NOT_100', `Percentages add up to ${Number(sum.toFixed(4))}%, not 100%.`);
      }
      // Weights are normalized by their own sum, so 99.99% or 100.01% still allocates the whole remainder.
      base = allocate(remainder, values.map((v) => Math.round(v * PERCENT_SCALE)), tieRank);
      break;
    }

    case 'shares': {
      const values = splitValues(input.shares, participants, 'shares');
      const weights = values.map((v, i) => {
        if (!Number.isFinite(v) || v <= 0) {
          throw new SplitError('INVALID_SHARES', `Share count for "${participants[i]}" is ${v}; it must be more than 0.`);
        }
        const scaled = v * SHARE_SCALE;
        const w = Math.round(scaled);
        if (Math.abs(scaled - w) > FLOAT_EPSILON * Math.max(1, scaled)) {
          throw new SplitError(
            'INVALID_SHARES',
            `Share count for "${participants[i]}" is ${v}, which has more than 3 decimal places; use at most 3.`,
          );
        }
        return w;
      });
      base = allocate(remainder, weights, tieRank);
      break;
    }

    default: {
      const unreachable: never = splitType;
      throw new SplitError('INVALID_SPLIT_TYPE', `Unknown split type "${String(unreachable)}".`);
    }
  }

  return participants.map((personId, i) => ({ personId, cents: base[i]! + (extra.get(personId) ?? 0) }));
}

/** Reads one value per participant, in participant order, rejecting gaps and strangers. */
function splitValues(
  values: Record<PersonId, number> | undefined,
  participants: PersonId[],
  kind: 'exact' | 'percent' | 'shares',
): number[] {
  const map = values ?? {};
  for (const key of Object.keys(map)) {
    if (!participants.includes(key)) {
      throw new SplitError('UNKNOWN_PERSON_IN_SPLIT_VALUES', `"${key}" has a ${kind} value but is not a participant.`);
    }
  }
  return participants.map((p) => {
    // hasOwn, so ids like "constructor" don't pick up Object.prototype members.
    const v = Object.hasOwn(map, p) ? map[p] : undefined;
    if (v === undefined) throw new SplitError('MISSING_SPLIT_VALUE', `"${p}" has no ${kind} value.`);
    return v;
  });
}

/**
 * Largest-remainder allocation of `amount` cents in proportion to integer `weights`.
 * Leftover cents go to the largest fractional remainders; ties go to the lowest `tieRank`.
 * BigInt keeps amount × weight exact for any size.
 */
function allocate(amount: number, weights: number[], tieRank: number[]): number[] {
  const total = BigInt(weights.reduce((a, b) => a + b, 0));
  const parts = weights.map((w, i) => {
    const product = BigInt(amount) * BigInt(w);
    return { i, floor: Number(product / total), frac: product % total };
  });
  let leftover = amount - parts.reduce((sum, p) => sum + p.floor, 0);
  const result = parts.map((p) => p.floor);
  const order = [...parts].sort((a, b) =>
    a.frac === b.frac ? tieRank[a.i]! - tieRank[b.i]! : a.frac > b.frac ? -1 : 1,
  );
  for (const p of order) {
    if (leftover === 0) break;
    result[p.i]! += 1;
    leftover--;
  }
  return result;
}
