import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Receipt } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Account, Person, SpendingSummary } from '@splitbot/shared';
import { Charts } from '../src/components/Charts';
import { EmptyState } from '../src/components/EmptyState';
import { Groups } from '../src/components/Groups';

const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const PEOPLE: Person[] = [{ id: 'me', name: 'Me' }];
const ACCOUNT: Account = { owedCents: 0, owedCount: 0, oweCents: 0, oweCount: 0, netCents: 0, people: [] };
const NO_SPENDING: SpendingSummary = { myCents: 0, totalCents: 0, byCategory: [], byMonth: [] };

describe('EmptyState', () => {
  it('#B35 title and body read as one sentence after another', () => {
    const html = renderToStaticMarkup(<EmptyState icon={Receipt} title="Nothing here yet." body="Add one in the chat." />);
    expect(textOf(html)).toBe('Nothing here yet. Add one in the chat.');
  });

  it('#B36 the icon is decorative', () => {
    const html = renderToStaticMarkup(<EmptyState icon={Receipt} title="Nothing." />);
    expect(html).toMatch(/class="empty-icon" aria-hidden="true"/);
    expect(html).toContain('<svg');
  });

  it('#B37 the call to action is a real button, only when given', () => {
    expect(renderToStaticMarkup(<EmptyState icon={Receipt} title="Nothing." />)).not.toContain('<button');
    const html = renderToStaticMarkup(<EmptyState icon={Receipt} title="Nothing." action={{ label: 'Start', onClick: () => {} }} />);
    expect(html).toMatch(/<button type="button" class="action">Start<\/button>/);
  });
});

describe('empty states in the tabs', () => {
  it('#B38 no spending has an icon and a way to start', () => {
    const html = renderToStaticMarkup(<Charts summary={NO_SPENDING} account={ACCOUNT} people={PEOPLE} error={null} />);
    expect(html).toContain('empty-state');
    expect(html).toContain('>Add an expense<');
  });

  it('#B39 no share of mine offers the switch to Group total', () => {
    const others: SpendingSummary = { myCents: 0, totalCents: 3000, byCategory: [{ category: 'Other', myCents: 0, totalCents: 3000 }], byMonth: [{ month: '2026-11', myCents: 0, totalCents: 3000 }] };
    const html = renderToStaticMarkup(<Charts summary={others} account={ACCOUNT} people={PEOPLE} error={null} />);
    expect(html).toContain('>Show Group total<');
  });

  it('#B40 charts loading is a skeleton', () => {
    const html = renderToStaticMarkup(<Charts summary={null} account={null} people={PEOPLE} error={null} />);
    expect(html).toContain('skeleton');
  });

  it('#B41 no groups has an icon and points at the form', () => {
    const html = renderToStaticMarkup(<Groups groups={[]} people={PEOPLE} error={null} onChange={() => {}} />);
    expect(html).toContain('empty-state');
    expect(html).toContain('>Name your first group<');
  });

  it('#B42 groups loading is a skeleton', () => {
    expect(renderToStaticMarkup(<Groups groups={null} people={PEOPLE} error={null} onChange={() => {}} />)).toContain('skeleton');
  });
});

describe('favicon', () => {
  const client = resolve(import.meta.dirname, '..');

  it('#B43 is linked from the page and exists', () => {
    expect(readFileSync(resolve(client, 'index.html'), 'utf8')).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
    expect(existsSync(resolve(client, 'public/favicon.svg'))).toBe(true);
  });
});
