import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Person } from '@splitbot/shared';
import { avatarTone, AVATAR_TONES, initials } from '../src/avatarLogic';
import { Avatar } from '../src/components/Avatar';
import { AvatarStack } from '../src/components/AvatarStack';

const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const person = (name: string): Person => ({ id: name.toLowerCase(), name });

describe('initials', () => {
  it('#A6 one letter for one name, first and last for several', () => {
    expect(initials('Arun')).toBe('A');
    expect(initials('mei lin')).toBe('ML');
    expect(initials('Anna Maria Lopez')).toBe('AL');
  });

  it('#A7 trims, and a blank name still shows something', () => {
    expect(initials('  arun  ')).toBe('A');
    expect(initials('   ')).toBe('?');
  });

  it('#A8 does not split accents or characters outside the basic plane', () => {
    expect(initials('Élodie')).toBe('É');
    expect(initials('𝒜run')).toBe('𝒜');
  });
});

describe('avatarTone', () => {
  it('#A9 the same person gets the same colour however the name was typed', () => {
    const tone = avatarTone('Arun');
    expect(avatarTone('arun')).toBe(tone);
    expect(avatarTone('  ARUN ')).toBe(tone);
    expect(avatarTone('José')).toBe(avatarTone('José'));
  });

  it('#A10 is always a valid tone', () => {
    for (const name of ['', 'a', 'Arun', 'Mei', 'Kai', 'Bartholomew Featherstonehaugh', '𝒜run']) {
      const tone = avatarTone(name);
      expect(Number.isInteger(tone)).toBe(true);
      expect(tone).toBeGreaterThanOrEqual(1);
      expect(tone).toBeLessThanOrEqual(AVATAR_TONES);
    }
  });

  it('#A11 spreads names across the whole palette instead of bunching them', () => {
    const names = ['Arun', 'Mei', 'Kai', 'Priya', 'Tom', 'Sara', 'Liam', 'Noor', 'Ivan', 'Zoe', 'Omar', 'Ana', 'Ben', 'Chen', 'Dina', 'Elif', 'Farah', 'Gus', 'Hana', 'Jo', 'Lena', 'Max', 'Nia', 'Oscar'];
    const counts = new Map<number, number>();
    for (const name of names) counts.set(avatarTone(name), (counts.get(avatarTone(name)) ?? 0) + 1);
    expect(counts.size).toBe(AVATAR_TONES);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(6);
  });
});

describe('Avatar', () => {
  it('#A12 is decorative: initials stay out of the text, so sentences beside it read cleanly', () => {
    const html = renderToStaticMarkup(<Avatar name="Arun" />);
    expect(html).toContain('data-initials="A"');
    expect(html).toContain('aria-hidden="true"');
    expect(textOf(html)).toBe('');
  });

  it('#A13 the same name renders the same colour', () => {
    const colour = `var(--avatar-${avatarTone('Arun')})`;
    expect(renderToStaticMarkup(<Avatar name="Arun" />)).toContain(colour);
    expect(renderToStaticMarkup(<Avatar name="arun" size="lg" />)).toContain(colour);
  });

  it('#A14 "You" has its own style, an icon rather than initials', () => {
    const html = renderToStaticMarkup(<Avatar name="Me" isYou />);
    expect(html).toContain('avatar-you');
    expect(html).toContain('<svg');
    expect(html).not.toContain('data-initials');
    expect(html).not.toContain('var(--avatar-');
  });

  it('#A15 offers three sizes', () => {
    expect(renderToStaticMarkup(<Avatar name="Arun" />)).toContain('avatar-md');
    expect(renderToStaticMarkup(<Avatar name="Arun" size="sm" />)).toContain('avatar-sm');
    expect(renderToStaticMarkup(<Avatar name="Arun" size="lg" />)).toContain('avatar-lg');
  });
});

describe('AvatarStack', () => {
  const FOUR = ['Arun', 'Mei', 'Kai', 'Priya'].map(person);
  const SIX = [...FOUR, person('Tom'), person('Sara')];

  it('#A16 up to 4 people show with no "+N"', () => {
    const html = renderToStaticMarkup(<AvatarStack people={FOUR} />);
    expect(html.match(/data-initials="[^+"]+"/g)).toHaveLength(4);
    expect(html).not.toContain('data-initials="+');
  });

  it('#A17 past 4 shows the first 4 and "+N"', () => {
    const html = renderToStaticMarkup(<AvatarStack people={SIX} />);
    expect(html.match(/data-initials="[^+"]+"/g)).toHaveLength(4);
    expect(html).toContain('data-initials="+2"');
  });

  it('#A18 screen readers get every name, including the hidden ones', () => {
    const html = renderToStaticMarkup(<AvatarStack people={SIX} />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Arun, Mei, Kai, Priya, Tom, Sara"');
  });

  it('#A19 "you" in the stack uses the You style', () => {
    const html = renderToStaticMarkup(<AvatarStack people={[{ id: 'me', name: 'Me' }, person('Arun')]} />);
    expect(html).toContain('avatar-you');
    expect(html).toContain('aria-label="You, Arun"');
  });

  it('#A20 nobody renders nothing', () => {
    expect(renderToStaticMarkup(<AvatarStack people={[]} />)).toBe('');
  });
});
