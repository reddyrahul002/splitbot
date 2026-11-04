// The REST flows that depend on the store, against both stores.
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Store } from '../src/store';
import { createApp } from '../src/app';
import { createDraftStore } from '../src/drafts';
import { expense } from './helpers';
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

const DINNER = {
  kind: 'expense',
  description: 'Dinner',
  category: 'Food & Drink',
  date: '2026-11-03',
  totalCents: 9000,
  paidBy: 'me',
  participants: ['me', 'Arun', 'Mei'],
  splitType: 'equal',
  adjustments: [{ person: 'Arun', cents: 1200, note: 'drinks' }],
};

const appFor = (store: Store) => createApp({ store, drafts: createDraftStore(), today: () => '2026-11-03', log: () => undefined });

describe.each(STORES)('%s store through the API', { timeout: MONGO_TEST_TIMEOUT_MS }, (_name, makeHarness) => {
  let h: StoreHarness;
  beforeEach(async () => {
    h = await makeHarness();
  });
  afterEach(() => h.cleanup());

  it('#A1 draft → confirm → balances → reopen → delete', async () => {
    const store = await h.open();
    const app = appFor(store);
    const draft = await request(app).post('/api/drafts').send(DINNER);
    expect(draft.status).toBe(201);
    expect(store.snapshot().expenses).toEqual([]);

    const confirmed = await request(app).post(`/api/drafts/${draft.body.id}/confirm`).send({});
    expect(confirmed.status).toBe(200);
    const nets = (body: { balances: { netCents: number }[] }) => body.balances.map((b) => b.netCents);
    expect(nets((await request(app).get('/api/balances')).body)).toEqual([6400, -3800, -2600]);

    // A new app over a reopened store, as after a restart.
    const reopened = appFor(await h.open());
    expect(nets((await request(reopened).get('/api/balances')).body)).toEqual([6400, -3800, -2600]);

    const expenses = await request(reopened).get('/api/expenses');
    expect(expenses.body[0].shares.map((s: { cents: number }) => s.cents)).toEqual([2600, 3800, 2600]);
    expect((await request(reopened).delete(`/api/expenses/${expenses.body[0].id}`)).status).toBe(204);
    expect(nets((await request(reopened).get('/api/balances')).body)).toEqual([0, 0, 0]);
  });

  it('#A2 confirm is all-or-nothing: a failed write saves no person, expense or group change, and the draft can be confirmed again', async () => {
    const store = await h.open();
    const app = appFor(store);
    const group = await request(app).post('/api/groups').send({ name: 'Trip' });
    const draft = await request(app)
      .post('/api/drafts')
      .send({ ...DINNER, participants: ['me', 'Kai'], adjustments: undefined, groupId: group.body.id });
    const before = store.snapshot();

    h.failNextWrite();
    const failed = await request(app).post(`/api/drafts/${draft.body.id}/confirm`).send({});
    expect(failed.status).toBe(500);
    expect(failed.body.error).toEqual({ code: 'INTERNAL', message: 'Something went wrong on the server. Please try again.' });
    expect(store.snapshot()).toEqual(before);
    expect((await h.open()).snapshot()).toEqual(before);

    const retried = await request(app).post(`/api/drafts/${draft.body.id}/confirm`).send({});
    expect(retried.status).toBe(200);
    const saved = (await h.open()).snapshot();
    expect(saved.expenses).toHaveLength(1);
    const kai = saved.people.filter((p) => p.name === 'Kai');
    expect(kai).toHaveLength(1);
    expect(saved.groups![0]!.memberIds).toEqual(['me', kai[0]!.id]);
  });

  it('#A3 GET /api/summary filters by date range and still rejects bad dates', async () => {
    const app = appFor(await h.open());
    for (const date of ['2026-10-15', '2026-11-03']) {
      const draft = await request(app).post('/api/drafts').send({ ...DINNER, date });
      await request(app).post(`/api/drafts/${draft.body.id}/confirm`).send({});
    }
    expect((await request(app).get('/api/summary')).body.totalCents).toBe(18000);
    const november = await request(app).get('/api/summary?from=2026-11-01&to=2026-11-30');
    expect(november.body).toMatchObject({ totalCents: 9000, myCents: 2600 });
    expect(november.body.byMonth).toEqual([{ month: '2026-11', myCents: 2600, totalCents: 9000 }]);
    for (const q of ['from=bad', 'to=2026-02-30', 'from=2026-11-30&to=2026-11-01']) {
      const res = await request(app).get(`/api/summary?${q}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_DATE');
    }
  });

  it('#A5 known limit: with a range, a malformed date the range filter drops gives no error, even in its real month', async () => {
    const store = await h.open();
    await store.update((db) => db.expenses.push(expense('me', { me: 100 }, { date: '2026-1-05' })));
    const app = appFor(store);
    const summary = (query: string) => request(app).get(`/api/summary${query}`);

    expect((await summary('')).body.error.code).toBe('INVALID_DATE');
    expect((await summary('?from=2026-01-01&to=2026-11-30')).body.error.code).toBe('INVALID_DATE');

    // "2026-1-05" sorts after "2026-01-31" as text, so January's query misses it and reports nothing wrong.
    const january = await summary('?to=2026-01-31');
    expect(january.status).toBe(200);
    expect(january.body.totalCents).toBe(0);
    const december = await summary('?from=2026-12-01');
    expect(december.status).toBe(200);
    expect(december.body.totalCents).toBe(0);
  });

  it('#A4 every /api request checks for outside writes first', async () => {
    const store = await h.open();
    let checks = 0;
    const counting: Store = {
      ...store,
      refresh: async () => {
        checks++;
        await store.refresh();
      },
    };
    const app = appFor(counting);
    await request(app).get('/api/people');
    expect(checks).toBe(1);
    await request(app).get('/api/nope');
    expect(checks).toBe(2);
    await request(app).get('/not-api');
    expect(checks).toBe(2);
  });
});
