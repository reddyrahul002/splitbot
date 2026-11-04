import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AVATAR_TONES } from '../src/avatarLogic';

const css = readFileSync(resolve(import.meta.dirname, '../src/styles/tokens.css'), 'utf8');

function blockAfter(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`No ${selector} block`);
  const body = css.slice(start + selector.length + 2, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}

const light = blockAfter(':root');
const dark = { ...light, ...blockAfter(":root[data-theme='dark']") };
const THEMES = { light, dark };

function luminance(hex: string | undefined): number {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`Not a 6-digit hex colour: ${hex}`);
  const [r = 0, g = 0, b = 0] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** A missing token throws in luminance, so a typo can't pass. */
function contrast(a: string | undefined, b: string | undefined): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const CATEGORY_TOKENS = ['food', 'groceries', 'transport', 'housing', 'entertainment', 'travel', 'shopping', 'other'];

/** [text, background]: normal text needs 4.5:1. */
const TEXT_PAIRS: [string, string][] = [
  ['--text', '--bg'],
  ['--text', '--surface'],
  ['--text', '--surface-sunken'],
  ['--text-muted', '--bg'],
  ['--text-muted', '--surface'],
  ['--text-muted', '--surface-sunken'],
  ['--owes-me', '--surface'],
  ['--owes-me', '--bg'],
  ['--owes-me', '--owes-me-tint'],
  ['--i-owe', '--surface'],
  ['--i-owe', '--bg'],
  ['--i-owe', '--i-owe-tint'],
  ['--settled', '--surface'],
  ['--warning', '--warning-tint'],
  ['--error', '--surface'],
  ['--error', '--bg'],
  ['--error', '--error-tint'],
  ['--on-primary', '--primary'],
  ['--on-primary', '--primary-hover'],
  ['--on-action', '--action'],
  ['--on-action', '--action-hover'],
  ['--on-danger', '--danger'],
  ['--new-ink', '--new-tint'],
  ['--saved-ink', '--saved-tint'],
  ['--you-ink', '--you-bg'],
];

/** [mark, background]: icons, borders and chart marks need 3:1. */
const GRAPHIC_PAIRS: [string, string][] = [
  ['--focus', '--bg'],
  ['--focus', '--surface'],
  ['--border-strong', '--surface'],
  ['--chart-owes', '--surface'],
  ['--chart-owe', '--surface'],
  ['--chart-spend', '--surface'],
];

describe.each(Object.entries(THEMES))('%s theme', (_name, theme) => {
  it.each(TEXT_PAIRS)('#A35 %s on %s passes AA for text', (text, background) => {
    expect(contrast(theme[text], theme[background])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(GRAPHIC_PAIRS)('#A36 %s on %s passes 3:1 for graphics', (mark, background) => {
    expect(contrast(theme[mark], theme[background])).toBeGreaterThanOrEqual(3);
  });

  it.each(CATEGORY_TOKENS)('#A37 the %s chip ink passes AA on its tint', (token) => {
    expect(contrast(theme[`--cat-${token}-ink`], theme[`--cat-${token}-tint`])).toBeGreaterThanOrEqual(4.5);
  });

  it('#A38 white initials pass AA on every avatar colour', () => {
    for (let tone = 1; tone <= AVATAR_TONES; tone++) {
      expect(contrast(theme['--on-avatar'], theme[`--avatar-${tone}`])).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('category chart colours', () => {
  // These sets passed scripts/validate_palette.js from the dataviz skill in this order. Changing one means validating again.
  it('#A39 stay the validated palette, in CATEGORIES order', () => {
    const marks = (theme: Record<string, string>) => CATEGORY_TOKENS.map((token) => theme[`--cat-${token}`]);
    expect(marks(light)).toEqual(['#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948', '#2a78d6', '#eb6834', '#1baf7a']);
    expect(marks(dark)).toEqual(['#c98500', '#d55181', '#008300', '#9085e9', '#e66767', '#3987e5', '#d95926', '#199e70']);
  });
});

describe('scales', () => {
  it('#A40 spacing is on a 4px base', () => {
    const spacing = Object.entries(light).filter(([name]) => name.startsWith('--space-'));
    expect(spacing.length).toBeGreaterThan(4);
    for (const [, value] of spacing) expect(parseInt(value, 10) % 4).toBe(0);
  });

  it('#A41 has the agreed radius, shadow and type steps', () => {
    expect([light['--radius-sm'], light['--radius-md'], light['--radius-lg']]).toEqual(['8px', '12px', '16px']);
    expect(light['--radius-full']).toBe('999px');
    for (const shadow of ['--shadow-sm', '--shadow-md', '--shadow-lg']) expect(light[shadow]).toBeTruthy();
    const sizes = Object.entries(light)
      .filter(([name]) => name.startsWith('--text-') && /\d$/.test(name))
      .map(([, value]) => parseInt(value, 10));
    expect(Math.min(...sizes)).toBe(12);
    expect(Math.max(...sizes)).toBe(32);
  });
});
