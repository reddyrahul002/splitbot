// Keeps a removed row on screen just long enough to animate out.
import { useEffect, useRef, useState } from 'react';
import { EXIT_MS, mergeExiting, prefersReducedMotion, removedItems, type ExitingItem } from './motion';

/**
 * `items` is what's shown. `universe` is everything that exists, when that's more than what's shown, so a row hidden
 * by a filter doesn't animate as if it were deleted.
 */
export function useExitingItems<T>(items: T[], keyOf: (item: T) => string, universe: T[] = items) {
  const [exiting, setExiting] = useState<ExitingItem<T>[]>([]);
  const previous = useRef(items);

  useEffect(() => {
    const gone = removedItems(previous.current, universe, keyOf);
    previous.current = items;
    if (gone.length === 0 || prefersReducedMotion()) return;
    const goneKeys = new Set(gone.map((g) => keyOf(g.item)));
    setExiting((current) => [...current, ...gone]);
    setTimeout(() => setExiting((current) => current.filter((e) => !goneKeys.has(keyOf(e.item)))), EXIT_MS);
  });

  return mergeExiting(items, exiting, keyOf);
}
