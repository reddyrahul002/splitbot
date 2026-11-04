// Decides what stands in front of the app: checking, a sleeping server, the unlock screen, or the app itself.
// This is only about what to show. The server enforces the gate whatever the client does.
import { ApiRequestError, UNREACHABLE_MESSAGE } from './api';

export type AccessState =
  | { kind: 'checking' }
  /** The server isn't answering yet. `attempts` is how many checks have failed. */
  | { kind: 'waking'; attempts: number }
  | { kind: 'locked'; error: string | null; busy: boolean }
  | { kind: 'unlocked' };

export const RETRY_MS = 5000;
/** A proxy can hold a request open during a cold start, so a check this slow says waking without waiting for it to fail. */
export const SLOW_CHECK_MS = 2000;
/** About 90 seconds of retries: longer than a cold start should take. */
const GAVE_UP_ATTEMPTS = 18;

export function wakingText(attempts: number): { title: string; detail: string } {
  if (attempts < GAVE_UP_ATTEMPTS) return { title: 'Waking up the server…', detail: 'This can take about a minute.' };
  return { title: "The server isn't answering", detail: `${UNREACHABLE_MESSAGE} Still trying…` };
}

export interface AccessDeps {
  check: (passcode: string | null) => Promise<void>;
  storage: { get: () => string | null; save: (passcode: string) => void; clear: () => void };
  /** Runs `fn` after `ms`, and returns a way to cancel it. */
  wait: (fn: () => void, ms: number) => () => void;
  onChange: (state: AccessState) => void;
}

export function createAccessFlow({ check, storage, wait, onChange }: AccessDeps) {
  let state: AccessState = { kind: 'checking' };
  let attempts = 0;
  /** Bumped by every new check and by stop, so an answer to an older one is ignored. */
  let current = 0;
  let cancelSlow = () => {};
  let cancelRetry = () => {};

  const show = (next: AccessState) => {
    state = next;
    onChange(next);
  };

  /** `typed` means the passcode came from the unlock screen, so it's stored only if it works and its errors are shown. */
  async function run(passcode: string | null, typed: boolean) {
    const id = ++current;
    cancelSlow = wait(() => show({ kind: 'waking', attempts }), SLOW_CHECK_MS);
    const open = () => {
      if (typed && passcode) storage.save(passcode);
      show({ kind: 'unlocked' });
    };
    try {
      await check(passcode);
      if (id !== current) return;
      cancelSlow();
      open();
    } catch (err) {
      if (id !== current) return;
      cancelSlow();
      const code = err instanceof ApiRequestError ? err.code : 'SERVER_UNREACHABLE';
      const message = err instanceof Error ? err.message : '';
      if (code === 'PASSCODE_REQUIRED') {
        storage.clear();
        show({ kind: 'locked', error: typed ? message : null, busy: false });
      } else if (code === 'RATE_LIMITED') {
        show({ kind: 'locked', error: message, busy: false });
      } else if (code === 'SERVER_UNREACHABLE') {
        attempts++;
        show({ kind: 'waking', attempts });
        cancelRetry = wait(() => void run(passcode, typed), RETRY_MS);
      } else {
        // Our own server answered, past the gate, with some other problem. The app's panels know how to show that.
        open();
      }
    }
  }

  return {
    start() {
      show({ kind: 'checking' });
      void run(storage.get(), false);
    },
    submit(text: string) {
      const passcode = text.trim();
      if (!passcode) return;
      cancelRetry();
      cancelSlow();
      attempts = 0;
      show({ kind: 'locked', error: null, busy: true });
      void run(passcode, true);
    },
    /** A request came back locked. Only matters once the app is open: a check handles its own answer. */
    lock() {
      if (state.kind !== 'unlocked') return;
      storage.clear();
      show({ kind: 'locked', error: 'Enter the passcode again.', busy: false });
    },
    stop() {
      current++;
      cancelSlow();
      cancelRetry();
    },
  };
}
