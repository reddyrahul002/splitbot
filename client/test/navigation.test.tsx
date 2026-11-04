import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Account, Draft, Person, SettlePlan } from '@splitbot/shared';
import { App } from '../src/App';
import { BottomTabBar } from '../src/components/BottomTabBar';
import { Chat } from '../src/components/Chat';
import { ChatDrawer } from '../src/components/ChatDrawer';
import { DraftCard } from '../src/components/DraftCard';
import { SettleUp } from '../src/components/SettleUp';
import { activeNav, navTarget, NAV_ITEMS } from '../src/navLogic';

const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('navLogic', () => {
  it('#D19 has the five places, in the agreed order', () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual(['Home', 'Expenses', 'Groups', 'Charts', 'Chat']);
  });

  it('#D20 Home is the Settle up tab', () => {
    expect(navTarget('home', 'charts')).toEqual({ tab: 'settle', chatOpen: false });
    expect(activeNav('settle', false)).toBe('home');
  });

  it('#D21 the other places map to their tabs and close chat', () => {
    expect(navTarget('expenses', 'settle')).toEqual({ tab: 'expenses', chatOpen: false });
    expect(navTarget('groups', 'settle')).toEqual({ tab: 'groups', chatOpen: false });
    expect(navTarget('charts', 'settle')).toEqual({ tab: 'charts', chatOpen: false });
    expect(activeNav('groups', false)).toBe('groups');
  });

  it('#D22 Chat keeps the current tab underneath, so going back returns to it', () => {
    expect(navTarget('chat', 'charts')).toEqual({ tab: 'charts', chatOpen: true });
    expect(activeNav('charts', true)).toBe('chat');
  });
});

describe('BottomTabBar', () => {
  const html = renderToStaticMarkup(<BottomTabBar active="groups" onSelect={() => {}} />);

  it('#D23 is labelled navigation with a named button for each place', () => {
    expect(html).toContain('<nav class="bottom-nav" aria-label="Main">');
    expect(html.match(/<button/g)).toHaveLength(5);
    expect(textOf(html)).toBe('Home Expenses Groups Charts Chat');
  });

  it('#D24 marks the current place for screen readers, and only that one', () => {
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="page"[^]*?Groups/);
  });
});

describe('ChatDrawer', () => {
  const render = (modal: boolean) =>
    renderToStaticMarkup(
      <ChatDrawer modal={modal} onClose={() => {}}>
        <p>chat here</p>
      </ChatDrawer>,
    );

  it('#D25 closed or on desktop, it is a plain region with no backdrop', () => {
    const html = render(false);
    expect(html).toContain('aria-label="Chat with SplitBot"');
    expect(html).toContain('chat here');
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain('chat-backdrop');
  });

  it('#D26 as an open drawer it is a modal dialog with a backdrop', () => {
    const html = render(true);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('chat-backdrop');
  });
});

describe('Chat close button', () => {
  it('#D27 appears only when there is something to close, with a label', () => {
    expect(renderToStaticMarkup(<Chat people={[]} onChange={() => {}} />)).not.toContain('Close chat');
    expect(renderToStaticMarkup(<Chat people={[]} onChange={() => {}} onClose={() => {}} />)).toContain('aria-label="Close chat"');
  });
});

describe('App navigation', () => {
  const html = renderToStaticMarkup(<App />);

  it('#D28 has the bottom bar and the Ask SplitBot button, with the page regions', () => {
    expect(html).toContain('class="bottom-nav"');
    expect(html).toMatch(/ask-fab[^]*?Ask SplitBot/);
    expect(html.match(/<main/g)).toHaveLength(1);
  });

  it('#D29 chat is still mounted once, in one place, whatever the layout', () => {
    expect(html.match(/aria-label="Message"/g)).toHaveLength(1);
    expect(html.match(/class="chat"/g)).toHaveLength(1);
  });

  it('#D30 starts closed, on the first tab', () => {
    expect(html).toContain('class="columns tab-settle"');
    expect(html).not.toContain('chat-open');
    expect(html).not.toContain('role="dialog"');
  });
});

describe('the "on the left" hint', () => {
  const PEOPLE: Person[] = [{ id: 'me', name: 'Me' }, { id: 'arun', name: 'Arun' }];
  const ACCOUNT: Account = { owedCents: 100, owedCount: 1, oweCents: 0, oweCount: 0, netCents: 100, people: [{ personId: 'arun', netCents: 100 }] };
  const PLAN: SettlePlan = { transfers: [{ from: 'arun', to: 'me', cents: 100 }], directDebtCount: 1, paymentsSaved: 0 };
  const render = (groupId?: string) => renderToStaticMarkup(<SettleUp account={ACCOUNT} plan={PLAN} people={PEOPLE} error={null} onChange={() => {}} groupId={groupId} />);

  it('#D31 has one wording per layout, for CSS to choose between', () => {
    const html = render();
    expect(html).toContain('<span class="when-side">on the left</span>');
    expect(html).toContain('<span class="when-stacked">above</span>');
  });

  it('#D32 the group version has neither', () => {
    expect(render('trip')).not.toContain('when-stacked');
  });
});

describe('"You" on the draft card', () => {
  const PEOPLE: Person[] = [{ id: 'me', name: 'Me' }, { id: 'arun', name: 'Arun' }];
  const DRAFT = {
    id: 'd1',
    kind: 'expense',
    expense: {
      id: 'e1',
      description: 'Dinner',
      category: 'Other',
      date: '2026-11-03',
      totalCents: 9000,
      paidBy: 'me',
      shares: [
        { personId: 'me', cents: 4500 },
        { personId: 'arun', cents: 4500 },
      ],
      splitMeta: { splitType: 'equal' },
      createdAt: '2026-11-03T10:00:00.000Z',
    },
    newPeople: [],
    warnings: [],
  } as unknown as Draft;
  const html = renderToStaticMarkup(<DraftCard draft={DRAFT} people={PEOPLE} onSaved={() => {}} />);

  it('#D33 the share table says You', () => {
    expect(textOf(html)).toContain('You $45.00');
    expect(textOf(html)).not.toContain('Me $45.00');
  });

  it('#D34 the Paid by dropdown says You, and still sends my id', () => {
    expect(html).toContain('<option value="me" selected="">You</option>');
    expect(html).not.toContain('>Me</option>');
    expect(html).toContain('<option value="arun">Arun</option>');
  });
});
