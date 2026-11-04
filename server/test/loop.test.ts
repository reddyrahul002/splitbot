import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChatMessage, Expense } from '@splitbot/shared';
import { GeminiUnavailableError } from '../src/agent/gemini';
import { CAP_REPLY, BUSY_REPLY, EMPTY_REPLY, runAgent } from '../src/agent/loop';
import { agentFixture, DINNER_ARGS, DINNER_EXPENSE, DINNER_TEXT, scriptedGemini, TODAY, type Step } from './fakes';
import { tempDir } from './helpers';

let dir: string;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  ({ dir, cleanup } = await tempDir());
});
afterEach(() => cleanup());

const user = (text: string): ChatMessage => ({ role: 'user', text });

async function run(steps: Step[], messages: ChatMessage[] = [user(DINNER_TEXT)], expenses: Expense[] = []) {
  const fx = await agentFixture(dir, expenses);
  const client = scriptedGemini(steps);
  const response = await runAgent(messages, { client, store: fx.store, drafts: fx.drafts, today: () => TODAY });
  return { ...fx, client, response };
}

/** The function responses the loop sent in request `i`'s last turn. */
const responsesIn = (client: ReturnType<typeof scriptedGemini>, i: number) =>
  (client.requests[i]!.contents.at(-1)!.parts ?? []).map((p) => p.functionResponse);

describe('agent loop', () => {
  // 21
  it('returns plain text as the reply with no drafts', async () => {
    const { response, client } = await run([{ text: 'Hi! Tell me about an expense.' }], [user('hello')]);
    expect(response).toEqual({ reply: 'Hi! Tell me about an expense.', drafts: [] });
    expect(client.requests).toHaveLength(1);
  });

  // 22
  it('runs a draft call, sends the result back, and returns the draft', async () => {
    const { response, client, drafts } = await run([
      { calls: [{ id: 'c1', name: 'create_expense_draft', args: DINNER_ARGS }] },
      { text: 'Here is the draft: you $26, Arun $38, Mei $26.' },
    ]);
    expect(response.reply).toBe('Here is the draft: you $26, Arun $38, Mei $26.');
    expect(response.drafts).toHaveLength(1);
    const draft = response.drafts[0]!;
    expect(draft.kind === 'expense' && draft.expense.shares.map((s) => s.cents)).toEqual([2600, 3800, 2600]);
    expect(drafts.get(draft.id)).toEqual(draft);

    expect(client.requests).toHaveLength(2);
    const second = client.requests[1]!.contents;
    expect(second).toHaveLength(3); // user, model call, function response
    expect(second[2]!.role).toBe('user');
    const [fr] = responsesIn(client, 1);
    expect(fr).toMatchObject({ id: 'c1', name: 'create_expense_draft', response: { draftId: draft.id, total: '$90.00' } });
  });

  // 23
  it('sends the model content back unchanged, thought signature included', async () => {
    const { client } = await run([
      { calls: [{ name: 'list_people' }], thoughtSignature: 'sig-abc', text: 'Let me check.' },
      { text: 'Done.' },
    ]);
    const modelTurn = client.requests[1]!.contents[1]!;
    expect(modelTurn).toEqual({
      role: 'model',
      parts: [{ text: 'Let me check.' }, { functionCall: { name: 'list_people', args: {} }, thoughtSignature: 'sig-abc' }],
    });
  });

  // 24
  it('runs parallel calls in order and answers them in one turn', async () => {
    const { client } = await run([
      { calls: [{ id: 'a', name: 'list_people' }, { id: 'b', name: 'get_balances' }] },
      { text: 'ok' },
    ]);
    expect(responsesIn(client, 1).map((r) => [r?.id, r?.name])).toEqual([
      ['a', 'list_people'],
      ['b', 'get_balances'],
    ]);
    expect(client.requests[1]!.contents).toHaveLength(3);
  });

  // 25
  it('answers a read question from the tool result without drafts', async () => {
    const { response, client } = await run(
      [{ calls: [{ name: 'get_balances', args: { person: 'Arun' } }] }, { text: 'Arun owes you $38.00.' }],
      [user('how much does Arun owe me?')],
      [DINNER_EXPENSE],
    );
    expect(response).toEqual({ reply: 'Arun owes you $38.00.', drafts: [] });
    expect(responsesIn(client, 1)[0]?.response).toMatchObject({ debts: [{ summary: 'Arun owes you $38.00' }] });
  });

  // 26
  it('sends a validation error back to the model, which can retry', async () => {
    const { response, client } = await run([
      { calls: [{ name: 'create_expense_draft', args: { ...DINNER_ARGS, category: 'Snacks' } }] },
      { calls: [{ name: 'create_expense_draft', args: DINNER_ARGS }] },
      { text: 'Fixed it.' },
    ]);
    expect(responsesIn(client, 1)[0]?.response).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect(response.drafts).toHaveLength(1);
    expect(response.reply).toBe('Fixed it.');
  });

  // 27
  it('sends a SplitError back to the model and keeps going', async () => {
    const tooMuch = { ...DINNER_ARGS, adjustments: [{ person: 'Arun', dollars: 120 }] };
    const { response, client } = await run([
      { calls: [{ name: 'create_expense_draft', args: tooMuch }] },
      { text: 'The extras are more than the total. What did Arun have?' },
    ]);
    expect(responsesIn(client, 1)[0]?.response).toMatchObject({ error: { code: 'ADJUSTMENTS_EXCEED_TOTAL' } });
    expect(response).toEqual({ reply: 'The extras are more than the total. What did Arun have?', drafts: [] });
  });

  // 28
  it('stops after 5 tool calls with the fallback reply', async () => {
    // Draft calls, so the number of stored drafts shows how many calls ran.
    const forever: Step[] = Array.from({ length: 10 }, () => ({ calls: [{ name: 'create_expense_draft', args: DINNER_ARGS }] }));
    const { response, client, drafts } = await run(forever);
    expect(drafts.size()).toBe(5);
    expect(client.requests).toHaveLength(6);
    expect(response.reply).toBe(CAP_REPLY);
    expect(response.drafts).toHaveLength(5);
  });

  // 29
  it('counts parallel calls toward the cap and keeps the drafts made before it', async () => {
    const three = { calls: [0, 1, 2].map(() => ({ name: 'create_expense_draft', args: DINNER_ARGS })) };
    const { response, client, drafts } = await run([three, three, { text: 'never reached' }]);
    expect(drafts.size()).toBe(5);
    expect(client.requests).toHaveLength(2);
    expect(response.reply).toBe(CAP_REPLY);
    expect(response.drafts).toHaveLength(5);
  });

  // 30
  it('returns a clarifying question with no drafts', async () => {
    const { response } = await run([{ text: 'Who paid for the dinner?' }], [user('Dinner $90 with Arun and Mei')]);
    expect(response).toEqual({ reply: 'Who paid for the dinner?', drafts: [] });
  });

  // 31
  it('turns a 429 into the friendly busy reply', async () => {
    const { response } = await run([new GeminiUnavailableError(429)]);
    expect(response).toEqual({ reply: BUSY_REPLY, drafts: [] });
    expect(BUSY_REPLY).toMatch(/try again in a moment/i);
  });

  // 32
  it('keeps drafts already made when Gemini fails with a 5xx', async () => {
    const { response } = await run([{ calls: [{ name: 'create_expense_draft', args: DINNER_ARGS }] }, new GeminiUnavailableError(503)]);
    expect(response.reply).toBe(BUSY_REPLY);
    expect(response.drafts).toHaveLength(1);
  });

  // 33
  it('uses a fallback reply when the model returns nothing', async () => {
    const { response } = await run([{ text: '   ' }]);
    expect(response).toEqual({ reply: EMPTY_REPLY, drafts: [] });
  });

  // 34
  it('maps the history to contents and sends the prompt and tools on every request', async () => {
    const history: ChatMessage[] = [user('Dinner $90 with Arun'), { role: 'model', text: 'Who paid?' }, user('I did')];
    const { client } = await run([{ calls: [{ name: 'list_people' }] }, { text: 'ok' }], history);
    expect(client.requests[0]!.contents).toEqual([
      { role: 'user', parts: [{ text: 'Dinner $90 with Arun' }] },
      { role: 'model', parts: [{ text: 'Who paid?' }] },
      { role: 'user', parts: [{ text: 'I did' }] },
    ]);
    for (const req of client.requests) {
      expect(req.systemInstruction).toContain(TODAY);
      expect(req.tools.map((t) => t.name)).toContain('create_expense_draft');
    }
  });

  // 35
  it('checks amounts against every user message, but not model text', async () => {
    const history: ChatMessage[] = [user('Dinner $90 with Arun'), { role: 'model', text: 'Who paid? Was it $95?' }, user('I did')];
    const args = { ...DINNER_ARGS, participants: ['me', 'Arun'], adjustments: [] };
    const { response } = await run(
      [{ calls: [{ name: 'create_expense_draft', args }, { name: 'create_expense_draft', args: { ...args, totalDollars: 95 } }] }, { text: 'ok' }],
      history,
    );
    expect(response.drafts.map((d) => d.warnings.map((w) => w.code))).toEqual([[], ['AMOUNT_NOT_IN_MESSAGE']]);
  });
});
