// The real @google/genai adapter, over a fake fetch (no network).
import type { Fetch } from '@google/genai';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChatMessage } from '@splitbot/shared';
import { createGeminiClient, GEMINI_TIMEOUT_MS, GeminiUnavailableError } from '../src/agent/gemini';
import { BUSY_REPLY, runAgent } from '../src/agent/loop';
import { functionDeclarations } from '../src/agent/tools';
import { createApp } from '../src/app';
import { agentFixture, TODAY } from './fakes';
import { tempDir } from './helpers';

const FAKE_KEY = 'AIzaFAKE-test-key-0123456789';
const MODEL = 'gemini-test-model';

let dir: string;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  ({ dir, cleanup } = await tempDir());
});
afterEach(() => cleanup());

interface Seen {
  url: string;
  headers: Headers;
  body: any;
}

/** A fetch that records each request and answers with `respond()`. */
function fakeFetch(respond: () => Response | Promise<Response>) {
  const seen: Seen[] = [];
  const fetch: Fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    seen.push({ url, headers: new Headers(init?.headers), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return respond();
  };
  return { fetch, seen };
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const apiError = (status: number, message: string) => json(status, { error: { code: status, message, status: 'ERROR' } });

const REQUEST = { systemInstruction: 'You are SplitBot.', contents: [{ role: 'user', parts: [{ text: 'hi' }] }], tools: functionDeclarations() };

describe('Gemini adapter', () => {
  // 44
  it('sends the prompt, history and tools, and splits the answer into calls, text and raw content', async () => {
    const content = {
      role: 'model',
      parts: [
        { text: 'thinking about it', thought: true },
        { text: 'Let me check.' },
        { functionCall: { id: 'c1', name: 'list_people', args: {} }, thoughtSignature: 'sig-1' },
      ],
    };
    const { fetch, seen } = fakeFetch(() => json(200, { candidates: [{ content, finishReason: 'STOP' }] }));
    const client = createGeminiClient({ apiKey: FAKE_KEY, model: MODEL, fetch });
    const result = await client.generate(REQUEST);

    expect(result.functionCalls).toEqual([{ id: 'c1', name: 'list_people', args: {} }]);
    expect(result.text).toBe('Let me check.');
    expect(result.content).toEqual(content);

    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toContain(`models/${MODEL}:generateContent`);
    const body = seen[0]!.body;
    expect(JSON.stringify(body.systemInstruction)).toContain('You are SplitBot.');
    expect(body.contents).toEqual(REQUEST.contents);
    const decls = body.tools[0].functionDeclarations;
    expect(decls.map((d: { name: string }) => d.name)).toContain('create_expense_draft');
    expect(decls[0].parametersJsonSchema.type).toBe('object');
  });

  // 45
  it('maps 429, 5xx and network failures to GeminiUnavailableError, with no retries', async () => {
    for (const status of [429, 500, 503]) {
      const { fetch, seen } = fakeFetch(() => apiError(status, 'busy'));
      const err = await createGeminiClient({ apiKey: FAKE_KEY, model: MODEL, fetch }).generate(REQUEST).catch((e) => e);
      expect(err).toBeInstanceOf(GeminiUnavailableError);
      expect(err.status).toBe(status);
      expect(seen).toHaveLength(1);
    }
    const offline = fakeFetch(() => {
      throw new TypeError('fetch failed');
    });
    const err = await createGeminiClient({ apiKey: FAKE_KEY, model: MODEL, fetch: offline.fetch }).generate(REQUEST).catch((e) => e);
    expect(err).toBeInstanceOf(GeminiUnavailableError);
    expect(err.status).toBeUndefined();
  });

  // 46
  it('other API errors are not "busy": they keep the status and a short message', async () => {
    const { fetch } = fakeFetch(() => apiError(403, 'API key not valid. Please pass a valid API key.'));
    const err = await createGeminiClient({ apiKey: FAKE_KEY, model: MODEL, fetch }).generate(REQUEST).catch((e) => e);
    expect(err).not.toBeInstanceOf(GeminiUnavailableError);
    expect(err.message).toContain('403');
    expect(err.message).toContain('API key not valid');
  });
});

describe('Step 4 review: timeout and config errors', () => {
  /** A fetch that never answers, and rejects only when the SDK aborts it. */
  const hangingFetch: Fetch = (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason ?? new DOMException('aborted', 'AbortError')));
    });

  // 62
  it('a request that takes longer than the timeout becomes the busy reply', async () => {
    expect(GEMINI_TIMEOUT_MS).toBe(20_000);
    const client = createGeminiClient({ apiKey: FAKE_KEY, model: MODEL, fetch: hangingFetch, timeoutMs: 50 });
    const err = await client.generate(REQUEST).catch((e) => e);
    expect(err).toBeInstanceOf(GeminiUnavailableError);

    const fx = await agentFixture(dir);
    const response = await runAgent([{ role: 'user', text: 'hi' }], { client, store: fx.store, drafts: fx.drafts, today: () => TODAY });
    expect(response).toEqual({ reply: BUSY_REPLY, drafts: [] });
  });

  /** POST /api/chat over the real adapter, with Gemini answering `status` and `message`. */
  async function chatWithGeminiError(status: number, message: string) {
    const fx = await agentFixture(`${dir}/${status}-${message.length}`);
    const { fetch } = fakeFetch(() => apiError(status, message));
    const client = createGeminiClient({ apiKey: FAKE_KEY, model: MODEL, fetch });
    const logs: string[] = [];
    const app = createApp({
      store: fx.store,
      drafts: fx.drafts,
      today: () => TODAY,
      log: (m) => logs.push(m),
      agent: (messages) => runAgent(messages, { client, store: fx.store, drafts: fx.drafts, today: () => TODAY }),
    });
    const res = await request(app).post('/api/chat').send({ messages: [{ role: 'user', text: 'hello' }] });
    return { res, logs };
  }

  // 63
  it('a bad API key → 502 GEMINI_KEY_INVALID with a message the UI can show', async () => {
    for (const [status, message] of [
      [400, 'API key not valid. Please pass a valid API key.'],
      [401, 'Request had invalid authentication credentials.'],
      [403, 'Permission denied.'],
    ] as const) {
      const { res, logs } = await chatWithGeminiError(status, message);
      expect(res.status).toBe(502);
      expect(res.body.error).toEqual({
        code: 'GEMINI_KEY_INVALID',
        message: 'Gemini rejected the API key. Check GEMINI_API_KEY in .env and restart the server.',
      });
      expect(logs.join('\n')).toContain(String(status));
      expect(JSON.stringify(res.body) + logs.join('\n')).not.toContain(FAKE_KEY);
    }
  });

  // 64
  it('an unknown or retired model → 502 GEMINI_MODEL_UNAVAILABLE naming the model; other 4xx → GEMINI_REQUEST_FAILED', async () => {
    const { res } = await chatWithGeminiError(404, 'This model models/gemini-test-model is no longer available to new users.');
    expect(res.status).toBe(502);
    expect(res.body.error).toEqual({
      code: 'GEMINI_MODEL_UNAVAILABLE',
      message: `Gemini model "${MODEL}" isn't available to this API key. Set GEMINI_MODEL in .env (see .env.example) and restart the server.`,
    });

    const other = await chatWithGeminiError(400, 'Request contains an invalid argument.');
    expect(other.res.status).toBe(502);
    expect(other.res.body.error.code).toBe('GEMINI_REQUEST_FAILED');
    expect(other.res.body.error.message).toBe('Gemini rejected the request (status 400). Please try again; if it keeps happening, check the server log.');
  });
});

describe('the API key stays secret', () => {
  // 42
  it('the key goes only in the request header, never in the URL, a log line or a response', async () => {
    const user = (text: string): ChatMessage => ({ role: 'user', text });
    for (const status of [429, 403]) {
      const fx = await agentFixture(`${dir}/${status}`);
      const { fetch, seen } = fakeFetch(() => apiError(status, 'nope'));
      const client = createGeminiClient({ apiKey: FAKE_KEY, model: MODEL, fetch });
      const logs: string[] = [];
      const app = createApp({
        store: fx.store,
        drafts: fx.drafts,
        today: () => TODAY,
        log: (m) => logs.push(m),
        agent: (messages) => runAgent(messages, { client, store: fx.store, drafts: fx.drafts, today: () => TODAY }),
      });
      const res = await request(app).post('/api/chat').send({ messages: [user('hello')] });

      // 403 was a generic 500 until the Step 4 review; it is now a clear GEMINI_KEY_INVALID (see #63).
      expect(res.status).toBe(status === 429 ? 200 : 502);
      if (status === 429) expect(res.body.reply).toBe(BUSY_REPLY);
      else expect(res.body.error.code).toBe('GEMINI_KEY_INVALID');
      expect(seen[0]!.headers.get('x-goog-api-key')).toBe(FAKE_KEY);
      expect(seen[0]!.url).not.toContain(FAKE_KEY);
      expect(JSON.stringify(res.body)).not.toContain(FAKE_KEY);
      expect(logs.join('\n')).not.toContain(FAKE_KEY);
      if (status === 403) expect(logs.join('\n')).toContain('403');
    }
  });
});
