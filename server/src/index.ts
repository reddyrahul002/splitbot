// Server entry point: loads .env, opens the JSON store and starts the API.
import 'dotenv/config';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { createApp } from './app';
import { createDraftStore } from './drafts';
import { openStore } from './store';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = process.env.DB_PATH ? resolve(process.env.DB_PATH) : resolve(serverRoot, 'data', 'db.json');
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
