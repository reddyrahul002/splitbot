// What only the Mongo store has: transactions, uncertain commits, several instances on one database, and URI secrecy.
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Store } from '../src/store';
import { createApp } from '../src/app';
import { createDraftStore } from '../src/drafts';
import { StoreConflictError, StoreError } from '../src/store';
import { openMongoStore, type MongoStoreOptions } from '../src/store-mongo';
import { openConfiguredStore } from '../src/store-select';
import { expense } from './helpers';
import { MONGO_START_TIMEOUT_MS, MONGO_TEST_TIMEOUT_MS, startMongo, type TestMongo } from './mongo-helper';

// The driver warns once per process, so this listens from before the first store opens.
const driverWarnings: string[] = [];
process.on('warning', (warning) => driverWarnings.push(warning.message));

let mongo: TestMongo;
beforeAll(async () => {
  mongo = await startMongo();
}, MONGO_START_TIMEOUT_MS);
afterAll(() => mongo.stop());

const opened: Store[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((store) => store.close()));
  vi.restoreAllMocks();
});

async function open(dbName: string, options: Omit<MongoStoreOptions, 'dbName'> = {}): Promise<Store> {
  const store = await openMongoStore(mongo.uri, { dbName, log: () => undefined, ...options });
  opened.push(store);
  return store;
}

const appFor = (store: Store, log: (message: string) => void = () => undefined) =>
  createApp({ store, drafts: createDraftStore(), today: () => '2026-11-03', log });

const ARUN = { id: 'arun', name: 'Arun' };
const revisionOf = async (dbName: string) => (await mongo.read(dbName)).meta![0]!.revision as number;
const DRAFT = { kind: 'expense', description: 'Taxi', category: 'Transport', totalCents: 1000, paidBy: 'me', participants: ['me', 'Arun'], splitType: 'equal' };

describe('stored documents', { timeout: MONGO_TEST_TIMEOUT_MS }, () => {
  it('#M1 use the record id as _id, keep a position, and leave missing fields out', async () => {
    const dbName = mongo.freshDbName();
    const store = await open(dbName);
    const e = expense('me', { me: 100 });
    await store.update((db) => db.expenses.push(e));
    const [doc] = (await mongo.read(dbName)).expenses!;
    expect(doc).toMatchObject({ _id: e.id, seq: 0, totalCents: 100 });
    expect(doc).not.toHaveProperty('id');
    expect(doc).not.toHaveProperty('groupId');
  });

  it('#M20 opening uses no deprecated driver option', async () => {
    await open(mongo.freshDbName());
    await new Promise((resolve) => setImmediate(resolve));
    expect(driverWarnings.filter((message) => message.includes('deprecated'))).toEqual([]);
  });

  it('#M19 a field set to undefined is left out, not saved as null, so the database still opens', async () => {
    const dbName = mongo.freshDbName();
    const store = await open(dbName);
    await store.update((db) => db.expenses.push({ ...expense('me', { me: 100 }), groupId: undefined }));
    expect((await mongo.read(dbName)).expenses![0]).not.toHaveProperty('groupId');
    expect((await open(dbName)).snapshot().expenses).toHaveLength(1);
  });

  it('#M2 an update that changes nothing writes nothing', async () => {
    const dbName = mongo.freshDbName();
    const store = await open(dbName);
    const before = await mongo.read(dbName);
    expect(await store.update((db) => db.people.length)).toBe(1);
    expect(await mongo.read(dbName)).toEqual(before);
  });

  it('#M3 the indexes for common queries exist', async () => {
    const dbName = mongo.freshDbName();
    await open(dbName);
    const keys = async (name: string) => (await mongo.db(dbName).collection(name).listIndexes().toArray()).map((i) => i.key);
    expect(await keys('expenses')).toEqual(expect.arrayContaining([{ date: 1 }, { groupId: 1, date: 1 }]));
    expect(await keys('settlements')).toEqual(expect.arrayContaining([{ date: 1 }, { groupId: 1, date: 1 }]));
  });

  it('#M4 several instances opening an empty database at once seed it once', async () => {
    const dbName = mongo.freshDbName();
    await Promise.all(Array.from({ length: 5 }, () => open(dbName)));
    const raw = await mongo.read(dbName);
    expect(raw.people!.map((p) => p._id)).toEqual(['me']);
    expect(raw.meta).toHaveLength(1);
  });
});

describe('transactions', { timeout: MONGO_TEST_TIMEOUT_MS }, () => {
  it('#M5 a failure after the writes rolls back every collection, including the revision', async () => {
    const dbName = mongo.freshDbName();
    let fail = false;
    const store = await open(dbName, {
      hooks: {
        afterWrites: () => {
          if (fail) throw new Error('lost connection');
        },
      },
    });
    await store.update((db) => {
      db.groups = [{ id: 'g1', name: 'Trip', memberIds: ['me'] }];
    });
    const before = await mongo.read(dbName);
    fail = true;
    await expect(
      store.update((db) => {
        db.people.push({ id: 'kai', name: 'Kai' });
        db.expenses.push(expense('me', { me: 100, kai: 100 }));
        db.groups![0]!.memberIds.push('kai');
      }),
    ).rejects.toBeInstanceOf(StoreError);
    expect(await mongo.read(dbName)).toEqual(before);
  });
});

describe('uncertain commits', { timeout: MONGO_TEST_TIMEOUT_MS }, () => {
  it('#M6 the commit applied but the reply was lost → the update succeeds', async () => {
    const dbName = mongo.freshDbName();
    let lose = false;
    const store = await open(dbName, {
      hooks: {
        afterCommit: () => {
          if (lose) throw new Error('connection reset');
        },
      },
    });
    const before = await revisionOf(dbName);
    lose = true;
    await expect(store.update((db) => db.people.push(ARUN))).resolves.toBe(2);
    expect(store.snapshot().people.map((p) => p.id)).toEqual(['me', 'arun']);
    expect(await revisionOf(dbName)).toBe(before + 1);
    lose = false;
    await store.update((db) => db.people.push({ id: 'mei', name: 'Mei' }));
    expect((await open(dbName)).snapshot().people.map((p) => p.id)).toEqual(['me', 'arun', 'mei']);
  });

  it('#M7 another instance writing straight after still counts as committed', async () => {
    const dbName = mongo.freshDbName();
    const other = await open(dbName);
    let lose = false;
    const store = await open(dbName, {
      hooks: {
        afterCommit: async () => {
          if (!lose) return;
          lose = false;
          await other.refresh();
          await other.update((db) => db.people.push({ id: 'mei', name: 'Mei' }));
          throw new Error('connection reset');
        },
      },
    });
    lose = true;
    await expect(store.update((db) => db.people.push(ARUN))).resolves.toBe(2);
    expect((await mongo.read(dbName)).people!.filter((p) => p._id === 'arun')).toHaveLength(1);
  });

  it("#M8 the outcome can't be read → rejects with no cache change, and the next check picks up the committed write", async () => {
    const dbName = mongo.freshDbName();
    let lose = false;
    const store = await open(dbName, {
      hooks: {
        afterCommit: () => {
          if (lose) throw new Error('connection reset');
        },
        beforeCommitCheck: () => {
          if (lose) throw new Error('still down');
        },
      },
    });
    lose = true;
    await expect(store.update((db) => db.people.push(ARUN))).rejects.toBeInstanceOf(StoreError);
    expect(store.snapshot().people.map((p) => p.id)).toEqual(['me']);
    lose = false;
    await store.refresh();
    expect(store.snapshot().people.map((p) => p.id)).toEqual(['me', 'arun']);
  });
});

describe('several instances on one database', { timeout: MONGO_TEST_TIMEOUT_MS }, () => {
  it("#M9 a write through one instance is seen by the other on its next request, and not before", async () => {
    const dbName = mongo.freshDbName();
    const [a, b] = [await open(dbName), await open(dbName)];
    const [appA, appB] = [appFor(a), appFor(b)];
    await a.update((db) => db.people.push(ARUN));

    const draft = await request(appA).post('/api/drafts').send(DRAFT);
    await request(appA).post(`/api/drafts/${draft.body.id}/confirm`).send({});

    // Nothing has reached b yet; its next request does the check.
    expect(b.snapshot().expenses).toEqual([]);
    const seen = await request(appB).get('/api/expenses');
    expect(seen.body.map((e: { description: string }) => e.description)).toEqual(['Taxi']);
    expect(b.snapshot().expenses).toHaveLength(1);
    expect((await request(appB).get('/api/account')).body.people).toEqual([expect.objectContaining({ personId: 'arun', netCents: 500 })]);
  });

  it('#M10 a reload happens only after another instance wrote, not for every request or own writes', async () => {
    const dbName = mongo.freshDbName();
    let reloads = 0;
    const other = await open(dbName);
    const store = await open(dbName, { hooks: { onReload: () => void reloads++ } });
    const app = appFor(store);
    await request(app).get('/api/people');
    await request(app).get('/api/account');
    await store.update((db) => db.people.push(ARUN));
    await request(app).get('/api/people');
    expect(reloads).toBe(0);

    await other.refresh();
    await other.update((db) => db.people.push({ id: 'mei', name: 'Mei' }));
    await Promise.all([request(app).get('/api/people'), request(app).get('/api/account'), request(app).get('/api/groups')]);
    expect(reloads).toBe(1);
    expect(store.snapshot().people.map((p) => p.id)).toEqual(['me', 'arun', 'mei']);
  });

  it('#M11 writing from stale data is rejected, overwrites nothing, and the retry works', async () => {
    const dbName = mongo.freshDbName();
    const [a, b] = [await open(dbName), await open(dbName)];
    await a.update((db) => db.people.push(ARUN));
    const stale = b.update((db) => db.people.push({ id: 'mei', name: 'Mei' }));
    await expect(stale).rejects.toBeInstanceOf(StoreConflictError);
    expect((await mongo.read(dbName)).people!.map((p) => p._id)).toEqual(['me', 'arun']);
    expect(b.snapshot().people.map((p) => p.id)).toEqual(['me', 'arun']);
    await b.update((db) => db.people.push({ id: 'mei', name: 'Mei' }));
    expect((await mongo.read(dbName)).people!.map((p) => p._id)).toEqual(['me', 'arun', 'mei']);
  });

  it('#M12 a stale confirm answers 409 and the draft can be confirmed again', async () => {
    const dbName = mongo.freshDbName();
    let checkFails = false;
    const a = await open(dbName);
    const b = await open(dbName, {
      hooks: {
        beforeRevisionCheck: () => {
          if (checkFails) throw new Error('blip');
        },
      },
    });
    const appB = appFor(b);
    const draft = await request(appB).post('/api/drafts').send({ ...DRAFT, participants: ['me', 'Kai'] });
    await a.update((db) => db.people.push(ARUN));
    checkFails = true; // The check fails open, so b goes on to write from stale data.
    const conflict = await request(appB).post(`/api/drafts/${draft.body.id}/confirm`).send({});
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('STORE_CONFLICT');
    checkFails = false;
    expect((await request(appB).post(`/api/drafts/${draft.body.id}/confirm`).send({})).status).toBe(200);
    const raw = await mongo.read(dbName);
    expect(raw.expenses).toHaveLength(1);
    expect(raw.people!.map((p) => p.name)).toEqual(['Me', 'Arun', 'Kai']);
  });

  it('#M13 a failed check still answers from the cache and logs without details', async () => {
    const dbName = mongo.freshDbName();
    const logs: string[] = [];
    const store = await open(dbName, {
      log: (m) => logs.push(m),
      hooks: {
        beforeRevisionCheck: () => {
          throw new Error(`down at ${mongo.uri}`);
        },
      },
    });
    const res = await request(appFor(store)).get('/api/people');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'me', name: 'Me' }]);
    expect(logs).toHaveLength(1);
    expect(logs.join()).not.toContain(mongo.uri);
  });

  it('#M14 bad data from another writer keeps the last good cache, and is logged', async () => {
    const dbName = mongo.freshDbName();
    const logs: string[] = [];
    const store = await open(dbName, { log: (m) => logs.push(m) });
    await mongo.db(dbName).collection<{ _id: string; seq: number }>('expenses').insertOne({ _id: 'bad', seq: 0 });
    await mongo.db(dbName).collection<{ _id: string }>('meta').updateOne({ _id: 'meta' }, { $inc: { revision: 1 } });
    await store.refresh();
    expect(store.snapshot().expenses).toEqual([]);
    expect(logs).toHaveLength(1);
  });

  it('#M15 known limit: drafts are per instance, so a draft from one instance is not found on another', async () => {
    const dbName = mongo.freshDbName();
    const [appA, appB] = [appFor(await open(dbName)), appFor(await open(dbName))];
    const draft = await request(appA).post('/api/drafts').send({ ...DRAFT, participants: ['me', 'Kai'] });
    const confirm = await request(appB).post(`/api/drafts/${draft.body.id}/confirm`).send({});
    expect(confirm.status).toBe(404);
    expect(confirm.body.error.code).toBe('DRAFT_NOT_FOUND');
  });
});

describe('the URI stays secret', { timeout: MONGO_TEST_TIMEOUT_MS }, () => {
  // Joined at runtime so it can't look like a real connection string in the repo.
  const SECRET = 'not-a-real-password-123';
  const unreachable = ['mongodb', '://user:', SECRET, '@127.0.0.1:1/'].join('');

  it.each([
    ['unreachable', unreachable],
    ['malformed', `nonsense ${SECRET}`],
  ])('#M16 a %s URI rejects without the URI in the message, stack or logs', async (_what, uri) => {
    const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'error'), vi.spyOn(console, 'warn')];
    const err: Error = await openMongoStore(uri, { serverSelectionTimeoutMS: 200 }).then(
      () => {
        throw new Error('expected the open to fail');
      },
      (e: Error) => e,
    );
    expect(err).toBeInstanceOf(StoreError);
    expect(`${err.message} ${err.stack} ${String(err.cause)}`).not.toContain(SECRET);
    expect(JSON.stringify(spies.map((s) => s.mock.calls))).not.toContain(SECRET);
  });

  it('#M17 store.path names the database and never the URI', async () => {
    const dbName = mongo.freshDbName();
    const store = await open(dbName);
    expect(store.path).toBe(`mongodb:${dbName}`);
  });

  it('#M18 STORE=mongo opens the Mongo store on the splitbot database', async () => {
    const store = await openConfiguredStore({ kind: 'mongo', uri: mongo.uri });
    opened.push(store);
    expect(store.path).toBe('mongodb:splitbot');
    expect(store.snapshot().people).toEqual([{ id: 'me', name: 'Me' }]);
  });
});
