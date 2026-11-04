// Fetch wrappers. Every failure becomes an ApiRequestError whose message can be shown as is.
import type { ApiError, ChatMessage, ChatResponse, ConfirmResult, Draft, DraftEdits, Person } from '@splitbot/shared';

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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
  throw new ApiRequestError(res.status, error.code, error.message);
}

const withJson = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const draftPath = (id: string) => `/api/drafts/${encodeURIComponent(id)}`;

export const getPeople = () => request<Person[]>('/api/people');

export const sendChat = (messages: ChatMessage[]) => request<ChatResponse>('/api/chat', withJson('POST', { messages }));

export const editDraft = (id: string, edits: DraftEdits) => request<Draft>(draftPath(id), withJson('PATCH', edits));

export const confirmDraft = (id: string) => request<ConfirmResult>(`${draftPath(id)}/confirm`, { method: 'POST' });

export const discardDraft = (id: string) => request<void>(draftPath(id), { method: 'DELETE' });
