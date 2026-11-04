import { Car, Clapperboard, Home, Plane, Receipt, ShoppingBag, ShoppingCart, UtensilsCrossed } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '@splitbot/shared';
import { categoryChartColor, CATEGORY_META } from '../src/categoryMeta';
import { CategoryChip } from '../src/components/CategoryChip';

const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

describe('CATEGORY_META', () => {
  it('#A21 every category has an icon and its own colour', () => {
    for (const category of CATEGORIES) expect(CATEGORY_META[category].Icon).toBeTruthy();
    expect(new Set(CATEGORIES.map((c) => CATEGORY_META[c].token)).size).toBe(CATEGORIES.length);
  });

  it('#A22 uses the icons in the brief', () => {
    // By component, not CSS class: lucide 1.x keeps these names as aliases of renamed icons (Home is House).
    expect(CATEGORY_META['Food & Drink'].Icon).toBe(UtensilsCrossed);
    expect(CATEGORY_META.Groceries.Icon).toBe(ShoppingCart);
    expect(CATEGORY_META.Transport.Icon).toBe(Car);
    expect(CATEGORY_META['Housing & Utilities'].Icon).toBe(Home);
    expect(CATEGORY_META.Entertainment.Icon).toBe(Clapperboard);
    expect(CATEGORY_META.Travel.Icon).toBe(Plane);
    expect(CATEGORY_META.Shopping.Icon).toBe(ShoppingBag);
    expect(CATEGORY_META.Other.Icon).toBe(Receipt);
  });
});

describe('categoryChartColor', () => {
  it('#A23 gives the same token the chip uses, so charts and chips match', () => {
    expect(categoryChartColor('Travel')).toBe('var(--cat-travel)');
    expect(categoryChartColor('Food & Drink')).toBe('var(--cat-food)');
  });
});

describe('CategoryChip', () => {
  it('#A24 pairs the icon with the name, so meaning never rests on colour', () => {
    const html = renderToStaticMarkup(<CategoryChip category="Food & Drink" />);
    expect(textOf(html)).toBe('Food & Drink');
    expect(html).toContain('<svg');
    expect(html).toContain('var(--cat-food-ink)');
    expect(html).toContain('var(--cat-food-tint)');
  });

  it('#A25 the icon-only chip still names the category for screen readers', () => {
    const html = renderToStaticMarkup(<CategoryChip category="Travel" iconOnly />);
    expect(textOf(html)).toBe('');
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Travel"');
  });
});
