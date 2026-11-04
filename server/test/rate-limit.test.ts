import { describe, expect, it } from 'vitest';
import { CHAT_LIMITS, createRateLimiter, PASSCODE_FAILURE_LIMITS, waitText } from '../src/rate-limit';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

function clocked(windows: Parameters<typeof createRateLimiter>[0]) {
  let now = 1_000_000;
  return {
    limiter: createRateLimiter(windows, () => now),
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('createRateLimiter', () => {
  it('#R1 allows up to the limit, then says how long to wait', () => {
    const { limiter } = clocked([{ limit: 2, windowMs: MINUTE }]);
    expect(limiter.waitSeconds()).toBe(0);
    limiter.record();
    expect(limiter.waitSeconds()).toBe(0);
    limiter.record();
    expect(limiter.waitSeconds()).toBe(60);
  });

  it('#R2 checking does not use up the allowance', () => {
    const { limiter } = clocked([{ limit: 1, windowMs: MINUTE }]);
    for (let i = 0; i < 5; i++) expect(limiter.waitSeconds()).toBe(0);
  });

  it('#R3 the wait counts down and rounds up, so retrying then always works', () => {
    const { limiter, advance } = clocked([{ limit: 1, windowMs: MINUTE }]);
    limiter.record();
    advance(59_500);
    expect(limiter.waitSeconds()).toBe(1);
    advance(499);
    expect(limiter.waitSeconds()).toBe(1);
  });

  it('#R4 frees up exactly when the window has passed', () => {
    const { limiter, advance } = clocked([{ limit: 1, windowMs: MINUTE }]);
    limiter.record();
    advance(MINUTE);
    expect(limiter.waitSeconds()).toBe(0);
  });

  it('#R5 the window slides: each use expires on its own', () => {
    const { limiter, advance } = clocked([{ limit: 2, windowMs: MINUTE }]);
    limiter.record();
    advance(40_000);
    limiter.record();
    expect(limiter.waitSeconds()).toBe(20);
    advance(20_000);
    expect(limiter.waitSeconds()).toBe(0);
    limiter.record();
    expect(limiter.waitSeconds()).toBe(40);
  });

  it('#R6 with two windows, the longest wait wins', () => {
    const { limiter, advance } = clocked([
      { limit: 2, windowMs: MINUTE },
      { limit: 3, windowMs: DAY },
    ]);
    limiter.record();
    limiter.record();
    expect(limiter.waitSeconds()).toBe(60);
    advance(MINUTE);
    limiter.record();
    expect(limiter.waitSeconds()).toBe((DAY - MINUTE) / 1000);
  });

  it('#R7 does not keep old uses forever', () => {
    const { limiter, advance } = clocked([{ limit: 2, windowMs: MINUTE }]);
    for (let i = 0; i < 1000; i++) {
      limiter.record();
      advance(MINUTE);
    }
    expect(limiter.size()).toBeLessThanOrEqual(2);
  });
});

describe('the limits in use', () => {
  it('#R8 chat allows 10 a minute and 80 a day', () => {
    expect(CHAT_LIMITS).toEqual([
      { limit: 10, windowMs: MINUTE },
      { limit: 80, windowMs: DAY },
    ]);
  });

  it('#R9 chat really stops at 80 in a day, spread out enough to pass the minute limit', () => {
    const { limiter, advance } = clocked(CHAT_LIMITS);
    for (let i = 0; i < 80; i++) {
      expect(limiter.waitSeconds()).toBe(0);
      limiter.record();
      advance(MINUTE);
    }
    expect(limiter.waitSeconds()).toBeGreaterThan(60);
  });

  it('#R10 passcode guesses allow 10 in 15 minutes', () => {
    expect(PASSCODE_FAILURE_LIMITS).toEqual([{ limit: 10, windowMs: 15 * MINUTE }]);
  });
});

describe('waitText', () => {
  it('#R11 reads naturally at every scale', () => {
    expect(waitText(1)).toBe('1 second');
    expect(waitText(45)).toBe('45 seconds');
    expect(waitText(60)).toBe('1 minute');
    expect(waitText(61)).toBe('2 minutes');
    expect(waitText(3600)).toBe('1 hour');
    expect(waitText(3601)).toBe('2 hours');
  });
});
