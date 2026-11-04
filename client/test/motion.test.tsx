import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Person, Settlement } from '@splitbot/shared';
import { HistoryRow } from '../src/components/Expenses';
import { FlashAmount } from '../src/components/FlashAmount';
import { FLASH_MS, mergeExiting, prefersReducedMotion, removedItems, withViewTransition } from '../src/motion';

interface Row {
  id: string;
}
const row = (id: string): Row => ({ id });
const keyOf = (r: Row) => r.id;
const ids = (rows: { item: Row }[]) => rows.map((r) => r.item.id);

describe('removedItems', () => {
  it('#C27 finds what has gone, and what it sat after', () => {
    expect(removedItems([row('a'), row('b'), row('c')], [row('a'), row('c')], keyOf)).toEqual([{ item: row('b'), afterKey: 'a' }]);
  });

  it('#C28 the first item has nothing before it', () => {
    expect(removedItems([row('a'), row('b')], [row('b')], keyOf)).toEqual([{ item: row('a'), afterKey: null }]);
  });

  it('#C29 nothing gone, or items added, finds nothing', () => {
    expect(removedItems([row('a')], [row('a')], keyOf)).toEqual([]);
    expect(removedItems([row('a')], [row('a'), row('b')], keyOf)).toEqual([]);
    expect(removedItems([], [], keyOf)).toEqual([]);
  });

  it('#C30 an item still in the full list was only filtered out, so it does not animate as deleted', () => {
    const shown = [row('a'), row('b')];
    const all = [row('a'), row('b')];
    expect(removedItems(shown, all, keyOf)).toEqual([]);
  });
});

describe('mergeExiting', () => {
  it('#C31 marks live items as not exiting', () => {
    expect(mergeExiting([row('a')], [], keyOf)).toEqual([{ item: row('a'), exiting: false }]);
  });

  it('#C32 puts an exiting item back where it was', () => {
    const merged = mergeExiting([row('a'), row('c')], [{ item: row('b'), afterKey: 'a' }], keyOf);
    expect(ids(merged)).toEqual(['a', 'b', 'c']);
    expect(merged[1]?.exiting).toBe(true);
  });

  it('#C33 the first item goes back first', () => {
    expect(ids(mergeExiting([row('b')], [{ item: row('a'), afterKey: null }], keyOf))).toEqual(['a', 'b']);
  });

  it('#C34 neighbours removed together stay in order', () => {
    const exiting = [
      { item: row('b'), afterKey: 'a' },
      { item: row('c'), afterKey: 'b' },
    ];
    expect(ids(mergeExiting([row('a'), row('d')], exiting, keyOf))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('#C35 an item that came back is not shown twice', () => {
    expect(ids(mergeExiting([row('a')], [{ item: row('a'), afterKey: null }], keyOf))).toEqual(['a']);
  });

  it('#C36 a lost neighbour puts it first, rather than dropping it', () => {
    expect(ids(mergeExiting([row('a')], [{ item: row('b'), afterKey: 'gone' }], keyOf))).toEqual(['b', 'a']);
  });
});

describe('browser helpers without a browser', () => {
  it('#C37 reduced motion reads as false', () => {
    expect(prefersReducedMotion()).toBe(false);
  });

  it('#C38 a view transition falls back to just doing the update', () => {
    const update = vi.fn();
    withViewTransition(update);
    expect(update).toHaveBeenCalledOnce();
  });
});

describe('FlashAmount', () => {
  it('#C39 starts with no highlight and adds no wrapper', () => {
    expect(renderToStaticMarkup(<FlashAmount value={100} className="owes-me">$1.00</FlashAmount>)).toBe('<strong class="owes-me">$1.00</strong>');
    expect(renderToStaticMarkup(<FlashAmount value={100}>$1.00</FlashAmount>)).toBe('<strong>$1.00</strong>');
  });
});

describe('HistoryRow leaving', () => {
  const PEOPLE: Person[] = [{ id: 'me', name: 'Me' }, { id: 'arun', name: 'Arun' }];
  const PAID: Settlement = { id: 'p', from: 'arun', to: 'me', cents: 100, date: '2026-11-03' };
  const render = (exiting: boolean) =>
    renderToStaticMarkup(<HistoryRow item={{ kind: 'settlement', settlement: PAID }} people={PEOPLE} confirming={false} busy={false} exiting={exiting} onAsk={() => {}} onCancel={() => {}} onDelete={() => {}} />);

  it('#C40 a leaving row cannot be clicked or focused', () => {
    const html = render(true);
    expect(html).toContain('class="history-row exiting"');
    expect(html).toContain('inert=""');
  });

  it('#C41 a normal row is unchanged', () => {
    const html = render(false);
    expect(html).toContain('class="history-row"');
    expect(html).not.toContain('inert');
  });
});

describe('motion rules in the stylesheet', () => {
  const css = readFileSync(resolve(import.meta.dirname, '../src/styles.css'), 'utf8');
  const tokens = readFileSync(resolve(import.meta.dirname, '../src/styles/tokens.css'), 'utf8');

  it('#C42 reduced motion turns off animations, transitions and view transitions', () => {
    const rule = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(rule).toContain('animation: none !important');
    expect(rule).toContain('transition: none !important');
    expect(rule).toContain('::view-transition');
  });

  it('#C43 the motion tokens stay in the agreed 150 to 250ms', () => {
    expect(tokens).toContain('--motion-fast: 150ms');
    expect(tokens).toContain('--motion-slow: 250ms');
  });

  it('#C49 the amount highlight lasts 600ms, and its timer matches the animation', () => {
    expect(FLASH_MS).toBe(600);
    expect(tokens).toContain(`--motion-flash: ${FLASH_MS}ms`);
    expect(css).toContain('animation: amount-flash var(--motion-flash)');
  });
});
