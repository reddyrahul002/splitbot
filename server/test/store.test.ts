import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openStore, type Db } from '../src/store';
import { expense, settlement, tempDir } from './helpers';

let dir: string;
let cleanup: () => Promise<void>;
let dbPath: string;

beforeEach(async () => {
  ({ dir, cleanup } = await tempDir());
  dbPath = join(dir, 'data', 'db.json');
});
afterEach(() => cleanup());

const readDb = async (): Promise<Db> => JSON.parse(await readFile(dbPath, 'utf8'));

describe('openStore', () => {
  it('#1 missing file → only me, seed file written, parent directory created', async () => {
    const store = await openStore(dbPath);
    const seed = { version: 1, people: [{ id: 'me', name: 'Me' }], expenses: [], settlements: [] };
    expect(store.snapshot()).toEqual(seed);
    expect(await readDb()).toEqual(seed);
  });

  it('#2 round trip: person, expense and settlement survive a reopen', async () => {
    const store = await openStore(dbPath);
    await store.update((db) => {
      db.people.push({ id: 'arun', name: 'Arun' });
      db.expenses.push(expense('me', { me: 4500, arun: 4500 }));
      db.settlements.push(settlement('arun', 'me', 2000));
    });
    const reopened = await openStore(dbPath);
    expect(reopened.snapshot()).toEqual(store.snapshot());
    expect(reopened.snapshot().expenses).toHaveLength(1);
  });

  it('#3 snapshot() is a copy', async () => {
    const store = await openStore(dbPath);
    store.snapshot().people.push({ id: 'x', name: 'X' });
    expect(store.snapshot().people).toEqual([{ id: 'me', name: 'Me' }]);
  });

  it('#4 corrupt JSON → rejects naming the path, and the file is left alone', async () => {
    await mkdir(join(dir, 'data'));
    await writeFile(dbPath, '{ not json');
    await expect(openStore(dbPath)).rejects.toThrow(dbPath);
    expect(await readFile(dbPath, 'utf8')).toBe('{ not json');
  });

  it('#5 valid JSON with the wrong shape → rejects', async () => {
    await mkdir(join(dir, 'data'));
    const bad = JSON.stringify({ version: 1, people: [], settlements: [] });
    await writeFile(dbPath, bad);
    await expect(openStore(dbPath)).rejects.toThrow(dbPath);
    expect(await readFile(dbPath, 'utf8')).toBe(bad);
  });

  it('#6 a file without me gets me added on load', async () => {
    await mkdir(join(dir, 'data'));
    await writeFile(dbPath, JSON.stringify({ version: 1, people: [{ id: 'arun', name: 'Arun' }], expenses: [], settlements: [] }));
    const store = await openStore(dbPath);
    expect(store.snapshot().people.map((p) => p.id)).toEqual(['me', 'arun']);
    expect((await readDb()).people.map((p) => p.id)).toEqual(['me', 'arun']);
  });
});

describe('update', () => {
  it('#7 atomic write: a rename failure leaves the old file, the cache and no .tmp behind', async () => {
    let failRename = false;
    const store = await openStore(dbPath, {
      fs: {
        rename: async (from, to) => {
          if (failRename) throw new Error('disk full');
          await rename(from, to);
        },
      },
    });
    const before = await readFile(dbPath, 'utf8');
    failRename = true;
    await expect(store.update((db) => db.people.push({ id: 'arun', name: 'Arun' }))).rejects.toThrow('disk full');
    expect(await readFile(dbPath, 'utf8')).toBe(before);
    expect(store.snapshot().people).toEqual([{ id: 'me', name: 'Me' }]);
    expect((await readdir(join(dir, 'data'))).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('#8 after a failed write the next update succeeds', async () => {
    await openStore(dbPath); // seed the file, so opening below doesn't write
    let failRename = true;
    const store = await openStore(dbPath, {
      fs: {
        rename: async (from, to) => {
          if (failRename) {
            failRename = false;
            throw new Error('disk full');
          }
          await rename(from, to);
        },
      },
    });
    await expect(store.update((db) => db.people.push({ id: 'arun', name: 'Arun' }))).rejects.toThrow('disk full');
    await store.update((db) => db.people.push({ id: 'mei', name: 'Mei' }));
    expect(store.snapshot().people.map((p) => p.id)).toEqual(['me', 'mei']);
    expect((await readDb()).people.map((p) => p.id)).toEqual(['me', 'mei']);
  });

  it('#9 an update fn that throws → rejects, nothing written, queue continues', async () => {
    const store = await openStore(dbPath);
    const before = await readFile(dbPath, 'utf8');
    await expect(
      store.update((db) => {
        db.people.push({ id: 'arun', name: 'Arun' });
        throw new Error('nope');
      }),
    ).rejects.toThrow('nope');
    expect(await readFile(dbPath, 'utf8')).toBe(before);
    expect(store.snapshot().people).toHaveLength(1);
    await store.update((db) => db.people.push({ id: 'mei', name: 'Mei' }));
    expect(store.snapshot().people.map((p) => p.id)).toEqual(['me', 'mei']);
  });

  it('#10 50 concurrent updates all apply in call order', async () => {
    const store = await openStore(dbPath);
    const ids = Array.from({ length: 50 }, (_, i) => `p${i}`);
    const results = await Promise.all(
      ids.map((id) =>
        store.update((db) => {
          db.people.push({ id, name: id });
          return db.people.length;
        }),
      ),
    );
    expect(results).toEqual(ids.map((_, i) => i + 2));
    expect(store.snapshot().people.slice(1).map((p) => p.id)).toEqual(ids);
    expect((await openStore(dbPath)).snapshot().people.slice(1).map((p) => p.id)).toEqual(ids);
  });
});
