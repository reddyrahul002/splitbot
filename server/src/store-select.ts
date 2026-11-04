// Picks the store from the environment. JSON is the default; a bad setting stops startup instead of falling back,
// because falling back would quietly save to the wrong place.
import { openStore, type Store } from './store';

export type StoreConfig = { kind: 'json'; path: string } | { kind: 'mongo'; uri: string };

export function storeConfigFromEnv(env: Record<string, string | undefined>, jsonPath: string): StoreConfig {
  const kind = env.STORE?.trim() || 'json';
  if (kind === 'json') return { kind, path: jsonPath };
  // The value isn't repeated: it could be a URI pasted into the wrong variable.
  if (kind !== 'mongo') throw new Error('STORE must be json or mongo.');
  const uri = env.MONGODB_URI?.trim();
  if (!uri) throw new Error('STORE=mongo needs MONGODB_URI in .env (see .env.example).');
  return { kind, uri };
}

export async function openConfiguredStore(config: StoreConfig): Promise<Store> {
  if (config.kind === 'json') return openStore(config.path);
  // Loaded only when used, so JSON mode never touches the driver.
  const { openMongoStore } = await import('./store-mongo');
  return openMongoStore(config.uri);
}
