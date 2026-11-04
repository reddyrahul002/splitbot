// JSON file store (data/db.json): an in-memory cache, atomic writes (tmp file + rename) and a serialized write queue.
import * as nodeFs from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import { CATEGORIES, ME_ID, SPLIT_TYPES, type Expense, type Group, type Person, type Settlement } from '@splitbot/shared';

export interface Db {
  version: 1;
  people: Person[];
  expenses: Expense[];
  settlements: Settlement[];
  /** Absent until the first group is created, so older files load unchanged. */
  groups?: Group[];
}

export interface Store {
  readonly path: string;
  /** A deep copy of the current data. */
  snapshot(): Db;
  /**
   * Runs `fn` on a copy of the data and writes it. Updates run one at a time, in call order.
   * The cache changes only after the write succeeds; if `fn` or the write throws, nothing changes.
   */
  update<T>(fn: (db: Db) => T): Promise<T>;
}

/** The file operations the store uses; tests replace some of them to simulate failures. */
export interface StoreFs {
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  writeFile(path: string, data: string, encoding: 'utf8'): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  unlink(path: string): Promise<void>;
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
}

const ME: Person = { id: ME_ID, name: 'Me' };

const PersonSchema = z.object({ id: z.string(), name: z.string() });
const ExpenseSchema = z.object({
  id: z.string(),
  description: z.string(),
  category: z.enum(CATEGORIES),
  date: z.string(),
  totalCents: z.int(),
  paidBy: z.string(),
  shares: z.array(z.object({ personId: z.string(), cents: z.int() })),
  splitMeta: z.looseObject({ splitType: z.enum(SPLIT_TYPES) }),
  createdAt: z.string(),
  groupId: z.string().optional(),
});
const SettlementSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  cents: z.int(),
  date: z.string(),
  groupId: z.string().optional(),
});
const GroupSchema = z.object({ id: z.string(), name: z.string(), memberIds: z.array(z.string()) });
const DbSchema = z.object({
  version: z.literal(1),
  people: z.array(PersonSchema),
  expenses: z.array(ExpenseSchema),
  settlements: z.array(SettlementSchema),
  groups: z.array(GroupSchema).optional(),
});

let tmpCounter = 0;

export async function openStore(path: string, options: { fs?: Partial<StoreFs> } = {}): Promise<Store> {
  const fs: StoreFs = { ...nodeFs, ...options.fs };

  async function write(db: Db): Promise<void> {
    const tmp = `${path}.${process.pid}.${++tmpCounter}.tmp`;
    try {
      await fs.writeFile(tmp, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
      await fs.rename(tmp, path);
    } catch (err) {
      await fs.unlink(tmp).catch(() => undefined);
      throw err;
    }
  }

  let cache: Db;
  let raw: string | undefined;
  try {
    raw = await fs.readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  if (raw === undefined) {
    cache = { version: 1, people: [ME], expenses: [], settlements: [] };
    await fs.mkdir(dirname(path), { recursive: true });
    await write(cache);
  } else {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch (err) {
      throw new Error(`Can't read ${path}: it isn't valid JSON (${(err as Error).message}).`);
    }
    const parsed = DbSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(`${path} doesn't look like a SplitBot database: ${z.prettifyError(parsed.error)}`);
    }
    // The schema checks the shape; the cast narrows splitMeta's loose object back to SplitMeta.
    cache = parsed.data as Db;
    if (!cache.people.some((p) => p.id === ME_ID)) {
      cache.people.unshift(ME);
      await write(cache);
    }
  }

  let queue: Promise<unknown> = Promise.resolve();

  return {
    path,
    snapshot: () => structuredClone(cache),
    update<T>(fn: (db: Db) => T): Promise<T> {
      const run = queue.then(async () => {
        const next = structuredClone(cache);
        const result = fn(next);
        await write(next);
        cache = next;
        return result;
      });
      queue = run.catch(() => undefined);
      return run;
    },
  };
}
