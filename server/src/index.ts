// Server entry point: loads .env, opens the JSON store and starts the API.
import { resolve } from 'node:path';
import cors from 'cors';
import express from 'express';
import type { ChatMessage } from '@splitbot/shared';
import { createGeminiClient, DEFAULT_GEMINI_MODEL } from './agent/gemini';
import { runAgent } from './agent/loop';
import { createApp } from './app';
import { describeEnv, loadEnv, localToday, REPO_ROOT } from './config';
import { createDraftStore } from './drafts';
import { openStore } from './store';

// Load config before reading any env var.
console.log(describeEnv(loadEnv()));

// A relative DB_PATH is relative to the repo root, where .env lives.
const dbPath = resolve(REPO_ROOT, process.env.DB_PATH || 'server/data/db.json');
const port = Number(process.env.PORT ?? 3001);
const today = localToday;

const store = await openStore(dbPath);
const drafts = createDraftStore();

// Without a key the rest of the API still works; /api/chat answers 503.
const apiKey = process.env.GEMINI_API_KEY?.trim();
const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
const client = apiKey ? createGeminiClient({ apiKey, model }) : undefined;
const agent = client && ((messages: ChatMessage[]) => runAgent(messages, { client, store, drafts, today }));
console.log(client ? `Chat: Gemini model ${model}` : 'Chat: off (no GEMINI_API_KEY)');

const server = express();
server.use(cors({ origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/] }));
server.use(createApp({ store, drafts, today, agent }));
server.listen(port, () => {
  console.log(`SplitBot API on http://localhost:${port} (data: ${dbPath})`);
});
