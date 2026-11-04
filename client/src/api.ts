// Fetch wrappers. Every failure becomes an ApiRequestError whose message can be shown as is.
import type {
  Account,
  ApiError,
  ChatMessage,
  ChatResponse,
  ConfirmResult,
  Draft,
  DraftEdits,
  DraftRequest,
  Expense,
  Group,
  GroupSummary,
  Person,
  Settlement,
  SettlePlan,
  SpendingSummary,
} from '@splitbot/shared';
import { PASSCODE_HEADER } from '@splitbot/shared';
import { getStoredPasscode } from './passcode';

export const UNREACHABLE_MESSAGE = "Can't reach the server. Is it running?";

export class ApiRequestError extends Error {
  constructor(
    /** 0 when there was no usable response. */
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const unreachable = (status = 0) => new ApiRequestError(status, 'SERVER_UNREACHABLE', UNREACHABLE_MESSAGE);

const passcodeHeader = (passcode: string) => ({ [PASSCODE_HEADER]: encodeURIComponent(passcode) });

/** Adds the stored passcode. With none, the request is left exactly as it was. */
function withStoredPasscode(init?: RequestInit): RequestInit | undefined {
  const stored = getStoredPasscode();
  return stored ? { ...init, headers: { ...passcodeHeader(stored), ...(init?.headers as Record<string, string> | undefined) } } : init;
}

let passcodeRequired: (() => void) | null = null;

/** Called when any request comes back locked, so the app can ask for the passcode again. */
export function onPasscodeRequired(listener: (() => void) | null): void {
  passcodeRequired = listener;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return send<T>(path, withStoredPasscode(init));
}

async function send<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw unreachable();
  }
  if (res.status === 204) return undefined as T;

  // With the server down, the Vite proxy answers with something that isn't our JSON.
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw unreachable(res.status);
  }
  if (res.ok) return body as T;
  const error = (body as Partial<ApiError> | null)?.error;
  if (typeof error?.code !== 'string' || typeof error.message !== 'string') throw unreachable(res.status);
  if (error.code === 'PASSCODE_REQUIRED') passcodeRequired?.();
  throw new ApiRequestError(res.status, error.code, error.message);
}

/** Asks whether `passcode` unlocks the API. Takes it directly and doesn't use the stored one, so a guess is only stored once it works. */
export const checkSession = (passcode: string | null) => send<void>('/api/session', passcode ? { headers: passcodeHeader(passcode) } : undefined);

const withJson = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const draftPath = (id: string) => `/api/drafts/${encodeURIComponent(id)}`;

export const getPeople = () => request<Person[]>('/api/people');

export const getAccount = () => request<Account>('/api/account');

export const getSettlePlan = () => request<SettlePlan>('/api/settlements/plan');

export const createDraft = (body: DraftRequest) => request<Draft>('/api/drafts', withJson('POST', body));

export const getSummary = () => request<SpendingSummary>('/api/summary');

export const getGroups = () => request<GroupSummary[]>('/api/groups');

export const createGroup = (name: string) => request<Group>('/api/groups', withJson('POST', { name }));

export const addGroupMember = (groupId: string, personId: string) =>
  request<Group>(`/api/groups/${encodeURIComponent(groupId)}/members`, withJson('POST', { personId }));

export const getExpenses = () => request<Expense[]>('/api/expenses');

export const getSettlements = () => request<Settlement[]>('/api/settlements');

export const deleteExpense = (id: string) => request<void>(`/api/expenses/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const deleteSettlement = (id: string) => request<void>(`/api/settlements/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const sendChat = (messages: ChatMessage[]) => request<ChatResponse>('/api/chat', withJson('POST', { messages }));

export const editDraft = (id: string, edits: DraftEdits) => request<Draft>(draftPath(id), withJson('PATCH', edits));

export const confirmDraft = (id: string) => request<ConfirmResult>(`${draftPath(id)}/confirm`, { method: 'POST' });

export const discardDraft = (id: string) => request<void>(draftPath(id), { method: 'DELETE' });
