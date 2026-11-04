// The files the hosts read. Nothing here can be tried without deploying, so a typo would otherwise only show up there.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../src/config';

const read = (path: string) => readFile(resolve(REPO_ROOT, path), 'utf8');
const readJson = async (path: string) => JSON.parse(await read(path));

describe('client/vercel.json', () => {
  const config = () => readJson('client/vercel.json');

  it('#V1 forwards /api to Render, keeping the /api prefix the server routes on', async () => {
    const { rewrites } = await config();
    expect(rewrites).toHaveLength(1);
    expect(rewrites[0].source).toBe('/api/:path*');
    expect(rewrites[0].destination).toMatch(/^https:\/\/[^/]+\.onrender\.com\/api\/:path\*$/);
  });

  it('#V2 turns rewrite caching off, so a private response can never come from a cache', async () => {
    const { headers } = await config();
    const api = headers.find((h: { source: string }) => h.source === '/api/:path*');
    expect(api.headers).toContainEqual({ key: 'x-vercel-enable-rewrite-caching', value: '0' });
  });

  it('#V3 builds the Vite app from the workspace root, where the lockfile is', async () => {
    const { framework, installCommand, buildCommand, outputDirectory } = await config();
    expect(framework).toBe('vite');
    expect(installCommand).toBe('cd .. && npm ci -w @splitbot/client');
    expect(buildCommand).toBe('npm run build');
    expect(outputDirectory).toBe('dist');
  });

  it('#V4 holds no secrets or environment values', async () => {
    const text = await read('client/vercel.json');
    expect(/AIza|mongodb(\+srv)?:\/\/|APP_PASSCODE|GEMINI|MONGODB/i.test(text)).toBe(false);
  });
});

describe('scripts and dependencies', () => {
  it('#V5 the client has a build script', async () => {
    expect((await readJson('client/package.json')).scripts.build).toBe('vite build');
  });

  it('#V6 the server has a start script that runs without a watcher', async () => {
    expect((await readJson('server/package.json')).scripts.start).toBe('tsx src/index.ts');
  });

  it('#V7 tsx is a real dependency, because the server runs through it in production', async () => {
    const { dependencies, devDependencies } = await readJson('server/package.json');
    expect(dependencies.tsx).toBeTruthy();
    expect(devDependencies.tsx).toBeUndefined();
  });

  it('#V8 the test-only packages stay dev dependencies, so a production install skips them', async () => {
    const { dependencies, devDependencies } = await readJson('server/package.json');
    for (const name of ['mongodb-memory-server', 'vitest', 'supertest', 'typescript']) {
      expect(devDependencies[name]).toBeTruthy();
      expect(dependencies[name]).toBeUndefined();
    }
  });

  it('#V9 the lockfile agrees, or npm ci on the host would fail', async () => {
    const lock = await readJson('package-lock.json');
    const server = await readJson('server/package.json');
    expect(lock.packages.server.dependencies).toEqual(server.dependencies);
    expect(lock.packages.server.devDependencies).toEqual(server.devDependencies);
    expect(lock.packages['node_modules/tsx'].dev).toBeUndefined();
  });
});

describe('README deploy steps', () => {
  it('#V10 names every setting the host needs', async () => {
    const text = await read('README.md');
    for (const name of ['APP_PASSCODE', 'GEMINI_API_KEY', 'MONGODB_URI', 'STORE', 'GEMINI_MODEL', 'NODE_VERSION', 'TZ', '/healthz']) expect(text).toContain(name);
    expect(text).toContain('npm ci --omit=dev -w @splitbot/server');
    expect(text).toContain('npm start -w @splitbot/server');
    expect(text).toContain('Australia/Melbourne');
  });

  it('#V11 says to replace the placeholder URL, which would otherwise proxy nowhere', async () => {
    const vercel = await read('client/vercel.json');
    expect(vercel).toContain('YOUR-RENDER-SERVICE');
    expect(await read('README.md')).toContain('YOUR-RENDER-SERVICE');
  });

  it('#V12 holds no real secrets', async () => {
    const text = await read('README.md');
    expect(text.includes('AIza')).toBe(false);
    expect(/mongodb(\+srv)?:\/\/[^\s<`]+:[^\s<`]+@/.test(text)).toBe(false);
  });
});
