import { join } from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { createDraftStore } from '../src/drafts';
import { PASSCODE_HEADER, passcodeMatches } from '../src/passcode';
import { CHAT_LIMITS, createRateLimiter } from '../src/rate-limit';
import { openStore } from '../src/store';
import { tempDir } from './helpers';

const PASSCODE = 'correct horse battery';
const WRONG = 'wrong horse battery';
const MINUTE = 60_000;
const MESSAGES = { messages: [{ role: 'user', text: 'hello' }] };

let dir: string;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  ({ dir, cleanup } = await tempDir());
});
afterEach(() => cleanup());

const asHeader = (passcode: string) => encodeURIComponent(passcode);

async function setup(options: { passcode?: string; limitChat?: boolean; failingAgent?: boolean } = {}) {
  const store = await openStore(join(dir, 'db.json'));
  let refreshes = 0;
  let agentCalls = 0;
  let now = 5_000_000;
  const logs: string[] = [];
  const clock = () => now;
  const app = createApp({
    store: {
      ...store,
      refresh: async () => {
        refreshes++;
        await store.refresh();
      },
    },
    drafts: createDraftStore({ now: clock }),
    today: () => '2026-11-03',
    now: clock,
    log: (m) => logs.push(m),
    passcode: options.passcode,
    chatLimiter: options.limitChat ? createRateLimiter(CHAT_LIMITS, clock) : undefined,
    agent: async () => {
      agentCalls++;
      if (options.failingAgent) throw new Error('boom');
      return { reply: 'hi', drafts: [] };
    },
  });
  return {
    app,
    logs,
    refreshes: () => refreshes,
    agentCalls: () => agentCalls,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('passcodeMatches', () => {
  it('#P1 accepts only the right passcode', () => {
    expect(passcodeMatches(asHeader(PASSCODE), PASSCODE)).toBe(true);
    expect(passcodeMatches(asHeader(WRONG), PASSCODE)).toBe(false);
  });

  it('#P2 a missing or empty header never matches', () => {
    expect(passcodeMatches(undefined, PASSCODE)).toBe(false);
    expect(passcodeMatches('', PASSCODE)).toBe(false);
  });

  it('#P3 a prefix, a longer value or different case does not match', () => {
    expect(passcodeMatches(asHeader(PASSCODE.slice(0, -1)), PASSCODE)).toBe(false);
    expect(passcodeMatches(asHeader(`${PASSCODE}x`), PASSCODE)).toBe(false);
    expect(passcodeMatches(asHeader(PASSCODE.toUpperCase()), PASSCODE)).toBe(false);
  });

  it('#P4 non-Latin passcodes work, because the header carries them encoded', () => {
    const passcode = 'pässwörd 🔐 தமிழ்';
    expect(passcodeMatches(asHeader(passcode), passcode)).toBe(true);
    expect(passcodeMatches(passcode, passcode)).toBe(false);
  });
});

describe('with a passcode set', () => {
  const ROUTES: ['get' | 'post' | 'patch' | 'delete', string][] = [
    ['get', '/api/session'],
    ['get', '/api/people'],
    ['post', '/api/chat'],
    ['post', '/api/drafts'],
    ['patch', '/api/drafts/x'],
    ['post', '/api/drafts/x/confirm'],
    ['delete', '/api/drafts/x'],
    ['get', '/api/expenses'],
    ['delete', '/api/expenses/x'],
    ['get', '/api/settlements'],
    ['get', '/api/settlements/suggest'],
    ['get', '/api/settlements/plan'],
    ['delete', '/api/settlements/x'],
    ['get', '/api/balances'],
    ['get', '/api/account'],
    ['get', '/api/groups'],
    ['post', '/api/groups'],
    ['post', '/api/groups/x/members'],
    ['get', '/api/summary'],
    ['get', '/api/not-a-route'],
  ];

  it.each(ROUTES)('#P5 %s %s is locked without the passcode', async (method, path) => {
    const { app } = await setup({ passcode: PASSCODE });
    const res = await request(app)[method](path);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('PASSCODE_REQUIRED');
    expect(typeof res.body.error.message).toBe('string');
  });

  it('#P6 a wrong passcode is refused, in the same error shape', async () => {
    const { app } = await setup({ passcode: PASSCODE });
    const res = await request(app).get('/api/people').set(PASSCODE_HEADER, asHeader(WRONG));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('PASSCODE_REQUIRED');
  });

  it('#P7 the right passcode opens the route', async () => {
    const { app } = await setup({ passcode: PASSCODE });
    const res = await request(app).get('/api/people').set(PASSCODE_HEADER, asHeader(PASSCODE));
    expect(res.status).toBe(200);
    expect(res.body.some((p: { id: string }) => p.id === 'me')).toBe(true);
  });

  it('#P8 a locked request never reaches the store or the agent', async () => {
    const { app, refreshes, agentCalls } = await setup({ passcode: PASSCODE });
    await request(app).get('/api/people');
    await request(app).post('/api/chat').set(PASSCODE_HEADER, asHeader(WRONG)).send(MESSAGES);
    expect(refreshes()).toBe(0);
    expect(agentCalls()).toBe(0);
  });

  it('#P9 an unlocked request does refresh the store, so other instances stay in step', async () => {
    const { app, refreshes } = await setup({ passcode: PASSCODE });
    await request(app).get('/api/people').set(PASSCODE_HEADER, asHeader(PASSCODE));
    expect(refreshes()).toBe(1);
  });

  it('#P10 a locked request is refused before its body is read, so bad JSON still gets 401', async () => {
    const { app } = await setup({ passcode: PASSCODE });
    const res = await request(app).post('/api/chat').set('Content-Type', 'application/json').send('{not json');
    expect(res.status).toBe(401);
  });

  it('#P11 neither the real passcode nor a guess appears in the response or the log', async () => {
    const { app, logs } = await setup({ passcode: PASSCODE, failingAgent: true });
    const refused = await request(app).get('/api/people').set(PASSCODE_HEADER, asHeader(WRONG));
    const crashed = await request(app).post('/api/chat').set(PASSCODE_HEADER, asHeader(PASSCODE)).send(MESSAGES);
    expect(crashed.status).toBe(500);
    const seen = JSON.stringify([refused.body, refused.headers, crashed.body, crashed.headers, logs]);
    for (const secret of [PASSCODE, WRONG, asHeader(PASSCODE), asHeader(WRONG)]) expect(seen.includes(secret)).toBe(false);
  });
});

describe('GET /api/session', () => {
  it('#P12 answers 204 when unlocked', async () => {
    const { app } = await setup({ passcode: PASSCODE });
    const res = await request(app).get('/api/session').set(PASSCODE_HEADER, asHeader(PASSCODE));
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
  });

  it('#P13 with no passcode set it answers 204, so local dev never sees an unlock screen', async () => {
    const { app } = await setup();
    expect((await request(app).get('/api/session')).status).toBe(204);
  });
});

describe('with no passcode set', () => {
  it('#P14 every route stays open, as it is for local dev', async () => {
    const { app } = await setup();
    expect((await request(app).get('/api/people')).status).toBe(200);
  });

  it('#P15 a stray header changes nothing', async () => {
    const { app } = await setup();
    expect((await request(app).get('/api/people').set(PASSCODE_HEADER, 'anything')).status).toBe(200);
  });
});

describe('passcode guessing', () => {
  const guess = (app: Awaited<ReturnType<typeof setup>>['app'], passcode = WRONG) => request(app).get('/api/session').set(PASSCODE_HEADER, asHeader(passcode));

  it('#P16 after 10 wrong guesses it answers 429 with how long to wait', async () => {
    const { app } = await setup({ passcode: PASSCODE });
    for (let i = 0; i < 10; i++) expect((await guess(app)).status).toBe(401);
    const res = await guess(app);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(res.headers['retry-after']).toBe('900');
    expect(res.body.error.message).toContain('15 minutes');
  });

  it('#P17 while limited even the right passcode waits, or guessing could continue', async () => {
    const { app } = await setup({ passcode: PASSCODE });
    for (let i = 0; i < 10; i++) await guess(app);
    expect((await guess(app, PASSCODE)).status).toBe(429);
  });

  it('#P18 it opens again when the window has passed', async () => {
    const { app, advance } = await setup({ passcode: PASSCODE });
    for (let i = 0; i < 10; i++) await guess(app);
    advance(15 * MINUTE);
    expect((await guess(app, PASSCODE)).status).toBe(204);
  });

  it('#P19 no passcode at all does not count, so an ordinary page load can never lock you out', async () => {
    const { app } = await setup({ passcode: PASSCODE });
    for (let i = 0; i < 30; i++) expect((await request(app).get('/api/session')).status).toBe(401);
    expect((await guess(app, PASSCODE)).status).toBe(204);
  });

  it('#P20 correct requests do not count', async () => {
    const { app } = await setup({ passcode: PASSCODE });
    for (let i = 0; i < 30; i++) expect((await guess(app, PASSCODE)).status).toBe(204);
    expect((await guess(app)).status).toBe(401);
  });

  it('#P21 a limited request never reaches the store', async () => {
    const { app, refreshes } = await setup({ passcode: PASSCODE });
    for (let i = 0; i < 10; i++) await guess(app);
    await guess(app, PASSCODE);
    expect(refreshes()).toBe(0);
  });
});

describe('caching', () => {
  const noStore = (res: { headers: Record<string, string> }) => expect(res.headers['cache-control']).toBe('no-store');

  it('#P22 no /api response can be cached by a proxy: success, locked, limited or missing', async () => {
    const { app } = await setup({ passcode: PASSCODE });
    noStore(await request(app).get('/api/people').set(PASSCODE_HEADER, asHeader(PASSCODE)));
    noStore(await request(app).get('/api/people'));
    noStore(await request(app).get('/api/nope').set(PASSCODE_HEADER, asHeader(PASSCODE)));
    for (let i = 0; i < 10; i++) await request(app).get('/api/people').set(PASSCODE_HEADER, asHeader(WRONG));
    noStore(await request(app).get('/api/people').set(PASSCODE_HEADER, asHeader(WRONG)));
  });

  it('#P23 also with no passcode set', async () => {
    const { app } = await setup();
    noStore(await request(app).get('/api/people'));
  });
});

describe('GET /healthz', () => {
  it('#P24 answers without the passcode, so Render can check it', async () => {
    const { app } = await setup({ passcode: PASSCODE });
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('#P25 does not touch the store, so health checks cost no database calls', async () => {
    const { app, refreshes } = await setup({ passcode: PASSCODE });
    await request(app).get('/healthz');
    expect(refreshes()).toBe(0);
  });

  it('#P26 is the only open route outside the gate', async () => {
    const { app } = await setup({ passcode: PASSCODE });
    expect((await request(app).get('/api/healthz')).status).toBe(401);
    expect((await request(app).get('/healthz/people')).status).toBe(404);
  });
});

describe('chat rate limit', () => {
  const chat = (app: Awaited<ReturnType<typeof setup>>['app']) => request(app).post('/api/chat').send(MESSAGES);

  it('#P27 the 11th message in a minute gets 429 and never reaches Gemini', async () => {
    const { app, agentCalls } = await setup({ limitChat: true });
    for (let i = 0; i < 10; i++) expect((await chat(app)).status).toBe(200);
    const res = await chat(app);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(res.headers['retry-after']).toBe('60');
    expect(res.body.error.message).toContain('1 minute');
    expect(agentCalls()).toBe(10);
  });

  it('#P28 it opens again after the minute', async () => {
    const { app, advance } = await setup({ limitChat: true });
    for (let i = 0; i < 10; i++) await chat(app);
    advance(MINUTE);
    expect((await chat(app)).status).toBe(200);
  });

  it('#P29 the 81st message in a day gets 429, however slowly they were sent', async () => {
    const { app, advance, agentCalls } = await setup({ limitChat: true });
    for (let i = 0; i < 80; i++) {
      expect((await chat(app)).status).toBe(200);
      advance(MINUTE);
    }
    const res = await chat(app);
    expect(res.status).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(60);
    expect(agentCalls()).toBe(80);
  });

  it('#P30 an invalid request does not use up the allowance', async () => {
    const { app } = await setup({ limitChat: true });
    for (let i = 0; i < 20; i++) expect((await request(app).post('/api/chat').send({ messages: [] })).status).toBe(400);
    expect((await chat(app)).status).toBe(200);
  });

  it('#P31 a message that fails still counts, because it may have used Gemini quota', async () => {
    const { app } = await setup({ limitChat: true, failingAgent: true });
    for (let i = 0; i < 10; i++) expect((await chat(app)).status).toBe(500);
    expect((await chat(app)).status).toBe(429);
  });

  it('#P32 other routes are not limited', async () => {
    const { app } = await setup({ limitChat: true });
    for (let i = 0; i < 10; i++) await chat(app);
    expect((await request(app).get('/api/people')).status).toBe(200);
  });

  it('#P33 with no limiter given, chat is not limited, as for existing callers', async () => {
    const { app } = await setup();
    for (let i = 0; i < 15; i++) expect((await chat(app)).status).toBe(200);
  });
});
