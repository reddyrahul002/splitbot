// The function-calling loop: send the history, run the model's tool calls, send the results back, repeat until the
// model answers in text. At most `maxCalls` tool calls run per user message (parallel calls each count).
import type { Content, Part } from '@google/genai';
import type { ChatMessage, ChatResponse, Draft } from '@splitbot/shared';
import type { DraftStore } from '../drafts';
import type { Store } from '../store';
import { GeminiUnavailableError, type GeminiClient } from './gemini';
import { systemPrompt } from './prompt';
import { functionDeclarations, runTool, type ToolContext } from './tools';

export const MAX_TOOL_CALLS = 5;
export const CAP_REPLY = `I couldn't finish that in ${MAX_TOOL_CALLS} steps. Please try a simpler message.`;
export const BUSY_REPLY = 'Gemini is busy or rate limited right now. Please try again in a moment.';
export const EMPTY_REPLY = "Sorry, I didn't get a reply. Could you say that again?";

export interface AgentDeps {
  client: GeminiClient;
  store: Store;
  drafts: DraftStore;
  /** Today as YYYY-MM-DD. */
  today: () => string;
  maxCalls?: number;
}

export async function runAgent(messages: ChatMessage[], deps: AgentDeps): Promise<ChatResponse> {
  const { client, store, drafts: draftStore, maxCalls = MAX_TOOL_CALLS } = deps;
  const today = deps.today();
  const ctx: ToolContext = {
    store,
    drafts: draftStore,
    today,
    userMessages: messages.filter((m) => m.role === 'user').map((m) => m.text),
  };
  const systemInstruction = systemPrompt({ today, people: store.snapshot().people });
  const tools = functionDeclarations();
  const contents: Content[] = messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
  const drafts: Draft[] = [];
  let calls = 0;

  try {
    // Every round that has calls uses at least one, so this allows maxCalls rounds with calls plus a final answer.
    for (let round = 0; round <= maxCalls; round++) {
      const response = await client.generate({ systemInstruction, contents, tools });
      if (response.functionCalls.length === 0) return { reply: response.text.trim() || EMPTY_REPLY, drafts };

      contents.push(response.content);
      const results: Part[] = [];
      for (const call of response.functionCalls) {
        if (calls === maxCalls) return { reply: CAP_REPLY, drafts };
        calls++;
        const outcome = runTool(call.name ?? '', call.args, ctx);
        if (outcome.draft) drafts.push(outcome.draft);
        results.push({ functionResponse: { id: call.id, name: call.name, response: outcome.result } });
      }
      contents.push({ role: 'user', parts: results });
    }
    return { reply: CAP_REPLY, drafts };
  } catch (err) {
    if (err instanceof GeminiUnavailableError) return { reply: BUSY_REPLY, drafts };
    throw err;
  }
}
