// A real mongod for the tests (a replica set, because transactions need one), and raw access that skips the store.
import { MongoClient, type Db as MongoDb, type Document } from 'mongodb';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

/** Long enough for the first run's binary check and for mongod to start. */
export const MONGO_START_TIMEOUT_MS = 120_000;
export const MONGO_TEST_TIMEOUT_MS = 30_000;

const COLLECTIONS = ['meta', 'people', 'expenses', 'settlements', 'groups'] as const;

let dbCounter = 0;

export interface TestMongo {
  uri: string;
  /** A database name no other test uses. */
  freshDbName(): string;
  /** Direct access, for changing data the way another writer would. */
  db(dbName: string): MongoDb;
  /** Inserts records as stored documents: `id` → `_id`, list position → `seq`. */
  seed(dbName: string, data: Record<string, Document[]>): Promise<void>;
  /** Every collection's documents in stored order, for comparing before and after. */
  read(dbName: string): Promise<Record<string, Document[]>>;
  stop(): Promise<void>;
}

export async function startMongo(): Promise<TestMongo> {
  const server = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = server.getUri();
  const client = await new MongoClient(uri).connect();
  return {
    uri,
    freshDbName: () => `splitbot_test_${process.pid}_${++dbCounter}`,
    db: (dbName) => client.db(dbName),
    async seed(dbName, data) {
      for (const [name, records] of Object.entries(data)) {
        if (records.length === 0) continue;
        const docs = records.map(({ id, ...rest }, seq) => ({ _id: id, seq, ...rest }));
        await client.db(dbName).collection<Document>(name).insertMany(docs);
      }
    },
    async read(dbName) {
      const out: Record<string, Document[]> = {};
      for (const name of COLLECTIONS) {
        out[name] = await client.db(dbName).collection(name).find().sort({ seq: 1, _id: 1 }).toArray();
      }
      return out;
    },
    async stop() {
      await client.close();
      await server.stop();
    },
  };
}
