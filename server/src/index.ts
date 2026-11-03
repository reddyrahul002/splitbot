// Server entry point: loads .env, opens the JSON store and starts the API.
import { resolve } from 'node:path';
import cors from 'cors';
import express from 'express';
import { createApp } from './app';
import { describeEnv, loadEnv, REPO_ROOT } from './config';
import { createDraftStore } from './drafts';
import { openStore } from './store';

// Load config before reading any env var.
console.log(describeEnv(loadEnv()));

// A relative DB_PATH is relative to the repo root, where .env lives.
const dbPath = resolve(REPO_ROOT, process.env.DB_PATH || 'server/data/db.json');
const port = Number(process.env.PORT ?? 3001);

/** Today in the server's local time zone, as YYYY-MM-DD. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const store = await openStore(dbPath);
const server = express();
server.use(cors({ origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/] }));
server.use(createApp({ store, drafts: createDraftStore(), today }));
server.listen(port, () => {
  console.log(`SplitBot API on http://localhost:${port} (data: ${dbPath})`);
});
