import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { passcodeFromEnv, productionConfigProblem, REPO_ROOT, serverAddress } from '../src/config';

describe('serverAddress', () => {
  it('#E1 uses the PORT it is given, as Render sets it', () => {
    expect(serverAddress({ PORT: '10000' }).port).toBe(10000);
  });

  it('#E2 falls back to 3001 when PORT is unset, empty or blank', () => {
    expect(serverAddress({}).port).toBe(3001);
    // Number('') is 0, which would quietly listen on a random port.
    expect(serverAddress({ PORT: '' }).port).toBe(3001);
    expect(serverAddress({ PORT: '   ' }).port).toBe(3001);
  });

  it.each(['abc', '0', '-1', '65536', '80.5', '3001x'])('#E3 refuses PORT=%s instead of listening somewhere unexpected', (PORT) => {
    expect(() => serverAddress({ PORT })).toThrow(/PORT/);
  });

  it('#E4 binds to 0.0.0.0, which Render requires', () => {
    expect(serverAddress({}).host).toBe('0.0.0.0');
  });
});

describe('passcodeFromEnv', () => {
  it('#E5 reads and trims it', () => {
    expect(passcodeFromEnv({ APP_PASSCODE: '  secret words  ' })).toBe('secret words');
  });

  it('#E6 unset or blank means no gate', () => {
    expect(passcodeFromEnv({})).toBeUndefined();
    expect(passcodeFromEnv({ APP_PASSCODE: '' })).toBeUndefined();
    expect(passcodeFromEnv({ APP_PASSCODE: '   ' })).toBeUndefined();
  });
});

describe('productionConfigProblem', () => {
  const GOOD = { NODE_ENV: 'production', APP_PASSCODE: 'a-real-passcode', STORE: 'mongo' };

  it('#E7 a complete production config is fine', () => {
    expect(productionConfigProblem(GOOD)).toBeNull();
  });

  it('#E8 production with no passcode refuses to start, rather than leaving the API open', () => {
    expect(productionConfigProblem({ ...GOOD, APP_PASSCODE: undefined })).toContain('APP_PASSCODE');
    expect(productionConfigProblem({ ...GOOD, APP_PASSCODE: '   ' })).toContain('APP_PASSCODE');
  });

  it('#E9 production without Mongo refuses to start, because Render resets the JSON file', () => {
    expect(productionConfigProblem({ ...GOOD, STORE: undefined })).toContain('STORE');
    expect(productionConfigProblem({ ...GOOD, STORE: 'json' })).toContain('STORE');
  });

  it('#E10 local dev needs neither', () => {
    expect(productionConfigProblem({})).toBeNull();
    expect(productionConfigProblem({ NODE_ENV: 'development', STORE: 'json' })).toBeNull();
  });

  it('#E11 the message names the setting and never a value', () => {
    const problem = productionConfigProblem({ NODE_ENV: 'production', APP_PASSCODE: 'secret-value', STORE: 'secret-store' });
    expect(problem).not.toBeNull();
    expect(problem).not.toContain('secret');
  });
});

describe('.env.example', () => {
  it('#E12 documents APP_PASSCODE and leaves it empty, as it is committed', async () => {
    const text = await readFile(resolve(REPO_ROOT, '.env.example'), 'utf8');
    const lines = text.split('\n').filter((line) => /^\s*(?:#\s*)?(?:export\s+)?APP_PASSCODE\s*=/.test(line));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line.split('=').slice(1).join('=').replace(/(^|\s)#.*$/, '').trim()).toBe('');
  });
});
