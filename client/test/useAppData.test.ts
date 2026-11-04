import { describe, expect, it, vi } from 'vitest';
import { latestOnly } from '../src/useAppData';

/** A promise the test settles by hand, to force responses to arrive out of order. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('latestOnly', () => {
  it('#47 delivers a single load', async () => {
    const deliver = vi.fn();
    const onError = vi.fn();
    await latestOnly(deliver, onError)(() => Promise.resolve('a'));
    expect(deliver).toHaveBeenCalledWith('a');
    expect(onError).not.toHaveBeenCalled();
  });

  it('#48 an older response arriving last does not overwrite a newer one', async () => {
    const deliver = vi.fn();
    const load = latestOnly<string>(deliver, vi.fn());
    const [older, newer] = [deferred<string>(), deferred<string>()];
    const runs = [load(() => older.promise), load(() => newer.promise)];
    newer.resolve('new');
    older.resolve('old');
    await Promise.all(runs);
    expect(deliver.mock.calls).toEqual([['new']]);
  });

  it('#49 an older failure is ignored once a newer load has started', async () => {
    const deliver = vi.fn();
    const onError = vi.fn();
    const load = latestOnly<string>(deliver, onError);
    const [older, newer] = [deferred<string>(), deferred<string>()];
    const runs = [load(() => older.promise), load(() => newer.promise)];
    older.reject(new Error('old failure'));
    newer.resolve('new');
    await Promise.all(runs);
    expect(onError).not.toHaveBeenCalled();
    expect(deliver.mock.calls).toEqual([['new']]);
  });

  it('#50 the newest failure is reported and nothing is delivered', async () => {
    const deliver = vi.fn();
    const onError = vi.fn();
    const failure = new Error('down');
    await latestOnly(deliver, onError)(() => Promise.reject(failure));
    expect(onError).toHaveBeenCalledWith(failure);
    expect(deliver).not.toHaveBeenCalled();
  });

  it('#51 a throw in the load function counts as a failure', async () => {
    const onError = vi.fn();
    const failure = new Error('sync');
    await latestOnly(vi.fn(), onError)(() => {
      throw failure;
    });
    expect(onError).toHaveBeenCalledWith(failure);
  });
});
