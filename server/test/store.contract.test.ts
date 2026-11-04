// The behaviour every store must have. store.test.ts keeps the JSON file's own details (paths, .tmp files, corrupt JSON).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { expense, settlement } from './helpers';
import { MONGO_START_TIMEOUT_MS, MONGO_TEST_TIMEOUT_MS, startMongo, type TestMongo } from './mongo-helper';
import { jsonHarness, mongoHarness, type StoreHarness } from './store-harness';

let mongo: TestMongo;
beforeAll(async () => {
  mongo = await startMongo();
}, MONGO_START_TIMEOUT_MS);
afterAll(() => mongo.stop());

const STORES: [string, () => Promise<StoreHarness>][] = [
  ['json', jsonHarness],
  ['mongo', async () => mongoHarness(mongo)],
];

const ME = { id: 'me', name: 'Me' };

describe.each(STORES)('%s store', (_name, makeHarness) => {
  let h: StoreHarness;
  beforeEach(async () => {
    h = await makeHarness();
  });
  afterEach(() => h.cleanup());

  describe('opening', { timeout: MONGO_TEST_TIMEOUT_MS }, () => {
    it('#S1 no data → only me', async () => {
      const store = await h.open();
      expect(store.snapshot()).toEqual({ version: 1, people: [ME], expenses: [], settlements: [] });
      expect((await h.open()).snapshot()).toEqual(store.snapshot());
    });

    it('#S2 people, expenses, settlements and groups survive a reopen', async () => {
      const store = await h.open();
      await store.update((db) => {
        db.people.push({ id: 'arun', name: 'Arun' });
        db.groups = [{ id: 'g1', name: 'Trip', memberIds: ['me', 'arun'] }];
        db.expenses.push({ ...expense('me', { me: 4500, arun: 4500 }), groupId: 'g1' });
        db.settlements.push({ ...settlement('arun', 'me', 2000), groupId: 'g1' });
      });
      const reopened = (await h.open()).snapshot();
      expect(reopened).toEqual(store.snapshot());
      expect(reopened.expenses[0]!.totalCents).toBe(9000);
      expect(reopened.settlements[0]!.groupId).toBe('g1');
      expect(reopened.groups).toEqual([{ id: 'g1', name: 'Trip', memberIds: ['me', 'arun'] }]);
    });

    it('#S3 snapshot() is a copy', async () => {
      const store = await h.open();
      store.snapshot().people.push({ id: 'x', name: 'X' });
      expect(store.snapshot().people).toEqual([ME]);
    });

    it.each([
      ['an expense', { people: [ME], expenses: [{ id: 'e1' }] }],
      ['a group', { people: [ME], groups: [{ id: 'g1' }] }],
    ])('#S4 %s with the wrong shape → rejects, and the data is left alone', async (_what, data) => {
      await h.seedRaw(data);
      const before = await h.readRaw();
      await expect(h.open()).rejects.toThrow();
      const after = await h.readRaw();
      expect(typeof after === 'string' ? after : stored(after)).toEqual(typeof before === 'string' ? before : stored(before));
    });

    it('#S5 data without me gets me added, first', async () => {
      await h.seedRaw({ people: [{ id: 'arun', name: 'Arun' }] });
      const store = await h.open();
      expect(store.snapshot().people.map((p) => p.id)).toEqual(['me', 'arun']);
      expect((await h.open()).snapshot().people.map((p) => p.id)).toEqual(['me', 'arun']);
    });

    it('#S6 data from before groups has no groups field', async () => {
      await h.seedRaw({ people: [ME] });
      expect((await h.open()).snapshot().groups).toBeUndefined();
    });
  });

  describe('update', { timeout: MONGO_TEST_TIMEOUT_MS }, () => {
    it('#S7 a failed write changes nothing: not the snapshot, not the stored data', async () => {
      const store = await h.open();
      await store.update((db) => db.people.push({ id: 'arun', name: 'Arun' }));
      const before = store.snapshot();
      h.failNextWrite();
      await expect(
        store.update((db) => {
          db.people.push({ id: 'kai', name: 'Kai' });
          db.expenses.push(expense('me', { me: 100, kai: 100 }));
        }),
      ).rejects.toThrow();
      expect(store.snapshot()).toEqual(before);
      expect((await h.open()).snapshot()).toEqual(before);
    });

    it('#S8 after a failed write the next update succeeds', async () => {
      const store = await h.open();
      h.failNextWrite();
      await expect(store.update((db) => db.people.push({ id: 'arun', name: 'Arun' }))).rejects.toThrow();
      await store.update((db) => db.people.push({ id: 'mei', name: 'Mei' }));
      expect(store.snapshot().people.map((p) => p.id)).toEqual(['me', 'mei']);
      expect((await h.open()).snapshot().people.map((p) => p.id)).toEqual(['me', 'mei']);
    });

    it("#S9 an fn that throws → that same error, nothing written, later updates still run", async () => {
      const store = await h.open();
      const before = await h.readRaw();
      await expect(
        store.update((db) => {
          db.people.push({ id: 'arun', name: 'Arun' });
          throw new Error('nope');
        }),
      ).rejects.toThrow('nope');
      expect(await h.readRaw()).toEqual(before);
      expect(store.snapshot().people).toEqual([ME]);
      await store.update((db) => db.people.push({ id: 'mei', name: 'Mei' }));
      expect(store.snapshot().people.map((p) => p.id)).toEqual(['me', 'mei']);
    });

    it('#S10 50 concurrent updates all apply in call order', async () => {
      const store = await h.open();
      const ids = Array.from({ length: 50 }, (_, i) => `p${i}`);
      const results = await Promise.all(
        ids.map((id) =>
          store.update((db) => {
            db.people.push({ id, name: id });
            return db.people.length;
          }),
        ),
      );
      expect(results).toEqual(ids.map((_, i) => i + 2));
      expect(store.snapshot().people.slice(1).map((p) => p.id)).toEqual(ids);
      expect((await h.open()).snapshot().people.slice(1).map((p) => p.id)).toEqual(ids);
    });

    it('#S11 list order survives deleting from the middle and adding to the front', async () => {
      const store = await h.open();
      const [a, b, c] = [settlement('me', 'arun', 1), settlement('me', 'arun', 2), settlement('me', 'arun', 3)];
      await store.update((db) => {
        db.people.push({ id: 'arun', name: 'Arun' });
        db.settlements.push(a, b, c);
      });
      await store.update((db) => {
        db.settlements.splice(1, 1);
        db.people.unshift({ id: 'first', name: 'First' });
      });
      const reopened = (await h.open()).snapshot();
      expect(reopened.settlements.map((s) => s.cents)).toEqual([1, 3]);
      expect(reopened.people.map((p) => p.id)).toEqual(['first', 'me', 'arun']);
    });

    it('#S12 edits to a record are saved, a missing groupId stays missing, and any person id works as a key', async () => {
      const store = await h.open();
      const noGroup = expense('me', { me: 100, constructor: 100 });
      noGroup.splitMeta = { splitType: 'exact', exact: { me: 100, constructor: 100 } };
      await store.update((db) => db.expenses.push(noGroup));
      await store.update((db) => {
        db.expenses[0]!.description = 'Edited';
      });
      const saved = (await h.open()).snapshot().expenses[0]!;
      expect(saved.description).toBe('Edited');
      expect(saved).not.toHaveProperty('groupId');
      expect(saved.splitMeta).toEqual({ splitType: 'exact', exact: { me: 100, constructor: 100 } });
    });
  });

  describe('filtered reads', { timeout: MONGO_TEST_TIMEOUT_MS }, () => {
    const OCT = { ...expense('me', { me: 1 }, { date: '2026-10-31' }), groupId: 'g1' };
    const NOV1 = expense('me', { me: 2 }, { date: '2026-11-01' });
    const NOV30 = { ...expense('me', { me: 3 }, { date: '2026-11-30' }), groupId: 'g1' };
    const DEC = expense('me', { me: 4 }, { date: '2026-12-01' });

    const seeded = async () => {
      const store = await h.open();
      await store.update((db) => {
        db.expenses.push(OCT, NOV1, NOV30, DEC);
      });
      return store;
    };

    it('#S13 expenses by date range: bounds are inclusive, in stored order', async () => {
      const store = await seeded();
      expect(await store.findExpenses({ from: '2026-11-01', to: '2026-11-30' })).toEqual([NOV1, NOV30]);
      expect(await store.findExpenses({ from: '2026-11-30' })).toEqual([NOV30, DEC]);
      expect(await store.findExpenses({ to: '2026-11-01' })).toEqual([OCT, NOV1]);
      expect(await store.findExpenses({ from: '2027-01-01' })).toEqual([]);
    });

    it('#S14 expenses by groupId, alone and with dates; no filter returns all', async () => {
      const store = await seeded();
      expect(await store.findExpenses({ groupId: 'g1' })).toEqual([OCT, NOV30]);
      expect(await store.findExpenses({ groupId: 'g1', from: '2026-11-01' })).toEqual([NOV30]);
      expect(await store.findExpenses({ groupId: 'other' })).toEqual([]);
      expect(await store.findExpenses({})).toEqual([OCT, NOV1, NOV30, DEC]);
    });

    it('#S15 settlements by groupId keep their recorded order', async () => {
      const store = await h.open();
      const [a, b, c] = [{ ...settlement('me', 'arun', 1), groupId: 'g1' }, settlement('me', 'arun', 2), { ...settlement('me', 'arun', 3), groupId: 'g1' }];
      await store.update((db) => db.settlements.push(a, b, c));
      expect(await store.findSettlements({ groupId: 'g1' })).toEqual([a, c]);
      expect(await store.findSettlements({})).toEqual([a, b, c]);
    });

    it('#S16 a filtered read sees a write as soon as it completes, and returns copies', async () => {
      const store = await seeded();
      await store.update((db) => {
        db.expenses.splice(0, 1);
      });
      const found = await store.findExpenses({ to: '2026-11-01' });
      expect(found).toEqual([NOV1]);
      found[0]!.description = 'Changed by the caller';
      expect(store.snapshot().expenses[0]!.description).toBe(NOV1.description);
    });
  });

  it('#S17 refresh() with no other writer changes nothing', { timeout: MONGO_TEST_TIMEOUT_MS }, async () => {
    const store = await h.open();
    await store.update((db) => db.people.push({ id: 'arun', name: 'Arun' }));
    const before = store.snapshot();
    await store.refresh();
    expect(store.snapshot()).toEqual(before);
  });
});

/** Stored Mongo data without the `meta` document, which opening adds. */
function stored(raw: unknown): unknown {
  const { meta: _meta, ...rest } = raw as Record<string, unknown>;
  return rest;
}
