// The one place that talks to Gemini. The loop depends only on GeminiClient, so tests can script the model.
// Nothing here logs: the request config and headers carry the API key.
import { ApiError, GoogleGenAI, type Content, type Fetch, type FunctionCall, type FunctionDeclaration } from '@google/genai';

/** Free tier, ~500 requests/day. gemini-2.5-flash is closed to new keys (404). Override with GEMINI_MODEL. */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';

/** A request that takes longer is aborted and answered with the busy reply. */
export const GEMINI_TIMEOUT_MS = 20_000;

export interface GenerateRequest {
  systemInstruction: string;
  contents: Content[];
  tools: FunctionDeclaration[];
}

export interface GenerateResult {
  /** The model's turn exactly as returned, to append to history (keeps 2.5 thought signatures). */
  content: Content;
  functionCalls: FunctionCall[];
  /** Visible text only; thought parts are left out. */
  text: string;
}

export interface GeminiClient {
  generate(req: GenerateRequest): Promise<GenerateResult>;
}

/** Rate limited (429), a server error (5xx) or unreachable. The user should just try again. */
export class GeminiUnavailableError extends Error {
  override readonly name = 'GeminiUnavailableError';
  constructor(readonly status?: number) {
    super(status === undefined ? 'Gemini could not be reached.' : `Gemini is unavailable (status ${status}).`);
  }
}

export type GeminiErrorCode = 'GEMINI_KEY_INVALID' | 'GEMINI_MODEL_UNAVAILABLE' | 'GEMINI_REQUEST_FAILED';

/**
 * Any other API error: a bad key, an unknown or retired model, or a rejected request. `message` is the detail for the
 * server log (status and Google's message, never the key); `code` and `publicMessage` are for the API response.
 */
export class GeminiRequestError extends Error {
  override readonly name = 'GeminiRequestError';
  readonly code: GeminiErrorCode;
  readonly publicMessage: string;
  constructor(
    readonly status: number,
    detail: string,
    model: string,
  ) {
    super(`Gemini request failed (status ${status}): ${detail.slice(0, 300)}`);
    // Google answers a bad key with 400 "API key not valid", or 401/403.
    if (status === 401 || status === 403 || /api key/i.test(detail)) {
      this.code = 'GEMINI_KEY_INVALID';
      this.publicMessage = 'Gemini rejected the API key. Check GEMINI_API_KEY in .env and restart the server.';
    } else if (status === 404) {
      this.code = 'GEMINI_MODEL_UNAVAILABLE';
      this.publicMessage = `Gemini model "${model}" isn't available to this API key. Set GEMINI_MODEL in .env (see .env.example) and restart the server.`;
    } else {
      this.code = 'GEMINI_REQUEST_FAILED';
      this.publicMessage = `Gemini rejected the request (status ${status}). Please try again; if it keeps happening, check the server log.`;
    }
  }
}

function toGeminiError(err: unknown, model: string): unknown {
  if (err instanceof ApiError) {
    if (err.status === 429 || err.status >= 500) return new GeminiUnavailableError(err.status);
    return new GeminiRequestError(err.status, err.message, model);
  }
  // fetch rejects with a TypeError when the network is down, and with an AbortError on timeout.
  if (err instanceof TypeError || (err instanceof Error && err.name === 'AbortError')) return new GeminiUnavailableError();
  return err;
}

export function createGeminiClient(options: { apiKey: string; model: string; fetch?: Fetch; timeoutMs?: number }): GeminiClient {
  const { apiKey, model, fetch, timeoutMs = GEMINI_TIMEOUT_MS } = options;
  const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: timeoutMs, ...(fetch ? { fetch } : {}) } });
  return {
    async generate({ systemInstruction, contents, tools }) {
      let response;
      try {
        response = await ai.models.generateContent({
          model,
          contents,
          config: { systemInstruction, tools: [{ functionDeclarations: tools }] },
        });
      } catch (err) {
        throw toGeminiError(err, model);
      }
      const content: Content = response.candidates?.[0]?.content ?? { role: 'model', parts: [] };
      const parts = content.parts ?? [];
      const functionCalls = parts.flatMap((p) => (p.functionCall ? [p.functionCall] : []));
      const text = parts
        .filter((p) => typeof p.text === 'string' && !p.thought)
        .map((p) => p.text)
        .join('');
      return { content, functionCalls, text };
    },
  };
}
