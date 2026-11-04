// Helpers for motion: which rows are leaving a list, and whether to animate at all.
import { flushSync } from 'react-dom';

/** How long a removed row stays on screen. Matches the row-out animation in styles.css. */
export const EXIT_MS = 200;
/** How long an amount stays highlighted after it changes. Matches --motion-flash in tokens.css. */
export const FLASH_MS = 600;

export interface ExitingItem<T> {
  item: T;
  /** The key of the item it followed, so it can stay in place while it leaves. */
  afterKey: string | null;
}

/** What was shown before and no longer exists. An item still in `universe` was only filtered out, so it isn't listed. */
export function removedItems<T>(previous: T[], universe: T[], keyOf: (item: T) => string): ExitingItem<T>[] {
  const alive = new Set(universe.map(keyOf));
  return previous.flatMap((item, index) => {
    if (alive.has(keyOf(item))) return [];
    const before = previous[index - 1];
    return [{ item, afterKey: before === undefined ? null : keyOf(before) }];
  });
}

/** The live items with the leaving ones back in their old places. */
export function mergeExiting<T>(items: T[], exiting: ExitingItem<T>[], keyOf: (item: T) => string): { item: T; exiting: boolean }[] {
  const merged = items.map((item) => ({ item, exiting: false }));
  for (const { item, afterKey } of exiting) {
    if (merged.some((m) => keyOf(m.item) === keyOf(item))) continue;
    const after = merged.findIndex((m) => keyOf(m.item) === afterKey);
    merged.splice(after + 1, 0, { item, exiting: true });
  }
  return merged;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Runs the update inside a view transition where the browser has one; otherwise just runs it. */
export function withViewTransition(update: () => void): void {
  if (typeof document === 'undefined' || !('startViewTransition' in document) || prefersReducedMotion()) {
    update();
    return;
  }
  document.startViewTransition(() => flushSync(update));
}
