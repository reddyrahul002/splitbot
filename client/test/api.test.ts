import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, confirmDraft, discardDraft, editDraft, getPeople, sendChat, UNREACHABLE_MESSAGE } from '../src/api';

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
