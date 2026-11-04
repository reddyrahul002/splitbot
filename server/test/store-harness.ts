// One way to drive either store, so the contract tests can run the same cases against both.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Document } from 'mongodb';
import { openStore, type Store } from '../src/store';
import { openMongoStore } from '../src/store-mongo';
import { tempDir } from './helpers';
import type { TestMongo } from './mongo-helper';

export interface StoreHarness {
  /** Opens a store on this harness's data. Every call sees the same data; `cleanup` closes them. */
  open(): Promise<Store>;
  /** Puts records straight into the storage, without the store's checks. */
  seedRaw(data: Record<string, Document[]>): Promise<void>;
  /** The stored data, unparsed, for comparing before and after. */
  readRaw(): Promise<unknown>;
  /** Makes the next write of any store from this harness fail. */
  failNextWrite(): void;
  cleanup(): Promise<void>;
}

export async function jsonHarness(): Promise<StoreHarness> {
  const { dir, cleanup } = await tempDir();
  const path = join(dir, 'data', 'db.json');
  let fail = false;
  return {
    open: () =>
      openStore(path, {
        fs: {
          rename: async (from, to) => {
            if (fail) {
              fail = false;
              throw new Error('disk full');
            }
            await rename(from, to);
          },
        },
      }),
    async seedRaw(data) {
      await mkdir(join(dir, 'data'), { recursive: true });
      await writeFile(path, JSON.stringify({ version: 1, people: [], expenses: [], settlements: [], ...data }));
    },
    readRaw: () => readFile(path, 'utf8'),
    failNextWrite: () => {
      fail = true;
    },
    cleanup,
  };
}

export function mongoHarness(mongo: TestMongo): StoreHarness {
  const dbName = mongo.freshDbName();
  const opened: Store[] = [];
  let fail = false;
  return {
    async open() {
      const store = await openMongoStore(mongo.uri, {
        dbName,
        hooks: {
          afterWrites: () => {
            if (fail) {
              fail = false;
              throw new Error('disk full');
            }
          },
        },
      });
      opened.push(store);
      return store;
    },
    seedRaw: (data) => mongo.seed(dbName, data),
    readRaw: () => mongo.read(dbName),
    failNextWrite: () => {
      fail = true;
    },
    async cleanup() {
      await Promise.all(opened.map((store) => store.close()));
    },
  };
}
