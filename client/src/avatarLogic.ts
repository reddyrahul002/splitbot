// Pure helpers for avatars: what they show and which colour they get.

/** How many --avatar-N colours tokens.css defines. */
export const AVATAR_TONES = 8;

const normalize = (name: string) => name.trim().normalize('NFC');

/** First letter of the first and last names. Array.from keeps characters outside the basic plane whole. */
export function initials(name: string): string {
  const words = normalize(name).split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const firstLetter = (word: string) => Array.from(word)[0]!;
  const first = firstLetter(words[0]!);
  return (words.length > 1 ? first + firstLetter(words.at(-1)!) : first).toUpperCase();
}

/** 1 to AVATAR_TONES, from an FNV-1a hash of the name, so the same person has the same colour everywhere. */
export function avatarTone(name: string): number {
  let hash = 0x811c9dc5;
  for (const char of normalize(name).toLowerCase()) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193);
  }
  // FNV's low bits barely mix and % 8 reads only those, so fold the high bits in first.
  hash ^= hash >>> 16;
  hash ^= hash >>> 8;
  return ((hash >>> 0) % AVATAR_TONES) + 1;
}
