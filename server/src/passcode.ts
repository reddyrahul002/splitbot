// Checks the APP_PASSCODE header. Never logs or returns either value.
import { createHash, timingSafeEqual } from 'node:crypto';

export const PASSCODE_HEADER = 'x-app-passcode';

const digest = (text: string) => createHash('sha256').update(text).digest();

/** The header carries encodeURIComponent(passcode), because a header can't hold non-Latin text. Hashing makes the lengths equal, so the comparison takes the same time for any guess. */
export function passcodeMatches(header: string | undefined, passcode: string): boolean {
  if (!header) return false;
  return timingSafeEqual(digest(header), digest(encodeURIComponent(passcode)));
}
