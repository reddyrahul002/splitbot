// A scripted Gemini client and a store fixture for the agent tests. No network.
import { rename } from 'node:fs/promises';
import { join } from 'node:path';
import type { Content, FunctionCall } from '@google/genai';
import type { Expense } from '@splitbot/shared';
import type { GeminiClient, GenerateRequest, GenerateResult } from '../src/agent/gemini';
import type { ToolContext } from '../src/agent/tools';
import { createDraftStore } from '../src/drafts';
import { openStore } from '../src/store';

export const TODAY = '2026-11-03';

/** One scripted model turn: function calls and/or text, or an error to throw. */
export type Step = { calls?: { name: string; args?: Record<string, unknown>; id?: string }[]; text?: string; thoughtSignature?: string } | Error;

export interface ScriptedGemini extends GeminiClient {
  /** Deep copies of every request, in order. */
  requests: GenerateRequest[];
}

/** Returns the steps in order; throws if the loop asks for more turns than were scripted. */
export function scriptedGemini(steps: Step[]): ScriptedGemini {
  const queue = [...steps];
  const requests: GenerateRequest[] = [];
  return {
    requests,
    async generate(req) {
      requests.push(structuredClone(req));
      const step = queue.shift();
      if (step === undefined) throw new Error(`script exhausted after ${requests.length - 1} turns`);
      if (step instanceof Error) throw step;
      const functionCalls: FunctionCall[] = (step.calls ?? []).map((c) => ({ id: c.id, name: c.name, args: c.args ?? {} }));
      const content: Content = {
        role: 'model',
        parts: [
          ...(step.text === undefined ? [] : [{ text: step.text }]),
          ...functionCalls.map((functionCall, i) => ({
            functionCall,
            ...(i === 0 && step.thoughtSignature ? { thoughtSignature: step.thoughtSignature } : {}),
          })),
        ],
      };
      const result: GenerateResult = { content, functionCalls, text: step.text ?? '' };
      return result;
    },
  };
}

/** The model's dinner call: $90, I paid, me/Arun/Mei, Arun had $12 of drinks. */
export const DINNER_ARGS = {
  description: 'Dinner',
  category: 'Food & Drink',
  totalDollars: 90,
  paidBy: 'me',
  participants: ['me', 'Arun', 'Mei'],
  splitType: 'equal',
  adjustments: [{ person: 'Arun', dollars: 12, note: 'drinks' }],
};
export const DINNER_TEXT = 'Dinner $90, I paid, split with Arun and Mei, Arun had $12 of drinks';

/** The confirmed dinner: me paid 9000; me 2600, Arun 3800, Mei 2600. */
export const DINNER_EXPENSE: Expense = {
  id: 'e-dinner',
  description: 'Dinner',
  category: 'Food & Drink',
  date: '2026-11-01',
  totalCents: 9000,
  paidBy: 'me',
  shares: [
    { personId: 'me', cents: 2600 },
    { personId: 'arun', cents: 3800 },
    { personId: 'mei', cents: 2600 },
  ],
  splitMeta: { splitType: 'equal', adjustments: [{ person: 'arun', cents: 1200, note: 'drinks' }] },
  createdAt: '2026-11-01T19:00:00.000Z',
};

/** A temp-dir store with Arun and Mei (and optional expenses), a draft store, and a db.json write counter. */
export async function agentFixture(dir: string, expenses: Expense[] = []) {
  let writes = 0;
  const store = await openStore(join(dir, 'db.json'), {
    fs: {
      rename: async (from, to) => {
        writes++;
        await rename(from, to);
      },
    },
  });
  await store.update((db) => {
    db.people.push({ id: 'arun', name: 'Arun' }, { id: 'mei', name: 'Mei' });
    db.expenses.push(...expenses);
  });
  writes = 0;
  const drafts = createDraftStore();
  /** `userText` holds the user's messages, one per line. */
  const ctx = (userText = ''): ToolContext => ({ store, drafts, today: TODAY, userMessages: userText === '' ? [] : userText.split('\n') });
  return { store, drafts, ctx, writes: () => writes };
}
