// Loads the repo-root .env, whatever folder the server was started from. Never prints values.
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ROOT_ENV_PATH = resolve(REPO_ROOT, '.env');

export interface EnvStatus {
  path: string;
  found: boolean;
  geminiKeySet: boolean;
}

/** Loads `path` into process.env. Variables already set in the shell win. */
export function loadEnv(path: string = ROOT_ENV_PATH): EnvStatus {
  const found = existsSync(path);
  if (found) dotenv.config({ path, quiet: true });
  return { path, found, geminiKeySet: Boolean(process.env.GEMINI_API_KEY) };
}

/** A startup line that says whether config was found, without any values. */
export function describeEnv(status: EnvStatus): string {
  return status.found
    ? `Config: loaded ${status.path} (GEMINI_API_KEY is ${status.geminiKeySet ? 'set' : 'not set'})`
    : `Config: no .env at ${status.path} (GEMINI_API_KEY is ${status.geminiKeySet ? 'set' : 'not set; copy .env.example'})`;
}
