import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openConfiguredStore, storeConfigFromEnv } from '../src/store-select';
import { tempDir } from './helpers';

const JSON_PATH = '/data/db.json';

describe('storeConfigFromEnv', () => {
  it.each([[{}], [{ STORE: '' }], [{ STORE: '  ' }], [{ STORE: 'json' }], [{ STORE: ' json ' }], [{ STORE: 'json', MONGODB_URI: 'ignored' }]])(
    '#SEL1 JSON is the default: %j',
    (env) => {
      expect(storeConfigFromEnv(env, JSON_PATH)).toEqual({ kind: 'json', path: JSON_PATH });
    },
  );

  it('#SEL2 STORE=mongo uses MONGODB_URI', () => {
    expect(storeConfigFromEnv({ STORE: 'mongo', MONGODB_URI: ' some-uri ' }, JSON_PATH)).toEqual({ kind: 'mongo', uri: 'some-uri' });
  });

  it.each([[{ STORE: 'mongo' }], [{ STORE: 'mongo', MONGODB_URI: '  ' }]])('#SEL3 STORE=mongo with no URI stops, never falling back to JSON: %j', (env) => {
    expect(() => storeConfigFromEnv(env, JSON_PATH)).toThrow('MONGODB_URI');
  });

  it("#SEL4 an unknown STORE stops, and doesn't repeat the value (it could be a pasted URI)", () => {
    expect(() => storeConfigFromEnv({ STORE: 'secret-value' }, JSON_PATH)).toThrow('STORE must be json or mongo');
    expect(() => storeConfigFromEnv({ STORE: 'secret-value' }, JSON_PATH)).not.toThrow('secret-value');
  });
});

describe('openConfiguredStore', () => {
  let dir: string;
  let cleanup: () => Promise<void>;
  beforeEach(async () => {
    ({ dir, cleanup } = await tempDir());
  });
  afterEach(() => cleanup());

  it('#SEL5 json opens the file store at the path', async () => {
    const path = join(dir, 'db.json');
    const store = await openConfiguredStore({ kind: 'json', path });
    expect(store.path).toBe(path);
    expect(store.snapshot().people).toEqual([{ id: 'me', name: 'Me' }]);
    await store.close();
  });
});
