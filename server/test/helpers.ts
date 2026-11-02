// Test builders and a seeded PRNG shared by the domain tests.
import type { Category, Expense, PersonId, Settlement } from '@splitbot/shared';

let nextId = 1;

/** An expense with explicit shares; only the fields a test cares about need to be given. */
export function expense(
  paidBy: PersonId,
  shares: Record<PersonId, number>,
  extra: Partial<Pick<Expense, 'category' | 'date' | 'description'>> = {},
): Expense {
  const list = Object.entries(shares).map(([personId, cents]) => ({ personId, cents }));
  return {
    id: `e${nextId++}`,
    description: extra.description ?? 'Test expense',
    category: extra.category ?? ('Other' satisfies Category),
    date: extra.date ?? '2026-11-01',
    totalCents: list.reduce((sum, s) => sum + s.cents, 0),
    paidBy,
    shares: list,
    splitMeta: { splitType: 'exact' },
    createdAt: '2026-11-01T00:00:00.000Z',
  };
}

export function settlement(from: PersonId, to: PersonId, cents: number): Settlement {
  return { id: `s${nextId++}`, from, to, cents, date: '2026-11-02' };
}

/** mulberry32: small seeded PRNG so failures are reproducible. */
export function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random integer in [min, max]. */
export function randInt(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}
