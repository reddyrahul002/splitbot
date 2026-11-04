import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PASSCODE_HEADER } from '@splitbot/shared';
import { checkSession, getPeople, onPasscodeRequired, sendChat } from '../src/api';
import { clearPasscode, getStoredPasscode, PASSCODE_KEY, storePasscode } from '../src/passcode';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function fakeStorage() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

function stubFetch(response: () => Response = () => json(200, [])) {
  const fetchMock = vi.fn(async (_path: string, _init?: RequestInit) => response());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const headersOf = (fetchMock: ReturnType<typeof stubFetch>) => fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string> | undefined;

let storage: ReturnType<typeof fakeStorage>;

beforeEach(() => {
  storage = fakeStorage();
  vi.stubGlobal('sessionStorage', storage);
});
afterEach(() => {
  vi.unstubAllGlobals();
  onPasscodeRequired(null);
});

describe('passcode storage', () => {
  it('#H1 keeps it in sessionStorage, so it clears when the tab closes', () => {
    storePasscode('a code');
    expect(storage.items.get(PASSCODE_KEY)).toBe('a code');
    expect(getStoredPasscode()).toBe('a code');
    clearPasscode();
    expect(getStoredPasscode()).toBeNull();
  });

  it('#H2 with no storage available it holds nothing, and does not throw', () => {
    vi.stubGlobal('sessionStorage', undefined);
    expect(getStoredPasscode()).toBeNull();
    expect(() => storePasscode('x')).not.toThrow();
    expect(() => clearPasscode()).not.toThrow();
  });

  it('#H3 blocked storage does not throw either', () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('sessionStorage', { getItem: blocked, setItem: blocked, removeItem: blocked });
    expect(getStoredPasscode()).toBeNull();
    expect(() => storePasscode('x')).not.toThrow();
    expect(() => clearPasscode()).not.toThrow();
  });
});

describe('the header', () => {
  it('#H4 is the name the server reads', () => {
    expect(PASSCODE_HEADER).toBe('x-app-passcode');
  });

  it('#H5 goes on every request once a passcode is stored', async () => {
    storePasscode('a code');
    const fetchMock = stubFetch();
    await getPeople();
    expect(headersOf(fetchMock)?.[PASSCODE_HEADER]).toBe('a%20code');
  });

  it('#H6 is encoded, because fetch throws on a header that is not Latin', async () => {
    storePasscode('pässwörd 🔐');
    const fetchMock = stubFetch();
    await getPeople();
    const value = headersOf(fetchMock)?.[PASSCODE_HEADER] ?? '';
    expect(decodeURIComponent(value)).toBe('pässwörd 🔐');
    expect(() => new Headers({ [PASSCODE_HEADER]: value })).not.toThrow();
  });

  it('#H7 keeps the headers a request already has', async () => {
    storePasscode('a code');
    const fetchMock = stubFetch(() => json(200, { reply: 'hi', drafts: [] }));
    await sendChat([{ role: 'user', text: 'hello' }]);
    const headers = headersOf(fetchMock);
    expect(headers?.['Content-Type']).toBe('application/json');
    expect(headers?.[PASSCODE_HEADER]).toBe('a%20code');
  });

  it('#H8 with nothing stored the request is exactly as it was, as in local dev', async () => {
    const fetchMock = stubFetch();
    await getPeople();
    expect(fetchMock).toHaveBeenCalledWith('/api/people', undefined);
  });

  it('#H9 never goes in the URL or the body', async () => {
    storePasscode('a code');
    const fetchMock = stubFetch(() => json(200, { reply: 'hi', drafts: [] }));
    await sendChat([{ role: 'user', text: 'hello' }]);
    const [path, init] = fetchMock.mock.calls[0]!;
    expect(path).toBe('/api/chat');
    expect(String(init?.body)).not.toContain('code');
  });
});

describe('checkSession', () => {
  const noContent = () => new Response(null, { status: 204 });

  it('#H10 tries the passcode it is given, without storing it', async () => {
    const fetchMock = stubFetch(noContent);
    await checkSession('typed code');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/session');
    expect(headersOf(fetchMock)?.[PASSCODE_HEADER]).toBe('typed%20code');
    expect(getStoredPasscode()).toBeNull();
  });

  it('#H11 what it is given wins over what is stored', async () => {
    storePasscode('old code');
    const fetchMock = stubFetch(noContent);
    await checkSession('new code');
    expect(headersOf(fetchMock)?.[PASSCODE_HEADER]).toBe('new%20code');
  });

  it('#H12 given nothing, it sends nothing, even with something stored', async () => {
    storePasscode('old code');
    const fetchMock = stubFetch(noContent);
    await checkSession(null);
    expect(headersOf(fetchMock)?.[PASSCODE_HEADER]).toBeUndefined();
  });

  it('#H13 a wrong passcode rejects with the code and message', async () => {
    stubFetch(() => json(401, { error: { code: 'PASSCODE_REQUIRED', message: "That passcode isn't right." } }));
    await expect(checkSession('wrong')).rejects.toMatchObject({ status: 401, code: 'PASSCODE_REQUIRED', message: "That passcode isn't right." });
  });

  it('#H14 the loading page a host shows during a cold start counts as unreachable, not as locked', async () => {
    stubFetch(() => new Response('<html>Waking up…</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }));
    await expect(checkSession(null)).rejects.toMatchObject({ code: 'SERVER_UNREACHABLE' });
  });
});

describe('onPasscodeRequired', () => {
  it('#H15 tells the listener when any request comes back locked', async () => {
    const listener = vi.fn();
    onPasscodeRequired(listener);
    stubFetch(() => json(401, { error: { code: 'PASSCODE_REQUIRED', message: 'Enter the passcode.' } }));
    await expect(getPeople()).rejects.toMatchObject({ code: 'PASSCODE_REQUIRED' });
    expect(listener).toHaveBeenCalledOnce();
  });

  it('#H16 other errors do not lock, including too many guesses', async () => {
    const listener = vi.fn();
    onPasscodeRequired(listener);
    stubFetch(() => json(429, { error: { code: 'RATE_LIMITED', message: 'Wait.' } }));
    await expect(getPeople()).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    stubFetch(() => json(500, { error: { code: 'INTERNAL', message: 'Oops.' } }));
    await expect(getPeople()).rejects.toMatchObject({ code: 'INTERNAL' });
    expect(listener).not.toHaveBeenCalled();
  });
});
