import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '@splitbot/shared';
import { systemPrompt } from '../src/agent/prompt';

describe('system prompt', () => {
  // 36
  it('has the date, categories, people and the core rules', () => {
    const people = [
      { id: 'me', name: 'Me' },
      { id: 'arun', name: 'Arun' },
      { id: 'mei', name: 'Mei' },
    ];
    const prompt = systemPrompt({ today: '2026-11-03', people });
    expect(prompt).toContain('2026-11-03');
    expect(prompt).toContain('Tuesday');
    for (const c of CATEGORIES) expect(prompt).toContain(c);
    expect(prompt).toContain('Arun');
    expect(prompt).toContain('Mei');
    expect(prompt).toMatch(/"me"/);
    expect(prompt).toMatch(/no payer[^.]*\bme\b/i);
    expect(prompt).toMatch(/first (number|percentage|share)[^.]*\bme\b/i);
    expect(prompt).toMatch(/ask[^.]*instead of guessing/i);
    expect(prompt).toMatch(/never (add|compute|calculate)/i);
    expect(prompt).toMatch(/dollars/i);
    expect(prompt).toMatch(/only[^.]*tool results/i);
  });

  it('works out the weekday from the given date, not the clock', () => {
    expect(systemPrompt({ today: '2027-01-01', people: [] })).toContain('Friday');
  });
});
