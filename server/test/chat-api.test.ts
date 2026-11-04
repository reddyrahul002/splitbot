import { readFile } from 'node:fs/promises';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChatMessage, ChatResponse, Draft } from '@splitbot/shared';
import { runAgent } from '../src/agent/loop';
import { createApp } from '../src/app';
import { agentFixture, DINNER_ARGS, DINNER_TEXT, scriptedGemini, TODAY, type Step } from './fakes';
import { tempDir } from './helpers';

let dir: string;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  ({ dir, cleanup } = await tempDir());
});
afterEach(() => cleanup());

const user = (text: string): ChatMessage => ({ role: 'user', text });

/** The app with the real loop over a scripted Gemini (or no agent at all). */
async function setup(steps: Step[] | null) {
  const fx = await agentFixture(dir);
  const logs: string[] = [];
  const client = steps && scriptedGemini(steps);
  const agent = client ? (messages: ChatMessage[]) => runAgent(messages, { client, store: fx.store, drafts: fx.drafts, today: () => TODAY }) : undefined;
  const app = createApp({ store: fx.store, drafts: fx.drafts, today: () => TODAY, log: (m) => logs.push(m), agent });
  return { ...fx, app, logs, client };
}

const chat = (app: Awaited<ReturnType<typeof setup>>['app'], messages: unknown) => request(app).post('/api/chat').send({ messages });

describe('POST /api/chat', () => {
  // 37
  it('returns the reply and drafts, and the draft can be confirmed', async () => {
    const { app } = await setup([{ calls: [{ name: 'create_expense_draft', args: DINNER_ARGS }] }, { text: 'Draft ready.' }]);
    const res = await chat(app, [user(DINNER_TEXT)]);
    expect(res.status).toBe(200);
    const body = res.body as ChatResponse;
    expect(body.reply).toBe('Draft ready.');
    expect(body.drafts).toHaveLength(1);

    const confirmed = await request(app).post(`/api/drafts/${body.drafts[0]!.id}/confirm`);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.expense.totalCents).toBe(9000);
  });

  // 38
  it('dinner end to end: chat → confirm → balances', async () => {
    const { app } = await setup([{ calls: [{ name: 'create_expense_draft', args: DINNER_ARGS }] }, { text: 'Draft ready.' }]);
    const draft = ((await chat(app, [user(DINNER_TEXT)])).body as ChatResponse).drafts[0] as Draft;
    await request(app).post(`/api/drafts/${draft.id}/confirm`).expect(200);
    const balances = await request(app).get('/api/balances');
    expect(balances.body.balances).toEqual([
      { personId: 'me', netCents: 6400 },
      { personId: 'arun', netCents: -3800 },
      { personId: 'mei', netCents: -2600 },
    ]);
  });

  // 39
  it('rejects bad bodies with VALIDATION_ERROR', async () => {
    const { app, client } = await setup([]);
    const fifty = Array.from({ length: 51 }, (_, i) => user(`message ${i}`));
    const bad: unknown[] = [
      [],
      [user('hi'), { role: 'model', text: 'hello' }],
      [{ role: 'system', text: 'hi' }],
      [user('   ')],
      [user('x'.repeat(4001))],
      fifty,
      'hello',
    ];
    for (const messages of bad) {
      const res = await chat(app, messages);
      expect(res.status, JSON.stringify(messages).slice(0, 60)).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    const extra = await request(app).post('/api/chat').send({ messages: [user('hi')], debug: true });
    expect(extra.status).toBe(400);
    expect(client!.requests).toHaveLength(0);
  });

  // 40
  it('answers 503 GEMINI_NOT_CONFIGURED without an agent; other routes still work', async () => {
    const { app } = await setup(null);
    const res = await chat(app, [user(DINNER_TEXT)]);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('GEMINI_NOT_CONFIGURED');
    expect(res.body.error.message).toMatch(/GEMINI_API_KEY/);
    // Step 5: the manual form may never be built, so the message doesn't promise it.
    expect(res.body.error.message).not.toMatch(/form/);
    expect((await request(app).get('/api/people')).status).toBe(200);
  });

  // 41
  it('an unexpected agent error is a generic 500, logged without the request', async () => {
    const { app, logs } = await setup([new Error('boom inside the client')]);
    const res = await chat(app, [user('secret-ish user text')]);
    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({ code: 'INTERNAL', message: 'Something went wrong on the server. Please try again.' });
    expect(logs.join('\n')).toContain('boom inside the client');
    expect(logs.join('\n')).not.toContain('secret-ish user text');
  });

  // 43
  it('writes nothing to db.json until confirm', async () => {
    const { app, store, writes } = await setup([{ calls: [{ name: 'create_expense_draft', args: DINNER_ARGS }] }, { text: 'Draft ready.' }]);
    const before = await readFile(store.path, 'utf8');
    const res = await chat(app, [user(DINNER_TEXT)]);
    expect(res.status).toBe(200);
    expect(writes()).toBe(0);
    expect(await readFile(store.path, 'utf8')).toBe(before);
    expect(store.snapshot().expenses).toEqual([]);
  });
});
