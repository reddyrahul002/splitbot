import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { describeEnv, loadEnv, ROOT_ENV_PATH } from '../src/config';
import { tempDir } from './helpers';

const FAKE_KEY = 'fake-key-must-never-be-printed';
const KEYS = ['GEMINI_API_KEY', 'SPLITBOT_TEST_VAR'] as const;

let dir: string;
let cleanup: () => Promise<void>;
let saved: Partial<Record<(typeof KEYS)[number], string>>;

beforeEach(async () => {
  ({ dir, cleanup } = await tempDir());
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(async () => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  await cleanup();
});

describe('loadEnv', () => {
  it('reads the repo-root .env, not one relative to the start folder', () => {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
    expect(ROOT_ENV_PATH).toBe(join(repoRoot, '.env'));
  });

  it('loads the file and reports only whether the key is set, never values', async () => {
    const path = join(dir, '.env');
    await writeFile(path, `GEMINI_API_KEY=${FAKE_KEY}\nSPLITBOT_TEST_VAR=hello\n`);
    const status = loadEnv(path);
    expect(process.env.SPLITBOT_TEST_VAR).toBe('hello');
    expect(status).toEqual({ path, found: true, geminiKeySet: true });
    expect(describeEnv(status)).toBe(`Config: loaded ${path} (GEMINI_API_KEY is set)`);
    expect(JSON.stringify(status) + describeEnv(status)).not.toContain(FAKE_KEY);
  });

  it('a missing file is reported, not thrown', () => {
    const path = join(dir, 'missing.env');
    const status = loadEnv(path);
    expect(status).toEqual({ path, found: false, geminiKeySet: false });
    expect(describeEnv(status)).toBe(`Config: no .env at ${path} (GEMINI_API_KEY is not set; copy .env.example)`);
  });
});
