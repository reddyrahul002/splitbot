import { readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Draft, Expense, ExpenseDraftInput } from '@splitbot/shared';
import { createApp } from '../src/app';
import { createDraftStore } from '../src/drafts';
import { openStore } from '../src/store';
import { tempDir } from './helpers';

const MINUTE = 60_000;
const DINNER: { kind: 'expense' } & ExpenseDraftInput = {
  kind: 'expense',
  description: 'Dinner',
  category: 'Food & Drink',
  totalCents: 9000,
  paidBy: 'me',
  participants: ['me', 'Arun', 'Mei'],
  splitType: 'equal',
  adjustments: [{ person: 'Arun', cents: 1200, note: 'drinks' }],
};

let dir: string;
let cleanup: () => Promise<void>;
let dbPath: string;

beforeEach(async () => {
  ({ dir, cleanup } = await tempDir());
  dbPath = join(dir, 'db.json');
});
afterEach(() => cleanup());

/** An app over a temp-dir store with Arun and Mei, a fake clock, and an optional failing rename. */
async function setup() {
  let now = Date.parse('2026-11-03T12:00:00.000Z');
  let failWrites = false;
  let writes = 0;
  const store = await openStore(dbPath, {
    fs: {
      rename: async (from, to) => {
        if (failWrites) throw new Error('disk full at /secret/path');
        writes++;
        await rename(from, to);
      },
    },
  });
  await store.update((db) => {
    db.people.push({ id: 'arun', name: 'Arun' }, { id: 'mei', name: 'Mei' });
  });
  const drafts = createDraftStore({ now: () => now });
  const app = createApp({ store, drafts, today: () => '2026-11-03', now: () => now, log: () => {} });
  return {
    app,
    store,
    advance: (ms: number) => {
      now += ms;
    },
    setFailWrites: (fail: boolean) => {
      failWrites = fail;
    },
    /** How many times db.json has been written (successful renames). */
    writes: () => writes,
  };
}

type App = Awaited<ReturnType<typeof setup>>['app'];

async function createDraft(app: App, body: object = DINNER): Promise<Draft> {
  const res = await request(app).post('/api/drafts').send(body);
  expect(res.status).toBe(201);
  return res.body as Draft;
}

async function confirm(app: App, id: string, edits?: object) {
  const req = request(app).post(`/api/drafts/${id}/confirm`);
  return edits ? req.send(edits) : req;
}

const sharesOf = (e: Expense) => Object.fromEntries(e.shares.map((s) => [s.personId, s.cents]));

describe('people and drafts', () => {
  it('#32 GET /api/people → [me] on a fresh store', async () => {
    const store = await openStore(dbPath);
    const app = createApp({ store, drafts: createDraftStore(), today: () => '2026-11-03', log: () => {} });
    const res = await request(app).get('/api/people');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'me', name: 'Me' }]);
  });

  it('#33 POST /api/drafts → 201 Draft and nothing saved', async () => {
    const { app } = await setup();
    const before = await readFile(dbPath, 'utf8');
    const draft = await createDraft(app);
    expect(draft.kind).toBe('expense');
    if (draft.kind !== 'expense') return;
    expect(sharesOf(draft.expense)).toEqual({ me: 2600, arun: 3800, mei: 2600 });
    expect((await request(app).get('/api/expenses')).body).toEqual([]);
    expect(await readFile(dbPath, 'utf8')).toBe(before);
  });

  it('#34 bad bodies and malformed JSON → 400 VALIDATION_ERROR', async () => {
    const { app } = await setup();
    const { totalCents: _, ...noTotal } = DINNER;
    for (const body of [noTotal, { ...DINNER, totalCents: 90.5 }, { ...DINNER, category: 'Food' }, { ...DINNER, kind: 'loan' }]) {
      const res = await request(app).post('/api/drafts').send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toEqual(expect.any(String));
    }
    const bad = await request(app).post('/api/drafts').set('Content-Type', 'application/json').send('{ bad');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('#35 a split error → 400 with its code and a dollar message', async () => {
    const { app } = await setup();
    const res = await request(app)
      .post('/api/drafts')
      .send({ ...DINNER, adjustments: undefined, splitType: 'exact', exact: { me: 3000, Arun: 3000, Mei: 2700 } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('EXACT_SUM_MISMATCH');
    expect(res.body.error.message).toContain('$87.00');
  });

  it('#36 confirm saves the expense and new people; a second confirm → 404', async () => {
    const { app } = await setup();
    const draft = await createDraft(app, { ...DINNER, adjustments: undefined, participants: ['me', 'Kai'] });
    expect(draft.newPeople).toEqual([{ id: 'new:kai', name: 'Kai' }]);
    const res = await confirm(app, draft.id);
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('expense');
    expect(res.body.createdPeople).toHaveLength(1);
    const kai = res.body.createdPeople[0];
    expect(kai.name).toBe('Kai');
    expect(kai.id).not.toMatch(/^new:/);

    const expenses = (await request(app).get('/api/expenses')).body as Expense[];
    expect(expenses).toEqual([res.body.expense]);
    expect(sharesOf(expenses[0]!)).toEqual({ me: 4500, [kai.id]: 4500 });
    expect((await request(app).get('/api/people')).body).toContainEqual(kai);

    const again = await confirm(app, draft.id);
    expect(again.status).toBe(404);
    expect(again.body.error.code).toBe('DRAFT_NOT_FOUND');
  });

  it('#37 confirm with edits saves the recomputed shares', async () => {
    const { app } = await setup();
    const draft = await createDraft(app);
    const res = await confirm(app, draft.id, { totalCents: 9300, description: 'Team dinner' });
    expect(res.status).toBe(200);
    expect(res.body.expense.description).toBe('Team dinner');
    expect(sharesOf(res.body.expense)).toEqual({ me: 2700, arun: 3900, mei: 2700 });
  });

  it('#38 confirm with invalid edits → 400, and the draft can still be confirmed', async () => {
    const { app } = await setup();
    const draft = await createDraft(app);
    const bad = await confirm(app, draft.id, { paidBy: 'zed' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('UNKNOWN_PERSON');
    expect((await confirm(app, draft.id)).status).toBe(200);
  });

  it('#39 unknown or expired draft → 404', async () => {
    const { app, advance } = await setup();
    expect((await confirm(app, 'nope')).status).toBe(404);
    const draft = await createDraft(app);
    advance(30 * MINUTE);
    const res = await confirm(app, draft.id);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('DRAFT_NOT_FOUND');
  });

  it('#40 DELETE /api/drafts/:id → 204, then confirm → 404; unknown → 404', async () => {
    const { app } = await setup();
    const draft = await createDraft(app);
    expect((await request(app).delete(`/api/drafts/${draft.id}`)).status).toBe(204);
    expect((await confirm(app, draft.id)).status).toBe(404);
    const unknown = await request(app).delete('/api/drafts/nope');
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('DRAFT_NOT_FOUND');
  });

  it('#41 two concurrent confirms → one 200, one 404, one expense stored', async () => {
    const { app } = await setup();
    const draft = await createDraft(app);
    const results = await Promise.all([confirm(app, draft.id), confirm(app, draft.id)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 404]);
    expect((await request(app).get('/api/expenses')).body).toHaveLength(1);
  });
});

describe('balances, settle-up and summary', () => {
  it('#42 a confirmed settlement shows up in balances', async () => {
    const { app } = await setup();
    const draft = await createDraft(app, { kind: 'settlement', from: 'Arun', to: 'me', cents: 2000 });
    const res = await confirm(app, draft.id);
    expect(res.status).toBe(200);
    expect(res.body.settlement).toMatchObject({ from: 'arun', to: 'me', cents: 2000, date: '2026-11-03' });
    const { balances } = (await request(app).get('/api/balances')).body;
    expect(balances).toEqual([
      { personId: 'me', netCents: -2000 },
      { personId: 'arun', netCents: 2000 },
      { personId: 'mei', netCents: 0 },
    ]);
  });

  it('#116 GET /api/account: zeros at first, then the dinner, and it writes nothing', async () => {
    const { app } = await setup();
    const empty = await request(app).get('/api/account');
    expect(empty.status).toBe(200);
    expect(empty.body).toMatchObject({ owedCents: 0, owedCount: 0, oweCents: 0, oweCount: 0, netCents: 0 });

    await confirm(app, (await createDraft(app)).id);
    const before = await readFile(dbPath, 'utf8');
    const res = await request(app).get('/api/account');
    expect(res.body).toEqual({
      owedCents: 6400,
      owedCount: 2,
      oweCents: 0,
      oweCount: 0,
      netCents: 6400,
      people: [
        { personId: 'arun', netCents: 3800 },
        { personId: 'mei', netCents: 2600 },
      ],
    });
    expect(await readFile(dbPath, 'utf8')).toBe(before);
  });

  it('#43 dinner → balances and pairwise debts', async () => {
    const { app } = await setup();
    await confirm(app, (await createDraft(app)).id);
    const res = await request(app).get('/api/balances');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      balances: [
        { personId: 'me', netCents: 6400 },
        { personId: 'arun', netCents: -3800 },
        { personId: 'mei', netCents: -2600 },
      ],
      debts: [
        { from: 'arun', to: 'me', cents: 3800 },
        { from: 'mei', to: 'me', cents: 2600 },
      ],
    });
  });

  it('#44 GET /api/settlements/suggest → the two transfers', async () => {
    const { app } = await setup();
    await confirm(app, (await createDraft(app)).id);
    const res = await request(app).get('/api/settlements/suggest');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { from: 'arun', to: 'me', cents: 3800 },
      { from: 'mei', to: 'me', cents: 2600 },
    ]);
  });

  it('#45 GET /api/summary with and without a range; bad dates → 400 INVALID_DATE', async () => {
    const { app } = await setup();
    await confirm(app, (await createDraft(app)).id);
    const all = await request(app).get('/api/summary');
    expect(all.status).toBe(200);
    expect(all.body.byCategory).toEqual([{ category: 'Food & Drink', myCents: 2600, totalCents: 9000 }]);
    const inRange = await request(app).get('/api/summary?from=2026-11-01&to=2026-11-30');
    expect(inRange.body.totalCents).toBe(9000);
    const outside = await request(app).get('/api/summary?from=2026-12-01');
    expect(outside.body).toMatchObject({ myCents: 0, totalCents: 0, byCategory: [], byMonth: [] });
    for (const q of ['from=bad', 'to=2026-02-30', 'from=2026-11-30&to=2026-11-01']) {
      const res = await request(app).get(`/api/summary?${q}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_DATE');
    }
  });
});

describe('expenses', () => {
  it('#46 GET /api/expenses is newest first (date, then createdAt)', async () => {
    const { app, advance } = await setup();
    const save = async (description: string, date: string) => {
      advance(MINUTE);
      const draft = await createDraft(app, { ...DINNER, description, date });
      expect((await confirm(app, draft.id)).status).toBe(200);
    };
    await save('B', '2026-11-03');
    await save('A', '2026-11-01');
    await save('C', '2026-11-03');
    const res = await request(app).get('/api/expenses');
    expect(res.body.map((e: Expense) => e.description)).toEqual(['C', 'B', 'A']);
  });

  it('#47 DELETE /api/expenses/:id → 204 and balances update; unknown → 404', async () => {
    const { app } = await setup();
    const saved = await confirm(app, (await createDraft(app)).id);
    const res = await request(app).delete(`/api/expenses/${saved.body.expense.id}`);
    expect(res.status).toBe(204);
    expect((await request(app).get('/api/expenses')).body).toEqual([]);
    expect((await request(app).get('/api/balances')).body.debts).toEqual([]);
    const unknown = await request(app).delete('/api/expenses/nope');
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('NOT_FOUND');
  });

  it('#48 restart: a new app on the same file still has the data', async () => {
    const { app } = await setup();
    await confirm(app, (await createDraft(app)).id);
    const store = await openStore(dbPath);
    const restarted = createApp({ store, drafts: createDraftStore(), today: () => '2026-11-03', log: () => {} });
    expect((await request(restarted).get('/api/expenses')).body).toHaveLength(1);
    expect((await request(restarted).get('/api/balances')).body.debts).toHaveLength(2);
  });

  it('#49 a write failure during confirm → 500 INTERNAL without details; a retry succeeds', async () => {
    const { app, setFailWrites } = await setup();
    const draft = await createDraft(app);
    setFailWrites(true);
    const res = await confirm(app, draft.id);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL');
    expect(JSON.stringify(res.body)).not.toMatch(/disk full|secret|stack|at /);
    setFailWrites(false);
    expect((await confirm(app, draft.id)).status).toBe(200);
  });

  it('#50 unknown /api route → 404 JSON', async () => {
    const { app } = await setup();
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('PATCH /api/drafts/:id', () => {
  it('#51 a total edit → recomputed shares, nothing saved', async () => {
    const { app } = await setup();
    const draft = await createDraft(app);
    const before = await readFile(dbPath, 'utf8');
    const res = await request(app).patch(`/api/drafts/${draft.id}`).send({ totalCents: 9300 });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(draft.id);
    expect(sharesOf(res.body.expense)).toEqual({ me: 2700, arun: 3900, mei: 2700 });
    expect(await readFile(dbPath, 'utf8')).toBe(before);
    expect((await request(app).get('/api/expenses')).body).toEqual([]);
  });

  it('#52 "Use Arun" via PATCH, then confirm creates no Aroon', async () => {
    const { app } = await setup();
    const draft = await createDraft(app, { ...DINNER, adjustments: undefined, participants: ['me', 'Aroon', 'Mei'] });
    expect(draft.warnings.map((w) => w.code)).toEqual(['CLOSE_NAME']);
    const res = await request(app)
      .patch(`/api/drafts/${draft.id}`)
      .send({ replace: [{ from: 'new:aroon', to: 'arun' }] });
    expect(res.status).toBe(200);
    expect(res.body.newPeople).toEqual([]);
    expect(res.body.warnings).toEqual([]);
    const saved = await confirm(app, draft.id);
    expect(saved.body.createdPeople).toEqual([]);
    expect(sharesOf(saved.body.expense)).toEqual({ me: 3000, arun: 3000, mei: 3000 });
    expect((await request(app).get('/api/people')).body.map((p: { name: string }) => p.name)).not.toContain('Aroon');
  });

  it('#53 edits stack, and confirm with no body saves both', async () => {
    const { app } = await setup();
    const draft = await createDraft(app);
    await request(app).patch(`/api/drafts/${draft.id}`).send({ description: 'Team dinner' }).expect(200);
    await request(app).patch(`/api/drafts/${draft.id}`).send({ totalCents: 9300 }).expect(200);
    const saved = await confirm(app, draft.id);
    expect(saved.body.expense.description).toBe('Team dinner');
    expect(saved.body.expense.totalCents).toBe(9300);
  });

  it('#54 invalid edits → 400 and the draft is unchanged', async () => {
    const { app } = await setup();
    const draft = await createDraft(app, {
      ...DINNER,
      adjustments: undefined,
      participants: ['me', 'Arun'],
      splitType: 'exact',
      exact: { me: 5000, Arun: 4000 },
    });
    const cases: [object, string][] = [
      [{ totalCents: 9500 }, 'EXACT_SUM_MISMATCH'],
      [{ replace: [{ from: 'arun', to: 'zed' }] }, 'UNKNOWN_PERSON'],
      [{ totalCents: 'lots' }, 'VALIDATION_ERROR'],
    ];
    for (const [edits, code] of cases) {
      const res = await request(app).patch(`/api/drafts/${draft.id}`).send(edits);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(code);
    }
    const saved = await confirm(app, draft.id);
    expect(saved.status).toBe(200);
    if (draft.kind !== 'expense') throw new Error('expected an expense draft');
    expect(saved.body.expense).toMatchObject({ totalCents: 9000, shares: draft.expense.shares });
  });

  it('#55 PATCH of an unknown or expired draft → 404', async () => {
    const { app, advance } = await setup();
    expect((await request(app).patch('/api/drafts/nope').send({ description: 'x' })).status).toBe(404);
    const draft = await createDraft(app);
    advance(30 * MINUTE);
    const res = await request(app).patch(`/api/drafts/${draft.id}`).send({ description: 'x' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('DRAFT_NOT_FOUND');
  });

  it('#56 PATCH restarts the TTL', async () => {
    const { app, advance } = await setup();
    const draft = await createDraft(app);
    advance(29 * MINUTE);
    await request(app).patch(`/api/drafts/${draft.id}`).send({ description: 'Still here' }).expect(200);
    advance(29 * MINUTE);
    const saved = await confirm(app, draft.id);
    expect(saved.status).toBe(200);
    expect(saved.body.expense.description).toBe('Still here');
  });
});

describe('settlements', () => {
  async function saveSettlement(app: App, cents: number, date: string) {
    const draft = await createDraft(app, { kind: 'settlement', from: 'Arun', to: 'me', cents, date });
    const res = await confirm(app, draft.id);
    expect(res.status).toBe(200);
    return res.body.settlement as { id: string };
  }

  it('#58 GET /api/settlements is newest first', async () => {
    const { app } = await setup();
    await saveSettlement(app, 100, '2026-11-01');
    await saveSettlement(app, 200, '2026-11-03');
    await saveSettlement(app, 300, '2026-11-01');
    const res = await request(app).get('/api/settlements');
    expect(res.status).toBe(200);
    expect(res.body.map((s: { cents: number }) => s.cents)).toEqual([200, 300, 100]);
  });

  it('#59 DELETE /api/settlements/:id → 204 and balances update', async () => {
    const { app } = await setup();
    const s = await saveSettlement(app, 2000, '2026-11-03');
    expect((await request(app).delete(`/api/settlements/${s.id}`)).status).toBe(204);
    expect((await request(app).get('/api/settlements')).body).toEqual([]);
    const { balances } = (await request(app).get('/api/balances')).body;
    expect(balances.every((b: { netCents: number }) => b.netCents === 0)).toBe(true);
  });

  it('#60 DELETE /api/settlements/:id with an unknown id → 404', async () => {
    const { app } = await setup();
    const res = await request(app).delete('/api/settlements/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('#61 deleting an unknown expense or settlement doesn\'t write db.json', async () => {
    const { app, writes } = await setup();
    await confirm(app, (await createDraft(app)).id);
    const before = writes();
    expect((await request(app).delete('/api/expenses/nope')).status).toBe(404);
    expect((await request(app).delete('/api/settlements/nope')).status).toBe(404);
    expect(writes()).toBe(before);
  });
});
