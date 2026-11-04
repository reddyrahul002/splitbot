// MongoDB store: the same Store as the JSON file. snapshot() is sync, so it reads an in-memory cache of everything.
// A revision number in `meta` tells instances apart: refresh() reloads when another instance has written,
// and a write from stale data is refused. Each update is one transaction; the cache changes only after it commits.
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { MongoClient, type AnyBulkWriteOperation, type ClientSession, type Collection, type Filter } from 'mongodb';
import { z } from 'zod';
import type { Expense, Settlement } from '@splitbot/shared';
import { DbSchema, ME, StoreConflictError, StoreError, type Db, type ExpenseFilter, type SettlementFilter, type Store } from './store';

export const DEFAULT_DB_NAME = 'splitbot';

const META_ID = 'meta';
/** Enough to recognise our own commit after other instances have written on top of it. */
const RECENT_TXN_IDS = 20;
const LISTS = ['people', 'expenses', 'settlements', 'groups'] as const;
type ListName = (typeof LISTS)[number];

interface MetaDoc {
  _id: string;
  version: number;
  revision: number;
  recentTxnIds: string[];
}

/** A record as stored: `id` becomes `_id`, and `seq` keeps its list position (settlement order is meaningful). */
interface StoredDoc {
  _id: string;
  seq: number;
  [field: string]: unknown;
}

/** Test seams, called at the points where a real failure could happen. */
export interface MongoStoreHooks {
  /** Inside the transaction, after the writes. Throwing rolls it back. */
  afterWrites?: () => void | Promise<void>;
  /** After the commit. Throwing looks like a commit whose reply was lost. */
  afterCommit?: () => void | Promise<void>;
  beforeCommitCheck?: () => void | Promise<void>;
  beforeRevisionCheck?: () => void | Promise<void>;
  onReload?: () => void;
}

export interface MongoStoreOptions {
  dbName?: string;
  serverSelectionTimeoutMS?: number;
  /** Where background failures are logged; defaults to console.error. */
  log?: (message: string) => void;
  hooks?: MongoStoreHooks;
}

/** Only the error's type and code: driver messages can hold hosts or the URI. */
function describeError(err: unknown): string {
  if (err instanceof StoreError) return err.message;
  const { name = 'Error', code } = err as { name?: string; code?: unknown };
  return code === undefined ? name : `${name} ${String(code)}`;
}

function toStoreError(action: string, err: unknown): StoreError {
  return err instanceof StoreError ? err : new StoreError(`MongoDB ${action} failed (${describeError(err)}).`);
}

function toDoc({ id, ...fields }: { id: string }, seq: number): StoredDoc {
  return { _id: id, seq, ...fields };
}

function fromDoc({ _id, seq: _seq, ...fields }: StoredDoc): { id: string } {
  return { id: _id, ...fields };
}

/** The writes that turn `before` into `after`. A record that moved is rewritten, so `seq` stays its position. */
function diffList(before: { id: string }[], after: { id: string }[]): AnyBulkWriteOperation<StoredDoc>[] {
  const old = new Map(before.map((item, index) => [item.id, toDoc(item, index)]));
  const ops: AnyBulkWriteOperation<StoredDoc>[] = [];
  after.forEach((item, index) => {
    const doc = toDoc(item, index);
    const previous = old.get(item.id);
    old.delete(item.id);
    if (!isDeepStrictEqual(previous, doc)) {
      ops.push({ replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true } });
    }
  });
  for (const _id of old.keys()) ops.push({ deleteOne: { filter: { _id } } });
  return ops;
}

/** Another instance opening at the same moment can win an upsert; either way the document exists. */
async function ignoreDuplicate(write: Promise<unknown>): Promise<void> {
  await write.catch((err: { code?: unknown }) => {
    if (err.code !== 11000) throw err;
  });
}

export async function openMongoStore(uri: string, options: MongoStoreOptions = {}): Promise<Store> {
  const { dbName = DEFAULT_DB_NAME, serverSelectionTimeoutMS = 5000, log = (m) => console.error(m), hooks = {} } = options;

  let client: MongoClient | undefined;
  try {
    client = new MongoClient(uri, {
      serverSelectionTimeoutMS,
      // A stuck Atlas call fails instead of holding up requests and the write queue.
      connectTimeoutMS: 5000,
      socketTimeoutMS: 15_000,
      waitQueueTimeoutMS: 5000,
      // Keeps a missing groupId missing, not null.
      ignoreUndefined: true,
      // Revision checks must see the latest commit, whatever the URI says.
      readPreference: 'primary',
      // Serverless instances each hold a pool, and the free tier limits connections.
      maxPoolSize: 5,
    });
    await client.connect();
    return await createStore(client, dbName, log, hooks);
  } catch (err) {
    await client?.close().catch(() => undefined);
    throw toStoreError('connection', err);
  }
}

async function createStore(client: MongoClient, dbName: string, log: (message: string) => void, hooks: MongoStoreHooks): Promise<Store> {
  const database = client.db(dbName);
  const metaCollection: Collection<MetaDoc> = database.collection<MetaDoc>('meta');
  const list = (name: ListName): Collection<StoredDoc> => database.collection<StoredDoc>(name);

  async function prepare(): Promise<void> {
    for (const name of LISTS) await list(name).createIndex({ seq: 1 });
    for (const name of ['expenses', 'settlements'] as const) {
      await list(name).createIndex({ date: 1 });
      await list(name).createIndex({ groupId: 1, date: 1 });
    }
    await ignoreDuplicate(metaCollection.updateOne({ _id: META_ID }, { $setOnInsert: { version: 1, revision: 0, recentTxnIds: [] } }, { upsert: true }));
    // seq -1 sorts before everything, so me comes first even in data that was missing me.
    await ignoreDuplicate(list('people').updateOne({ _id: ME.id }, { $setOnInsert: { seq: -1, name: ME.name } }, { upsert: true }));
  }

  /** One consistent view of everything, so another instance's write can't land halfway through the read. */
  async function load(): Promise<{ db: Db; revision: number }> {
    return client.withSession((session) =>
      session.withTransaction(
        async () => {
          const meta = await metaCollection.findOne({ _id: META_ID }, { session });
          // Transactions don't allow parallel reads.
          const read = async (name: ListName) => (await list(name).find({}, { session }).sort({ seq: 1 }).toArray()).map(fromDoc);
          const [people, expenses, settlements, groups] = [await read('people'), await read('expenses'), await read('settlements'), await read('groups')];
          const parsed = DbSchema.safeParse({ version: meta?.version, people, expenses, settlements, ...(groups.length > 0 ? { groups } : {}) });
          if (!parsed.success) {
            throw new StoreError(`The MongoDB data doesn't look like a SplitBot database: ${z.prettifyError(parsed.error)}`);
          }
          // The schema checks the shape; the cast narrows splitMeta's loose object back to SplitMeta.
          return { db: parsed.data as Db, revision: meta!.revision };
        },
        { readConcern: { level: 'snapshot' } },
      ),
    );
  }

  await prepare();
  let { db: cache, revision } = await load();
  let queue: Promise<unknown> = Promise.resolve();

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task);
    queue = run.catch(() => undefined);
    return run;
  }

  async function reload(): Promise<void> {
    const loaded = await load();
    hooks.onReload?.();
    cache = loaded.db;
    revision = loaded.revision;
  }

  /** Taking the revision first means any instance that also wrote conflicts here, before the other writes. */
  async function bumpRevision(session: ClientSession, txnId: string): Promise<void> {
    const taken = await metaCollection.findOneAndUpdate(
      { _id: META_ID, revision },
      { $inc: { revision: 1 }, $push: { recentTxnIds: { $each: [txnId], $slice: -RECENT_TXN_IDS } } },
      { session },
    );
    if (!taken) throw new StoreConflictError('Another instance changed the data first. Please try again.');
  }

  /** After an error the commit may still have applied; our transaction id in `meta` says whether it did. */
  async function didCommit(txnId: string): Promise<boolean> {
    try {
      await hooks.beforeCommitCheck?.();
      const meta = await metaCollection.findOne({ _id: META_ID });
      return meta?.recentTxnIds.includes(txnId) ?? false;
    } catch (err) {
      // Reported as failed. If it did apply, the revision differs, so the next refresh loads it.
      log(`MongoDB: couldn't tell whether a write committed (${describeError(err)}).`);
      return false;
    }
  }

  return {
    path: `mongodb:${dbName}`,
    snapshot: () => structuredClone(cache),
    update<T>(fn: (db: Db) => T): Promise<T> {
      return enqueue(async () => {
        const next = structuredClone(cache);
        // Outside the transaction: the driver can re-run a transaction, and fn must run only once.
        const result = fn(next);
        const writes = LISTS.map((name) => ({ name, ops: diffList(cache[name] ?? [], next[name] ?? []) })).filter(({ ops }) => ops.length > 0);
        if (writes.length === 0) {
          cache = next;
          return result;
        }

        const txnId = randomUUID();
        try {
          await client.withSession((session) =>
            session.withTransaction(
              async () => {
                await bumpRevision(session, txnId);
                for (const { name, ops } of writes) await list(name).bulkWrite(ops, { session });
                await hooks.afterWrites?.();
              },
              { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, maxCommitTimeMS: 10_000 },
            ),
          );
          await hooks.afterCommit?.();
        } catch (err) {
          if (err instanceof StoreConflictError) {
            await reload().catch((reloadErr: unknown) => log(`MongoDB: reload failed (${describeError(reloadErr)}).`));
            throw err;
          }
          if (!(await didCommit(txnId))) throw toStoreError('write', err);
        }
        cache = next;
        revision += 1;
        return result;
      });
    },
    async findExpenses({ from, to, groupId }: ExpenseFilter): Promise<Expense[]> {
      const filter: Filter<StoredDoc> = {};
      if (from !== undefined || to !== undefined) filter.date = { ...(from !== undefined && { $gte: from }), ...(to !== undefined && { $lte: to }) };
      if (groupId !== undefined) filter.groupId = groupId;
      return findList('expenses', filter) as Promise<unknown> as Promise<Expense[]>;
    },
    async findSettlements({ groupId }: SettlementFilter): Promise<Settlement[]> {
      return findList('settlements', groupId === undefined ? {} : { groupId }) as Promise<unknown> as Promise<Settlement[]>;
    },
    async refresh() {
      try {
        await hooks.beforeRevisionCheck?.();
        // Cheap, and outside the queue, so requests don't wait on each other when nothing has changed.
        if ((await currentRevision()) === revision) return;
        await enqueue(async () => {
          // Checked again in the queue: it may be our own write finishing, or a reload that already ran.
          if ((await currentRevision()) !== revision) await reload();
        });
      } catch (err) {
        log(`MongoDB: couldn't check for changes, using cached data (${describeError(err)}).`);
      }
    },
    close: () => client.close(),
  };

  async function currentRevision(): Promise<number | undefined> {
    return (await metaCollection.findOne({ _id: META_ID }, { projection: { revision: 1 } }))?.revision;
  }

  async function findList(name: ListName, filter: Filter<StoredDoc>): Promise<{ id: string }[]> {
    try {
      return (await list(name).find(filter).sort({ seq: 1 }).toArray()).map(fromDoc);
    } catch (err) {
      throw toStoreError('read', err);
    }
  }
}
