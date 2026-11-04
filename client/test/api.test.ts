import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiRequestError,
  confirmDraft,
  createDraft,
  deleteExpense,
  deleteSettlement,
  discardDraft,
  editDraft,
  getAccount,
  getExpenses,
  getPeople,
  getSettlements,
  getSettlePlan,
  sendChat,
  UNREACHABLE_MESSAGE,
} from '../src/api';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const stubFetch = (response: Response | Error) => {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const failure = async (call: () => Promise<unknown>): Promise<ApiRequestError> => {
  const err = await call().then(
    () => new Error('expected a failure'),
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ApiRequestError);
  return err as ApiRequestError;
};

const USER_MESSAGE = [{ role: 'user' as const, text: 'hi' }];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getAccount', () => {
  const ACCOUNT = { owedCents: 6400, owedCount: 2, oweCents: 0, oweCount: 0, netCents: 6400, people: [{ personId: 'arun', netCents: 6400 }] };

  it('#45 asks /api/account and returns the summary as is', async () => {
    const fetchMock = stubFetch(json(200, ACCOUNT));
    await expect(getAccount()).resolves.toEqual(ACCOUNT);
    expect(fetchMock.mock.calls[0]).toEqual(['/api/account', undefined]);
  });

  it('#46 a dead server gives the unreachable message', async () => {
    stubFetch(new TypeError('fetch failed'));
    expect((await failure(() => getAccount())).message).toBe(UNREACHABLE_MESSAGE);
  });
});

describe('settle-up wrappers', () => {
  it('#63 getSettlePlan asks /api/settlements/plan', async () => {
    const plan = { transfers: [{ from: 'arun', to: 'me', cents: 500 }], directDebtCount: 1, paymentsSaved: 0 };
    const fetchMock = stubFetch(json(200, plan));
    await expect(getSettlePlan()).resolves.toEqual(plan);
    expect(fetchMock.mock.calls[0]).toEqual(['/api/settlements/plan', undefined]);
  });

  it('#64 createDraft posts the request as JSON', async () => {
    const fetchMock = stubFetch(json(201, { id: 'd1', kind: 'settlement' }));
    const body = { kind: 'settlement' as const, from: 'Arun', to: 'Me', cents: 500 };
    await expect(createDraft(body)).resolves.toMatchObject({ id: 'd1' });
    expect(fetchMock.mock.calls[0]).toEqual([
      '/api/drafts',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    ]);
  });

  it('#65 createDraft shows the server message word for word', async () => {
    stubFetch(json(400, { error: { code: 'SAME_PERSON', message: 'A payment needs two different people.' } }));
    const err = await failure(() => createDraft({ kind: 'settlement', from: 'Arun', to: 'Arun', cents: 500 }));
    expect(err.code).toBe('SAME_PERSON');
    expect(err.message).toBe('A payment needs two different people.');
  });
});

describe('expense and payment wrappers', () => {
  it('#82 getExpenses and getSettlements ask the list routes', async () => {
    const fetchMock = stubFetch(json(200, []));
    await expect(getExpenses()).resolves.toEqual([]);
    expect(fetchMock.mock.calls[0]).toEqual(['/api/expenses', undefined]);

    const settlementsMock = stubFetch(json(200, []));
    await expect(getSettlements()).resolves.toEqual([]);
    expect(settlementsMock.mock.calls[0]).toEqual(['/api/settlements', undefined]);
  });

  it('#83 deletes use DELETE on an encoded id and resolve on 204', async () => {
    const expenseMock = stubFetch(new Response(null, { status: 204 }));
    await expect(deleteExpense('a/b')).resolves.toBeUndefined();
    expect(expenseMock.mock.calls[0]).toEqual(['/api/expenses/a%2Fb', { method: 'DELETE' }]);

    const settlementMock = stubFetch(new Response(null, { status: 204 }));
    await expect(deleteSettlement('s 1')).resolves.toBeUndefined();
    expect(settlementMock.mock.calls[0]).toEqual(['/api/settlements/s%201', { method: 'DELETE' }]);
  });

  it('#84 deleting something already gone keeps the NOT_FOUND code', async () => {
    stubFetch(json(404, { error: { code: 'NOT_FOUND', message: 'Expense not found.' } }));
    const err = await failure(() => deleteExpense('gone'));
    expect(err.status).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Expense not found.');
  });
});

describe('sendChat errors', () => {
  it.each([
    [503, 'GEMINI_NOT_CONFIGURED', 'Chat needs GEMINI_API_KEY in .env (see .env.example).'],
    [502, 'GEMINI_KEY_INVALID', 'Gemini rejected the API key. Check GEMINI_API_KEY in .env and restart the server.'],
    [502, 'GEMINI_MODEL_UNAVAILABLE', 'Gemini model "nope" isn\'t available to this API key.'],
    [502, 'GEMINI_REQUEST_FAILED', 'Gemini rejected the request (status 400). Please try again.'],
  ])('#16 %i %s keeps the code and shows the server message word for word', async (status, code, message) => {
    stubFetch(json(status, { error: { code, message } }));
    const err = await failure(() => sendChat(USER_MESSAGE));
    expect(err.code).toBe(code);
    expect(err.message).toBe(message);
    expect(err.status).toBe(status);
  });

  it('#17 a network failure says the server cannot be reached', async () => {
    stubFetch(new TypeError('Failed to fetch'));
    const err = await failure(() => sendChat(USER_MESSAGE));
    expect(err.code).toBe('SERVER_UNREACHABLE');
    expect(err.message).toBe(UNREACHABLE_MESSAGE);
    expect(err.message).not.toContain('Failed to fetch');
  });

  it('#18 a non-JSON error (the proxy with the server down) says the same', async () => {
    stubFetch(new Response('', { status: 500 }));
    expect((await failure(() => sendChat(USER_MESSAGE))).code).toBe('SERVER_UNREACHABLE');
    stubFetch(new Response('<html>Bad gateway</html>', { status: 502 }));
    expect((await failure(() => sendChat(USER_MESSAGE))).message).toBe(UNREACHABLE_MESSAGE);
  });

  it('#19 JSON without the error shape, or an HTML 200, also counts as unreachable', async () => {
    stubFetch(json(500, { nope: true }));
    expect((await failure(() => sendChat(USER_MESSAGE))).code).toBe('SERVER_UNREACHABLE');
    stubFetch(new Response('<!doctype html>', { status: 200 }));
    expect((await failure(() => sendChat(USER_MESSAGE))).code).toBe('SERVER_UNREACHABLE');
  });
});

describe('requests', () => {
  it('#20 sendChat posts the messages and returns the reply and drafts', async () => {
    const fetchMock = stubFetch(json(200, { reply: 'ok', drafts: [] }));
    expect(await sendChat(USER_MESSAGE)).toEqual({ reply: 'ok', drafts: [] });
    expect(fetchMock).toHaveBeenCalledWith('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: USER_MESSAGE }),
    });
  });

  it('#21 the draft routes use the right method and path', async () => {
    const fetchMock = stubFetch(json(200, { id: 'd/1' }));
    await editDraft('d/1', { description: 'x' });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/drafts/d%2F1', expect.objectContaining({ method: 'PATCH', body: '{"description":"x"}' }));

    stubFetch(json(200, { kind: 'expense' }));
    await confirmDraft('d1');
    expect(fetch).toHaveBeenLastCalledWith('/api/drafts/d1/confirm', expect.objectContaining({ method: 'POST' }));

    stubFetch(json(200, []));
    expect(await getPeople()).toEqual([]);
    expect(fetch).toHaveBeenLastCalledWith('/api/people', undefined);
  });

  it('#22 discard handles the empty 204', async () => {
    const fetchMock = stubFetch(new Response(null, { status: 204 }));
    await expect(discardDraft('d1')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/drafts/d1', expect.objectContaining({ method: 'DELETE' }));
  });

  it('#23 draft errors keep their code, so the card can spot an expired draft', async () => {
    stubFetch(json(404, { error: { code: 'DRAFT_NOT_FOUND', message: 'That draft no longer exists.' } }));
    const err = await failure(() => confirmDraft('gone'));
    expect(err.code).toBe('DRAFT_NOT_FOUND');
    expect(err.message).toBe('That draft no longer exists.');
  });
});
