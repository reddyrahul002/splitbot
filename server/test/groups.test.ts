import { readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Draft, Expense, GroupSummary, Person, Settlement } from '@splitbot/shared';
import { createApp } from '../src/app';
import { applyEdits, buildExpenseDraft, buildSettlementDraft, createDraftStore, finalizeDraft } from '../src/drafts';
import { openStore } from '../src/store';
import { tempDir } from './helpers';

const PEOPLE: Person[] = [
  { id: 'me', name: 'Me' },
  { id: 'arun', name: 'Arun' },
  { id: 'mei', name: 'Mei' },
];
const OPTS = { today: '2026-11-03' };
const DINNER = {
  kind: 'expense' as const,
  description: 'Dinner',
  category: 'Food & Drink' as const,
  totalCents: 9000,
  paidBy: 'me',
  participants: ['me', 'Arun', 'Mei'],
  splitType: 'equal' as const,
  adjustments: [{ person: 'Arun', cents: 1200, note: 'drinks' }],
};

function expenseOf(draft: Draft): Expense {
  if (draft.kind !== 'expense') throw new Error('expected an expense draft');
  return draft.expense;
}
function settlementOf(draft: Draft): Settlement {
  if (draft.kind !== 'settlement') throw new Error('expected a settlement draft');
  return draft.settlement;
}

describe('drafts carry an optional groupId', () => {
  it('#138 a draft has no groupId unless one is given', () => {
    expect(expenseOf(buildExpenseDraft(DINNER, PEOPLE, OPTS))).not.toHaveProperty('groupId');
    expect(settlementOf(buildSettlementDraft({ from: 'Arun', to: 'me', cents: 100 }, PEOPLE, OPTS))).not.toHaveProperty('groupId');
  });

  it('#139 builders keep a given groupId', () => {
    expect(expenseOf(buildExpenseDraft({ ...DINNER, groupId: 'g1' }, PEOPLE, OPTS)).groupId).toBe('g1');
    expect(settlementOf(buildSettlementDraft({ from: 'Arun', to: 'me', cents: 100, groupId: 'g1' }, PEOPLE, OPTS)).groupId).toBe('g1');
  });

  it('#140 an edit sets and clears it, on both kinds, leaving shares alone', () => {
    const expense = buildExpenseDraft(DINNER, PEOPLE, OPTS);
    const set = applyEdits(expense, { groupId: 'g1' }, PEOPLE);
    expect(expenseOf(set).groupId).toBe('g1');
    expect(expenseOf(set).shares).toEqual(expenseOf(expense).shares);
    expect(expenseOf(applyEdits(set, { groupId: null }, PEOPLE))).not.toHaveProperty('groupId');

    const payment = buildSettlementDraft({ from: 'Arun', to: 'me', cents: 100 }, PEOPLE, OPTS);
    const setPayment = applyEdits(payment, { groupId: 'g1' }, PEOPLE);
    expect(settlementOf(setPayment).groupId).toBe('g1');
    expect(settlementOf(applyEdits(setPayment, { groupId: null }, PEOPLE))).not.toHaveProperty('groupId');
  });

  it('#141 other edits and a confirm keep it', () => {
    const draft = buildExpenseDraft({ ...DINNER, participants: ['me', 'Kai'], adjustments: undefined, groupId: 'g1' }, PEOPLE, OPTS);
    const edited = applyEdits(draft, { totalCents: 5000 }, PEOPLE);
    expect(expenseOf(edited).groupId).toBe('g1');
    const confirmed = finalizeDraft(edited, PEOPLE, { now: '2026-11-03T00:00:00.000Z', newId: () => 'kai' });
    expect(confirmed.kind === 'expense' && confirmed.expense.groupId).toBe('g1');
  });
});

describe('group routes', () => {
  let dir: string;
  let cleanup: () => Promise<void>;
  let dbPath: string;

  beforeEach(async () => {
    ({ dir, cleanup } = await tempDir());
    dbPath = join(dir, 'db.json');
  });
  afterEach(() => cleanup());

  async function setup() {
    let writes = 0;
    let failWrites = false;
    const store = await openStore(dbPath, {
      fs: {
        rename: async (from, to) => {
          if (failWrites) throw new Error('disk full');
          writes++;
          await rename(from, to);
        },
      },
    });
    await store.update((db) => {
      db.people.push({ id: 'arun', name: 'Arun' }, { id: 'mei', name: 'Mei' });
    });
    const app = createApp({ store, drafts: createDraftStore(), today: () => '2026-11-03', log: () => {} });
    return {
      app,
      store,
      writes: () => writes,
      setFailWrites: (fail: boolean) => {
        failWrites = fail;
      },
    };
  }
  type App = Awaited<ReturnType<typeof setup>>['app'];

  const createGroup = async (app: App, name = 'Trip') => {
    const res = await request(app).post('/api/groups').send({ name });
    expect(res.status).toBe(201);
    return res.body as { id: string; name: string; memberIds: string[] };
  };
  const addMember = (app: App, groupId: string, personId: string) => request(app).post(`/api/groups/${groupId}/members`).send({ personId });
  const newDraft = async (app: App, body: object) => {
    const res = await request(app).post('/api/drafts').send(body);
    expect(res.status).toBe(201);
    return res.body as Draft;
  };
  const confirm = (app: App, id: string) => request(app).post(`/api/drafts/${id}/confirm`);
  const summaries = async (app: App) => (await request(app).get('/api/groups')).body as GroupSummary[];

  it('#142 no groups yet: an empty list, and reading writes nothing', async () => {
    const { app, writes } = await setup();
    const before = writes();
    const res = await request(app).get('/api/groups');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(writes()).toBe(before);
  });

  it('#143 creating a group trims the name, starts with me as a member, and survives a restart', async () => {
    const { app } = await setup();
    const group = await createGroup(app, '  Trip  ');
    expect(group).toMatchObject({ name: 'Trip', memberIds: ['me'] });
    const saved = JSON.parse(await readFile(dbPath, 'utf8'));
    expect(saved.groups).toEqual([group]);
    const reopened = await openStore(dbPath);
    expect(reopened.snapshot().groups).toEqual([group]);
  });

  it('#156 inner spaces in a group name collapse, so they can’t make a duplicate', async () => {
    const { app, writes } = await setup();
    const group = await createGroup(app, 'Bali   Trip');
    expect(group.name).toBe('Bali Trip');
    const before = writes();
    const duplicate = await request(app).post('/api/groups').send({ name: 'bali  trip' });
    expect(duplicate.status).toBe(400);
    expect(duplicate.body.error.code).toBe('GROUP_EXISTS');
    expect(writes()).toBe(before);
  });

  it('#157 "Use Arun" on a group draft: Arun joins, and the typed name is never created', async () => {
    const { app, store } = await setup();
    const { id } = await createGroup(app);
    const draft = await newDraft(app, { ...DINNER, participants: ['me', 'Aroon'], adjustments: undefined, groupId: id });
    const swapped = await request(app).patch(`/api/drafts/${draft.id}`).send({ replace: [{ from: 'new:aroon', to: 'arun' }] });
    expect(swapped.status).toBe(200);

    expect((await confirm(app, draft.id)).status).toBe(200);
    expect(store.snapshot().groups![0]!.memberIds).toEqual(['me', 'arun']);
    expect(store.snapshot().people.some((p) => p.name === 'Aroon')).toBe(false);
  });

  it('#158 a failed write on a group confirm changes nothing, and the same draft can be retried', async () => {
    const { app, store, setFailWrites } = await setup();
    const { id } = await createGroup(app);
    const draft = await newDraft(app, { ...DINNER, participants: ['me', 'Kai'], adjustments: undefined, groupId: id });

    setFailWrites(true);
    const failed = await confirm(app, draft.id);
    expect(failed.status).toBe(500);
    expect(store.snapshot().groups![0]!.memberIds).toEqual(['me']);
    expect(store.snapshot().expenses).toEqual([]);
    expect(store.snapshot().people.some((p) => p.name === 'Kai')).toBe(false);

    setFailWrites(false);
    expect((await confirm(app, draft.id)).status).toBe(200);
    const kai = store.snapshot().people.find((p) => p.name === 'Kai')!;
    expect(store.snapshot().groups![0]!.memberIds).toEqual(['me', kai.id]);
    expect(store.snapshot().expenses).toHaveLength(1);
  });

  it('#144 a bad or duplicate group name is rejected without a write', async () => {
    const { app, writes } = await setup();
    await createGroup(app, 'Trip');
    const before = writes();
    for (const name of ['', '   ']) {
      const res = await request(app).post('/api/groups').send({ name });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    const duplicate = await request(app).post('/api/groups').send({ name: ' tRIP ' });
    expect(duplicate.status).toBe(400);
    expect(duplicate.body.error.code).toBe('GROUP_EXISTS');
    expect(duplicate.body.error.message).toContain('Trip');
    expect(writes()).toBe(before);
  });

  it('#145 adding members: an existing person joins once, and a repeat writes nothing', async () => {
    const { app, writes } = await setup();
    const { id } = await createGroup(app);
    const added = await addMember(app, id, 'arun');
    expect(added.status).toBe(200);
    expect(added.body.memberIds).toEqual(['me', 'arun']);

    const before = writes();
    const again = await addMember(app, id, 'arun');
    expect(again.status).toBe(200);
    expect(again.body.memberIds).toEqual(['me', 'arun']);
    expect(writes()).toBe(before);
  });

  it('#146 an unknown person or group is rejected without a write', async () => {
    const { app, writes } = await setup();
    const { id } = await createGroup(app);
    const before = writes();
    const person = await addMember(app, id, 'nobody');
    expect(person.status).toBe(400);
    expect(person.body.error.code).toBe('UNKNOWN_PERSON');
    const group = await addMember(app, 'nope', 'arun');
    expect(group.status).toBe(404);
    expect(group.body.error.code).toBe('NOT_FOUND');
    expect(writes()).toBe(before);
  });

  it('#147 a draft with an unknown group is refused at every step, and a kept draft can still be confirmed', async () => {
    const { app, store } = await setup();
    const created = await request(app).post('/api/drafts').send({ ...DINNER, groupId: 'nope' });
    expect(created.status).toBe(400);
    expect(created.body.error.code).toBe('UNKNOWN_GROUP');

    const draft = await newDraft(app, DINNER);
    const patched = await request(app).patch(`/api/drafts/${draft.id}`).send({ groupId: 'nope' });
    expect(patched.status).toBe(400);
    expect(patched.body.error.code).toBe('UNKNOWN_GROUP');

    const confirmed = await request(app).post(`/api/drafts/${draft.id}/confirm`).send({ groupId: 'nope' });
    expect(confirmed.status).toBe(400);
    expect(confirmed.body.error.code).toBe('UNKNOWN_GROUP');
    expect(store.snapshot().expenses).toEqual([]);

    expect((await confirm(app, draft.id)).status).toBe(200);
    expect(store.snapshot().expenses).toHaveLength(1);
  });

  it('#148 PATCH sets the group and clears it with null', async () => {
    const { app } = await setup();
    const { id } = await createGroup(app);
    const draft = await newDraft(app, DINNER);
    const set = await request(app).patch(`/api/drafts/${draft.id}`).send({ groupId: id });
    expect(set.status).toBe(200);
    expect(expenseOf(set.body).groupId).toBe(id);
    const cleared = await request(app).patch(`/api/drafts/${draft.id}`).send({ groupId: null });
    expect(expenseOf(cleared.body)).not.toHaveProperty('groupId');
  });

  it('#149 a draft saves nothing and adds no one until Confirm, which adds missing people, including new ones', async () => {
    const { app, store } = await setup();
    const { id } = await createGroup(app);
    const draft = await newDraft(app, { ...DINNER, participants: ['me', 'Arun', 'Kai'], groupId: id });
    expect(store.snapshot().groups![0]!.memberIds).toEqual(['me']);
    expect(store.snapshot().people.some((p) => p.name === 'Kai')).toBe(false);

    const res = await confirm(app, draft.id);
    expect(res.status).toBe(200);
    expect(res.body.expense.groupId).toBe(id);
    const kai = store.snapshot().people.find((p) => p.name === 'Kai')!;
    expect(store.snapshot().groups![0]!.memberIds).toEqual(['me', 'arun', kai.id]);
  });

  it('#150 a payer who has no share still joins, and so do both sides of a payment', async () => {
    const { app, store } = await setup();
    const { id } = await createGroup(app);
    const gift = await newDraft(app, { ...DINNER, paidBy: 'Mei', participants: ['me'], adjustments: undefined, groupId: id });
    await confirm(app, gift.id);
    expect(store.snapshot().groups![0]!.memberIds).toEqual(['me', 'mei']);

    const payment = await newDraft(app, { kind: 'settlement', from: 'Arun', to: 'Mei', cents: 100, groupId: id });
    await confirm(app, payment.id);
    expect(store.snapshot().settlements[0]!.groupId).toBe(id);
    expect(store.snapshot().groups![0]!.memberIds).toEqual(['me', 'mei', 'arun']);
  });

  it('#151 records with no group behave as before: no groups field appears', async () => {
    const { app, store } = await setup();
    const draft = await newDraft(app, DINNER);
    const res = await confirm(app, draft.id);
    expect(res.body.expense).not.toHaveProperty('groupId');
    expect(store.snapshot().groups).toBeUndefined();
    expect((await summaries(app))).toEqual([]);
  });

  it('#152 a group’s settle-up works end to end, and moves the overall balance by the same amount', async () => {
    const { app } = await setup();
    const trip = await createGroup(app, 'Trip');
    const home = await createGroup(app, 'Home');
    await confirm(app, (await newDraft(app, { ...DINNER, groupId: trip.id })).id);
    await confirm(app, (await newDraft(app, { ...DINNER, totalCents: 3000, adjustments: undefined, participants: ['me', 'Mei'], groupId: home.id })).id);

    const before = await summaries(app);
    const tripBefore = before.find((s) => s.group.id === trip.id)!;
    const homeBefore = before.find((s) => s.group.id === home.id)!;
    expect(tripBefore.plan.transfers).toEqual([
      { from: 'arun', to: 'me', cents: 3800 },
      { from: 'mei', to: 'me', cents: 2600 },
    ]);
    expect(homeBefore.plan.transfers).toEqual([{ from: 'mei', to: 'me', cents: 1500 }]);
    expect((await request(app).get('/api/account')).body.owedCents).toBe(7900);

    await confirm(app, (await newDraft(app, { kind: 'settlement', from: 'Arun', to: 'Me', cents: 3800, groupId: trip.id })).id);
    await confirm(app, (await newDraft(app, { kind: 'settlement', from: 'Mei', to: 'Me', cents: 2600, groupId: trip.id })).id);

    const after = await summaries(app);
    expect(after.find((s) => s.group.id === trip.id)!.plan.transfers).toEqual([]);
    expect(after.find((s) => s.group.id === home.id)!.plan.transfers).toEqual([{ from: 'mei', to: 'me', cents: 1500 }]);
    expect((await request(app).get('/api/account')).body.owedCents).toBe(1500);
  });

  it('#153 deleting a group’s expense updates its summary and keeps its members', async () => {
    const { app } = await setup();
    const { id } = await createGroup(app);
    const saved = await confirm(app, (await newDraft(app, { ...DINNER, groupId: id })).id);
    expect((await request(app).delete(`/api/expenses/${saved.body.expense.id}`)).status).toBe(204);
    const [summary] = await summaries(app);
    expect(summary!.plan.transfers).toEqual([]);
    expect(summary!.group.memberIds).toEqual(['me', 'arun', 'mei']);
  });
});
