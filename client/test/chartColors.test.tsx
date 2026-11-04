import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CATEGORIES, type Account, type Person, type SpendingSummary } from '@splitbot/shared';
import { categoryChartColor } from '../src/categoryMeta';
import { chartSizes } from '../src/chartData';
import { Charts } from '../src/components/Charts';

const PEOPLE: Person[] = [
  { id: 'me', name: 'Me' },
  { id: 'arun', name: 'Arun' },
];
const SUMMARY: SpendingSummary = {
  myCents: 100,
  totalCents: 100,
  byCategory: [{ category: 'Travel', myCents: 100, totalCents: 100 }],
  byMonth: [{ month: '2026-11', myCents: 100, totalCents: 100 }],
};
const ACCOUNT: Account = { owedCents: 100, owedCount: 1, oweCents: 0, oweCount: 0, netCents: 100, people: [{ personId: 'arun', netCents: 100 }] };

describe('category colours', () => {
  it('#D14 every category has its own token, so a colour follows the category and not its rank', () => {
    const colours = CATEGORIES.map(categoryChartColor);
    expect(new Set(colours).size).toBe(CATEGORIES.length);
    for (const colour of colours) expect(colour).toMatch(/^var\(--cat-[a-z]+\)$/);
  });
});

describe('chartSizes', () => {
  it('#D17 narrow leaves more room for the bars', () => {
    const wide = chartSizes(false);
    const narrow = chartSizes(true);
    expect(wide.categoryAxis + wide.categoryRight).toBe(240);
    expect(narrow.categoryAxis + narrow.categoryRight).toBeLessThan(200);
    expect(narrow.balanceAxis).toBeLessThan(wide.balanceAxis);
  });
});

describe('Show as table', () => {
  const html = renderToStaticMarkup(<Charts summary={SUMMARY} account={ACCOUNT} people={PEOPLE} error={null} />);

  it('#D18 each chart has a table view, with a chevron that shows it opens', () => {
    expect(html.match(/<summary>/g)).toHaveLength(3);
    expect(html).toMatch(/<summary><svg[^]*?lucide-chevron-right[^]*?Show as table<\/summary>/);
  });
});
