import { describe, expect, it } from 'vitest';
import { createAccessFlow, RETRY_MS, SLOW_CHECK_MS, wakingText, type AccessState } from '../src/accessFlow';
import { ApiRequestError, UNREACHABLE_MESSAGE } from '../src/api';

const unreachable = () => new ApiRequestError(0, 'SERVER_UNREACHABLE', UNREACHABLE_MESSAGE);
const required = (message = 'Enter the passcode to unlock SplitBot.') => new ApiRequestError(401, 'PASSCODE_REQUIRED', message);
const limited = () => new ApiRequestError(429, 'RATE_LIMITED', 'Too many wrong passcodes. Try again in 15 minutes.');
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

/** A flow over fakes. `answers` are what each check does, in order; the last repeats. A promise holds the check open. */
function setup(answers: (Error | null | Promise<void>)[], stored: string | null = null) {
  const states: AccessState[] = [];
  const checks: (string | null)[] = [];
  const timers: { fn: () => void; ms: number; cancelled: boolean }[] = [];
  let storedValue = stored;
  let next = 0;

  const flow = createAccessFlow({
    check: async (passcode) => {
      checks.push(passcode);
      const answer = answers[Math.min(next++, answers.length - 1)];
      if (answer instanceof Error) throw answer;
      await answer;
    },
    storage: {
      get: () => storedValue,
      save: (value) => {
        storedValue = value;
      },
      clear: () => {
        storedValue = null;
      },
    },
    wait: (fn, ms) => {
      const timer = { fn, ms, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
    onChange: (state) => states.push(state),
  });

  return {
    flow,
    checks,
    timers,
    state: () => states.at(-1),
    stored: () => storedValue,
    /** Fires the first live timer of this length. */
    fire: async (ms: number) => {
      const timer = timers.find((t) => t.ms === ms && !t.cancelled);
      if (!timer) throw new Error(`No live ${ms}ms timer`);
      timer.cancelled = true;
      timer.fn();
      await flush();
    },
    live: (ms: number) => timers.filter((t) => t.ms === ms && !t.cancelled).length,
  };
}

describe('starting', () => {
  it('#G1 starts by checking, with whatever passcode is stored', async () => {
    const fx = setup([new Promise(() => {})], 'stored-code');
    fx.flow.start();
    await flush();
    expect(fx.state()).toEqual({ kind: 'checking' });
    expect(fx.checks).toEqual(['stored-code']);
  });

  it('#G2 with no gate on the server, it opens without asking', async () => {
    const fx = setup([null]);
    fx.flow.start();
    await flush();
    expect(fx.checks).toEqual([null]);
    expect(fx.state()).toEqual({ kind: 'unlocked' });
    expect(fx.stored()).toBeNull();
  });

  it('#G3 a good stored passcode opens without asking, as after a reload', async () => {
    const fx = setup([null], 'stored-code');
    fx.flow.start();
    await flush();
    expect(fx.state()).toEqual({ kind: 'unlocked' });
    expect(fx.stored()).toBe('stored-code');
  });

  it('#G4 no passcode on a gated server asks for one, with no error yet', async () => {
    const fx = setup([required()]);
    fx.flow.start();
    await flush();
    expect(fx.state()).toEqual({ kind: 'locked', error: null, busy: false });
  });

  it('#G5 a stored passcode that no longer works is forgotten', async () => {
    const fx = setup([required("That passcode isn't right.")], 'old-code');
    fx.flow.start();
    await flush();
    expect(fx.stored()).toBeNull();
    expect(fx.state()).toEqual({ kind: 'locked', error: null, busy: false });
  });
});

describe('a sleeping server', () => {
  it('#G6 an unreachable server is waking, never locked or open', async () => {
    const fx = setup([unreachable()]);
    fx.flow.start();
    await flush();
    expect(fx.state()).toEqual({ kind: 'waking', attempts: 1 });
  });

  it('#G7 it retries, counting attempts, until the server answers', async () => {
    const fx = setup([unreachable(), unreachable(), null]);
    fx.flow.start();
    await flush();
    await fx.fire(RETRY_MS);
    expect(fx.state()).toEqual({ kind: 'waking', attempts: 2 });
    await fx.fire(RETRY_MS);
    expect(fx.state()).toEqual({ kind: 'unlocked' });
    expect(fx.checks).toHaveLength(3);
    expect(fx.live(RETRY_MS)).toBe(0);
  });

  it('#G8 a check that just hangs also says waking, because a proxy can hold it open during a cold start', async () => {
    const fx = setup([new Promise(() => {})]);
    fx.flow.start();
    await flush();
    await fx.fire(SLOW_CHECK_MS);
    expect(fx.state()).toEqual({ kind: 'waking', attempts: 0 });
  });

  it('#G9 a quick answer cancels that timer, so it cannot overwrite the result', async () => {
    const fx = setup([null]);
    fx.flow.start();
    await flush();
    expect(fx.live(SLOW_CHECK_MS)).toBe(0);
    expect(fx.state()).toEqual({ kind: 'unlocked' });
  });

  it('#G10 a server that wakes up on a gated app then asks for the passcode', async () => {
    const fx = setup([unreachable(), required()]);
    fx.flow.start();
    await flush();
    await fx.fire(RETRY_MS);
    expect(fx.state()).toEqual({ kind: 'locked', error: null, busy: false });
  });

  it('#G11 stopping cancels retries, so nothing runs after the page goes', async () => {
    const fx = setup([unreachable(), null]);
    fx.flow.start();
    await flush();
    fx.flow.stop();
    expect(fx.live(RETRY_MS)).toBe(0);
    expect(fx.checks).toHaveLength(1);
  });

  it('#G12 an answer arriving after stopping changes nothing', async () => {
    let answer = () => {};
    const fx = setup([new Promise<void>((resolve) => (answer = resolve))]);
    fx.flow.start();
    await flush();
    fx.flow.stop();
    answer();
    await flush();
    expect(fx.state()).toEqual({ kind: 'checking' });
  });
});

describe('other server errors', () => {
  it('#G13 an error from our own server opens the app, which shows it in the panels; the server still enforces the gate', async () => {
    const fx = setup([new ApiRequestError(500, 'INTERNAL', 'Something went wrong on the server.')]);
    fx.flow.start();
    await flush();
    expect(fx.state()).toEqual({ kind: 'unlocked' });
  });
});

describe('submitting a passcode', () => {
  async function locked(answers: (Error | null | Promise<void>)[]) {
    const fx = setup([required(), ...answers]);
    fx.flow.start();
    await flush();
    return fx;
  }

  it('#G14 the right passcode is checked, then stored, then opens', async () => {
    const fx = await locked([null]);
    fx.flow.submit('right-code');
    await flush();
    expect(fx.checks.at(-1)).toBe('right-code');
    expect(fx.stored()).toBe('right-code');
    expect(fx.state()).toEqual({ kind: 'unlocked' });
  });

  it('#G15 a wrong passcode shows the server message and is never stored', async () => {
    const fx = await locked([required("That passcode isn't right.")]);
    fx.flow.submit('wrong-code');
    await flush();
    expect(fx.stored()).toBeNull();
    expect(fx.state()).toEqual({ kind: 'locked', error: "That passcode isn't right.", busy: false });
  });

  it('#G16 it is busy while checking, and clears the old error', async () => {
    const fx = await locked([required("That passcode isn't right."), new Promise(() => {})]);
    fx.flow.submit('wrong-code');
    await flush();
    fx.flow.submit('another');
    await flush();
    expect(fx.state()).toEqual({ kind: 'locked', error: null, busy: true });
  });

  it('#G17 too many guesses shows the wait, and stays locked', async () => {
    const fx = await locked([limited()]);
    fx.flow.submit('guess');
    await flush();
    expect(fx.state()).toEqual({ kind: 'locked', error: 'Too many wrong passcodes. Try again in 15 minutes.', busy: false });
    expect(fx.stored()).toBeNull();
  });

  it('#G18 a blank passcode is not sent, because it would use nothing but a request', async () => {
    const fx = await locked([null]);
    const before = fx.checks.length;
    fx.flow.submit('   ');
    await flush();
    expect(fx.checks).toHaveLength(before);
    expect(fx.state()).toEqual({ kind: 'locked', error: null, busy: false });
  });

  it('#G19 spaces around a pasted passcode are dropped, as the server does', async () => {
    const fx = await locked([null]);
    fx.flow.submit('  right-code \n');
    await flush();
    expect(fx.checks.at(-1)).toBe('right-code');
    expect(fx.stored()).toBe('right-code');
  });

  it('#G20 if the server sleeps mid-submit, the typed passcode is kept and retried, and stored only once it works', async () => {
    const fx = await locked([unreachable(), null]);
    fx.flow.submit('right-code');
    await flush();
    expect(fx.state()).toEqual({ kind: 'waking', attempts: 1 });
    expect(fx.stored()).toBeNull();
    await fx.fire(RETRY_MS);
    expect(fx.checks.at(-1)).toBe('right-code');
    expect(fx.stored()).toBe('right-code');
    expect(fx.state()).toEqual({ kind: 'unlocked' });
  });

  it('#G21 a wrong passcode retried after a sleep still reports as wrong', async () => {
    const fx = await locked([unreachable(), required("That passcode isn't right.")]);
    fx.flow.submit('wrong-code');
    await flush();
    await fx.fire(RETRY_MS);
    expect(fx.state()).toEqual({ kind: 'locked', error: "That passcode isn't right.", busy: false });
  });
});

describe('locked mid-session', () => {
  it('#G22 a 401 while open forgets the passcode and asks again, saying why', async () => {
    const fx = setup([null], 'old-code');
    fx.flow.start();
    await flush();
    fx.flow.lock();
    expect(fx.stored()).toBeNull();
    expect(fx.state()).toEqual({ kind: 'locked', error: 'Enter the passcode again.', busy: false });
  });

  it('#G23 a 401 from the check itself does not double up: the wrong-passcode message stays', async () => {
    const fx = setup([required(), required("That passcode isn't right.")]);
    fx.flow.start();
    await flush();
    fx.flow.submit('wrong-code');
    fx.flow.lock();
    await flush();
    expect(fx.state()).toEqual({ kind: 'locked', error: "That passcode isn't right.", busy: false });
  });
});

describe('wakingText', () => {
  it('#G24 first says what is happening and how long it takes', () => {
    expect(wakingText(0).title).toBe('Waking up the server…');
    expect(wakingText(0).detail).toContain('about a minute');
    expect(wakingText(17).title).toBe('Waking up the server…');
  });

  it('#G25 after about 90 seconds it says something is wrong, and that it is still trying', () => {
    const text = wakingText(18);
    expect(text.title).not.toContain('Waking');
    expect(text.detail).toContain(UNREACHABLE_MESSAGE);
    expect(text.detail).toContain('Still trying');
    expect(RETRY_MS * 18).toBe(90_000);
  });
});
