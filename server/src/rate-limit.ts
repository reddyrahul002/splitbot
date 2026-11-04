// A small sliding-window limiter, for a single-user app on one instance. Counts live in memory, so a restart resets them.

export interface RateWindow {
  limit: number;
  windowMs: number;
}

export interface RateLimiter {
  /** 0 if allowed now, otherwise the whole seconds to wait. Doesn't use up the allowance. */
  waitSeconds(): number;
  record(): void;
  /** How many uses it's holding on to. */
  size(): number;
}

const MINUTE = 60_000;

/** One chat message can make up to 6 Gemini calls, so 80 a day stays inside the free tier's ~500 requests. */
export const CHAT_LIMITS: RateWindow[] = [
  { limit: 10, windowMs: MINUTE },
  { limit: 80, windowMs: 24 * 60 * MINUTE },
];

/** Wrong passcodes, across all callers. Forwarded IPs can't be trusted through two proxies, so it isn't per IP. */
export const PASSCODE_FAILURE_LIMITS: RateWindow[] = [{ limit: 10, windowMs: 15 * MINUTE }];

export function createRateLimiter(windows: RateWindow[], now: () => number = Date.now): RateLimiter {
  const longest = Math.max(...windows.map((w) => w.windowMs));
  let uses: number[] = [];

  return {
    waitSeconds() {
      const time = now();
      const waits = windows.map(({ limit, windowMs }) => {
        const inWindow = uses.filter((use) => use > time - windowMs);
        // The window has room once enough of the oldest uses have expired.
        const blocking = inWindow[inWindow.length - limit];
        return blocking === undefined ? 0 : blocking + windowMs - time;
      });
      return Math.ceil(Math.max(...waits) / 1000);
    },
    record() {
      const time = now();
      uses = uses.filter((use) => use > time - longest);
      uses.push(time);
    },
    size: () => uses.length,
  };
}

const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? '' : 's'}`;

/** "45 seconds", "2 minutes" or "1 hour", rounded up so it's safe to wait that long. */
export function waitText(seconds: number): string {
  if (seconds < 60) return plural(seconds, 'second');
  if (seconds < 3600) return plural(Math.ceil(seconds / 60), 'minute');
  return plural(Math.ceil(seconds / 3600), 'hour');
}
