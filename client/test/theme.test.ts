import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { otherTheme, resolveTheme, THEME_KEY } from '../src/themeLogic';

describe('resolveTheme', () => {
  it('#A1 a saved choice wins over the system setting, both ways', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('#A2 with no saved choice it follows the system', () => {
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme(null, false)).toBe('light');
  });

  it('#A3 a value that is not a theme counts as no choice', () => {
    expect(resolveTheme('purple', true)).toBe('dark');
    expect(resolveTheme('', false)).toBe('light');
  });
});

describe('otherTheme', () => {
  it('#A4 flips the theme', () => {
    expect(otherTheme('light')).toBe('dark');
    expect(otherTheme('dark')).toBe('light');
  });
});

describe('pre-paint script', () => {
  it('#A5 reads the same storage key as the hook, so a saved theme has no flash', () => {
    const html = readFileSync(resolve(import.meta.dirname, '../index.html'), 'utf8');
    expect(html).toContain(`'${THEME_KEY}'`);
    expect(html).toContain('prefers-color-scheme: dark');
    // It has to run before the app's module script, or the first paint is the wrong theme.
    expect(html.indexOf(THEME_KEY)).toBeLessThan(html.indexOf('/src/main.tsx'));
  });
});
