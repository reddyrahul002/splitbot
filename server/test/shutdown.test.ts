import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gracefulShutdown, SHUTDOWN_TIMEOUT_MS } from '../src/shutdown';

const never = () => new Promise<void>(() => undefined);

describe('gracefulShutdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('#D1 closes the server, then the store, then exits 0, and the timer never fires', async () => {
    const order: string[] = [];
    const exit = vi.fn((code: number) => void order.push(`exit ${code}`));
    gracefulShutdown({
      closeServer: async () => void order.push('server'),
      closeStore: async () => void order.push('store'),
      exit,
      log: () => undefined,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(order).toEqual(['server', 'store', 'exit 0']);
    await vi.advanceTimersByTimeAsync(SHUTDOWN_TIMEOUT_MS * 2);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the server', { closeServer: never, closeStore: async () => undefined }],
    ['the store', { closeServer: async () => undefined, closeStore: never }],
  ])('#D2 %s hanging → forced exit 1 at 10 seconds, not before', async (_what, closers) => {
    const exit = vi.fn();
    const logs: string[] = [];
    gracefulShutdown({ ...closers, exit, log: (m) => logs.push(m) });
    expect(SHUTDOWN_TIMEOUT_MS).toBe(10_000);
    await vi.advanceTimersByTimeAsync(SHUTDOWN_TIMEOUT_MS - 1);
    expect(exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(logs).toHaveLength(1);
  });

  it('#D3 a close that fails still exits, without printing its error', async () => {
    const exit = vi.fn();
    const logs: string[] = [];
    gracefulShutdown({
      closeServer: async () => undefined,
      closeStore: async () => {
        throw new Error('driver detail');
      },
      exit,
      log: (m) => logs.push(m),
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(logs.join()).not.toContain('driver detail');
  });
});
