import { describe, expect, it } from 'vitest';
import type { ChatMessage, Draft, DraftWarning } from '@splitbot/shared';
import { buildHistory, confirmIfValid, createEditQueue, inputProblem, MAX_HISTORY, MAX_TEXT, parseDollars, replaceEditFor } from '../src/draftLogic';

const closeName = (name: string): DraftWarning => ({
  code: 'CLOSE_NAME',
  message: `'${name}' looks like existing person 'Arun'. Use Arun?`,
  suggestion: { name, person: { id: 'arun-id', name: 'Arun' } },
});

const draftWith = (warning: DraftWarning, newName = 'Aroon'): Draft => ({
  id: 'd1',
  kind: 'settlement',
  settlement: { id: 's1', from: `new:${newName.toLowerCase()}`, to: 'me', cents: 100, date: '2026-11-04' },
  newPeople: [{ id: `new:${newName.toLowerCase()}`, name: newName }],
  warnings: [warning],
});

describe('parseDollars', () => {
  it('#1 turns typed dollars into cents', () => {
    expect(parseDollars('90')).toBe(9000);
    expect(parseDollars('12.50')).toBe(1250);
    expect(parseDollars('12.5')).toBe(1250);
    expect(parseDollars('1,800')).toBe(180000);
    expect(parseDollars('$1,800.00')).toBe(180000);
    expect(parseDollars(' 90 ')).toBe(9000);
    expect(parseDollars('0.07')).toBe(7);
  });

  it('#2 rejects anything that is not a whole number of cents', () => {
    for (const bad of ['', 'abc', '-5', '1.005', '1,80', '12.', '.', '1e3', '$', '90 bucks']) {
      expect(parseDollars(bad), bad).toBeNull();
    }
  });
});

describe('replaceEditFor', () => {
  it('#3 builds the "Use Arun" replacement from the warning', () => {
    const warning = closeName('Aroon');
    expect(replaceEditFor(draftWith(warning), warning)).toEqual({ replace: [{ from: 'new:aroon', to: 'arun-id' }] });
  });

  it('#4 matches the new person when case, spacing or accent form differ', () => {
    const lower = closeName(' aroon ');
    expect(replaceEditFor(draftWith(lower), lower)).toEqual({ replace: [{ from: 'new:aroon', to: 'arun-id' }] });
    const decomposed = closeName('José');
    expect(replaceEditFor(draftWith(decomposed, 'José'), decomposed)?.replace?.[0]?.from).toBe('new:josé');
  });

  it('#5 gives no edit when there is nothing to swap', () => {
    const warning = closeName('Aroon');
    expect(replaceEditFor(draftWith(warning, 'Someone'), warning)).toBeNull();
    const amount: DraftWarning = { code: 'AMOUNT_NOT_IN_MESSAGE', message: 'Total $95.00 wasn\'t in your message, please check.' };
    expect(replaceEditFor(draftWith(amount), amount)).toBeNull();
  });
});

describe('buildHistory', () => {
  const turns = (count: number): ChatMessage[] =>
    Array.from({ length: count }, (_, i) => ({ role: i % 2 === 0 ? 'user' : 'model', text: `m${i}` }));

  it('#6 leaves a short history alone', () => {
    expect(buildHistory(turns(3))).toEqual(turns(3));
  });

  it('#7 keeps the most recent messages, up to the server limit', () => {
    const userOnly = turns(MAX_HISTORY + 1).map((m) => ({ ...m, role: 'user' as const }));
    const history = buildHistory(userOnly);
    expect(history).toHaveLength(MAX_HISTORY);
    expect(history.at(-1)?.text).toBe(`m${MAX_HISTORY}`);
  });

  it('#8 starts on a user message after trimming', () => {
    // Alternating turns ending on the user: the 50th from the end is a model turn, so it is dropped too.
    const history = buildHistory(turns(MAX_HISTORY + 1));
    expect(history).toHaveLength(MAX_HISTORY - 1);
    expect(history[0]?.role).toBe('user');
    expect(history.at(-1)?.text).toBe(`m${MAX_HISTORY}`);
  });

  it('#9 caps each text at the server limit', () => {
    const long: ChatMessage[] = [
      { role: 'user', text: 'hi' },
      { role: 'model', text: 'x'.repeat(MAX_TEXT + 500) },
      { role: 'user', text: 'next' },
    ];
    const history = buildHistory(long);
    expect(history[1]?.text).toHaveLength(MAX_TEXT);
    expect(history[2]?.text).toBe('next');
  });
});

describe('inputProblem', () => {
  it('#33 what the card shows, and any valid typed amount, is fine', () => {
    expect(inputProblem({ description: 'Dinner', amount: '$90.00' })).toBeNull();
    expect(inputProblem({ description: ' Lunch ', amount: '12.5' })).toBeNull();
    expect(inputProblem({ amount: '$20.00' })).toBeNull();
    expect(inputProblem({})).toBeNull();
  });

  it('#34 an amount that is not a positive whole number of cents is a problem', () => {
    for (const amount of ['abc', '', '-5', '1.005', '0', '$0.00']) {
      expect(inputProblem({ description: 'Dinner', amount }), amount).toBe('Enter an amount like 12.50.');
    }
  });

  it('#35 an empty description is a problem', () => {
    for (const description of ['', '   ']) {
      expect(inputProblem({ description, amount: '$90.00' })).toBe("The description can't be empty.");
    }
  });
});

describe('confirmIfValid', () => {
  const setup = (typed: { description?: string; amount?: string }) => {
    const calls: string[] = [];
    const queue = createEditQueue();
    const run = () =>
      confirmIfValid({
        typed,
        queue,
        confirm: async () => {
          calls.push('confirm');
        },
        onInvalid: (problem) => {
          calls.push(problem);
        },
      });
    return { calls, queue, run };
  };

  it('#36 an invalid amount: confirm does not run and the error is reported', async () => {
    const { calls, run } = setup({ description: 'Dinner', amount: 'abc' });
    expect(await run()).toBe(false);
    expect(calls).toEqual(['Enter an amount like 12.50.']);
  });

  it('#37 an empty description: confirm does not run and the error is reported', async () => {
    const { calls, run } = setup({ description: ' ', amount: '$90.00' });
    expect(await run()).toBe(false);
    expect(calls).toEqual(["The description can't be empty."]);
  });

  it('#38 valid input: confirm runs', async () => {
    const { calls, run } = setup({ description: 'Dinner', amount: '$90.00' });
    expect(await run()).toBe(true);
    expect(calls).toEqual(['confirm']);
  });

  it('#39 an edit failing in flight stops confirm', async () => {
    const { calls, queue, run } = setup({ description: 'Dinner', amount: '$90.00' });
    queue.run(async () => false);
    expect(await run()).toBe(false);
    expect(calls).toEqual([]);
  });

  it('#40 an edit in flight finishes before confirm runs', async () => {
    const { calls, queue, run } = setup({ description: 'Dinner', amount: '$95.00' });
    queue.run(async () => {
      calls.push('edit');
      return true;
    });
    expect(await run()).toBe(true);
    expect(calls).toEqual(['edit', 'confirm']);
  });
});

describe('confirmIfValid after a finished rejected edit', () => {
  it('#44 the first Confirm stops and reports it; the second saves the values shown', async () => {
    const queue = createEditQueue();
    const calls: string[] = [];
    const run = () =>
      confirmIfValid({
        typed: { description: 'Dinner', amount: '$90.00' },
        queue,
        confirm: async () => {
          calls.push('confirm');
        },
        onInvalid: (problem) => {
          calls.push(problem);
        },
        onEditFailed: () => {
          calls.push('edit failed');
        },
      });

    // The server rejected an edit and the field went back to $90.00, before the mouse button came up.
    await queue.run(async () => false);

    expect(await run()).toBe(false);
    expect(calls).toEqual(['edit failed']);
    expect(await run()).toBe(true);
    expect(calls).toEqual(['edit failed', 'confirm']);
  });
});

describe('createEditQueue', () => {
  /** An action whose finish is controlled by the test. */
  const deferred = () => {
    let finish!: (ok: boolean) => void;
    const promise = new Promise<boolean>((resolve) => {
      finish = resolve;
    });
    return { promise, finish };
  };

  it('#10 runs actions one at a time, in order', async () => {
    const queue = createEditQueue();
    const first = deferred();
    const log: string[] = [];
    queue.run(async () => {
      log.push('first start');
      const ok = await first.promise;
      log.push('first end');
      return ok;
    });
    const second = queue.run(async () => {
      log.push('second');
      return true;
    });
    await Promise.resolve();
    expect(log).toEqual(['first start']);
    first.finish(true);
    await second;
    expect(log).toEqual(['first start', 'first end', 'second']);
  });

  it('#11 settled() is true when nothing is in flight', async () => {
    expect(await createEditQueue().settled()).toBe(true);
  });

  it('#12 settled() waits for an edit in flight and reports its success', async () => {
    const queue = createEditQueue();
    const edit = deferred();
    queue.run(() => edit.promise);
    let done = false;
    const settled = queue.settled().then((ok) => {
      done = true;
      return ok;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    edit.finish(true);
    expect(await settled).toBe(true);
  });

  it('#13 settled() is false when an edit in flight fails, even if a later one succeeds', async () => {
    const queue = createEditQueue();
    queue.run(async () => false);
    queue.run(async () => true);
    expect(await queue.settled()).toBe(false);
  });

  it('#14 a finished failure stops the first Confirm, and only the first', async () => {
    const queue = createEditQueue();
    await queue.run(async () => false);
    expect(await queue.settled()).toBe(false);
    expect(await queue.settled()).toBe(true);
  });

  it('#41 a later successful edit clears a finished failure', async () => {
    const queue = createEditQueue();
    await queue.run(async () => false);
    await queue.run(async () => true);
    expect(await queue.settled()).toBe(true);
  });

  it('#42 a failure after a success still counts', async () => {
    const queue = createEditQueue();
    await queue.run(async () => true);
    await queue.run(async () => false);
    expect(await queue.settled()).toBe(false);
  });

  it('#43 a finished edit that threw counts as a failure too', async () => {
    const queue = createEditQueue();
    await queue.run(() => Promise.reject(new Error('boom')));
    expect(await queue.settled()).toBe(false);
  });

  it('#15 an action that throws counts as failed and the queue keeps going', async () => {
    const queue = createEditQueue();
    expect(await queue.run(() => Promise.reject(new Error('boom')))).toBe(false);
    expect(await queue.run(async () => true)).toBe(true);
  });
});
