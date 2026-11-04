import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Account, Person } from '@splitbot/shared';
import { AccountSummary } from '../src/components/AccountSummary';
import { isLongAmount } from '../src/display';

const PEOPLE: Person[] = [{ id: 'me', name: 'Me' }];
const account = (owedCents: number, oweCents: number, netCents: number): Account => ({ owedCents, owedCount: 1, oweCents, oweCount: 1, netCents, people: [] });
const render = (a: Account) => renderToStaticMarkup(<AccountSummary account={a} people={PEOPLE} error={null} />);

describe('isLongAmount', () => {
  it('#D37 ordinary amounts fit at full size', () => {
    for (const text of ['$0.00', '+$39.00', '-$12.50', '$999.99', '$1,000.00']) expect(isLongAmount(text)).toBe(false);
  });

  it('#D38 from five figures they need more room', () => {
    for (const text of ['$10,000.00', '+$10,000.00', '-$411,425.63', '$1,234,567.89']) expect(isLongAmount(text)).toBe(true);
  });
});

describe('balance card with large amounts', () => {
  it('#D39 an ordinary card is unchanged', () => {
    const html = render(account(6400, 2500, 3900));
    expect(html).toContain('class="split"');
    expect(html).toContain('<strong>');
    expect(html).not.toContain('class="long"');
  });

  it('#D40 a long net balance steps down in size, so it never breaks mid-number', () => {
    expect(render(account(0, 41142563, -41142563))).toContain('<strong class="long">');
  });

  it('#D41 a long total stacks the two tiles, so each gets the full width', () => {
    expect(render(account(12200, 41154763, -41142563))).toContain('class="split long"');
    expect(render(account(41154763, 12200, 41142563))).toContain('class="split long"');
  });
});
