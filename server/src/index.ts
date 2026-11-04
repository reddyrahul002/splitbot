// Server entry point: loads .env, opens the store (JSON or Mongo) and starts the API.
import { resolve } from 'node:path';
import cors from 'cors';
import express from 'express';
import type { ChatMessage } from '@splitbot/shared';
import { createGeminiClient, DEFAULT_GEMINI_MODEL } from './agent/gemini';
import { runAgent } from './agent/loop';
import { createApp } from './app';
import { describeEnv, loadEnv, localToday, passcodeFromEnv, productionConfigProblem, REPO_ROOT, serverAddress } from './config';
import { createDraftStore } from './drafts';
import { CHAT_LIMITS, createRateLimiter } from './rate-limit';
import { gracefulShutdown } from './shutdown';
import { openConfiguredStore, storeConfigFromEnv } from './store-select';

// Load config before reading any env var.
console.log(describeEnv(loadEnv()));

// Stop before opening anything, rather than run with the API open or data about to be lost.
const problem = productionConfigProblem(process.env);
if (problem) throw new Error(problem);

// A relative DB_PATH is relative to the repo root, where .env lives.
const dbPath = resolve(REPO_ROOT, process.env.DB_PATH || 'server/data/db.json');
const { port, host } = serverAddress(process.env);
const today = localToday;
const passcode = passcodeFromEnv(process.env);
console.log(`Passcode gate: ${passcode ? 'on' : 'off (no APP_PASSCODE)'}`);

const store = await openConfiguredStore(storeConfigFromEnv(process.env, dbPath));
const drafts = createDraftStore();

// Without a key the rest of the API still works; /api/chat answers 503.
const apiKey = process.env.GEMINI_API_KEY?.trim();
const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
const client = apiKey ? createGeminiClient({ apiKey, model }) : undefined;
const agent = client && ((messages: ChatMessage[]) => runAgent(messages, { client, store, drafts, today }));
console.log(client ? `Chat: Gemini model ${model}` : 'Chat: off (no GEMINI_API_KEY)');

const server = express();
server.use(cors({ origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/] }));
server.use(createApp({ store, drafts, today, agent, passcode, chatLimiter: createRateLimiter(CHAT_LIMITS) }));
const listener = server.listen(port, host, () => {
  console.log(`SplitBot API on http://${host}:${port} (data: ${store.path})`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    gracefulShutdown({
      closeServer: () => new Promise((resolve) => listener.close(() => resolve())),
      closeStore: () => store.close(),
      exit: (code) => process.exit(code),
      log: (message) => console.error(message),
    });
  });
}
