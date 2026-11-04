import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { AppShell } from '../src/components/AppShell';
import { Tabs } from '../src/components/Tabs';
import { ThemeToggle } from '../src/components/ThemeToggle';

describe('ThemeToggle', () => {
  it('#A26 the icon button says what it will do', () => {
    const light = renderToStaticMarkup(<ThemeToggle theme="light" onToggle={() => {}} />);
    expect(light).toContain('aria-label="Switch to dark theme"');
    expect(light).toContain('lucide-moon');

    const dark = renderToStaticMarkup(<ThemeToggle theme="dark" onToggle={() => {}} />);
    expect(dark).toContain('aria-label="Switch to light theme"');
    expect(dark).toContain('lucide-sun');
  });
});

describe('AppShell', () => {
  const html = renderToStaticMarkup(
    <AppShell theme="light" onToggleTheme={() => {}}>
      <p>page content</p>
    </AppShell>,
  );

  it('#A27 the top bar has the name, the theme toggle and You', () => {
    expect(html).toContain('<header');
    expect(html).toMatch(/<h1[^>]*>SplitBot<\/h1>/);
    expect(html).toContain('Switch to dark theme');
    expect(html).toContain('avatar-you');
    expect(html).toContain('>You<');
  });

  it('#A28 renders the page inside it', () => {
    expect(html).toContain('page content');
  });
});

describe('App', () => {
  const html = renderToStaticMarkup(<App />);

  it('#A29 has one heading and real page regions', () => {
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html.match(/<main/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Balances"');
    expect(html).toContain('aria-label="Chat with SplitBot"');
  });

  it('#A30 has the four tabs, with Settle up first', () => {
    expect(html.match(/role="tab"/g)).toHaveLength(4);
    expect(html).toMatch(/aria-selected="true"[^>]*>Settle up</);
    for (const label of ['Expenses', 'Charts', 'Groups']) expect(html).toContain(`>${label}</button>`);
  });

  it('#A31 chat is mounted exactly once, so its messages and drafts have one home', () => {
    expect(html.match(/aria-label="Message"/g)).toHaveLength(1);
  });
});

describe('Tabs keyboard and control', () => {
  const TABS = [
    { id: 'one', label: 'First', content: <p>first panel</p> },
    { id: 'two', label: 'Second', content: <p>second panel</p> },
  ];

  it('#A32 only the active tab is in the tab order; arrows move between them', () => {
    const html = renderToStaticMarkup(<Tabs tabs={TABS} />);
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html.match(/tabindex="-1"/g)).toHaveLength(1);
  });

  it('#A33 the panel is labelled by its tab', () => {
    const html = renderToStaticMarkup(<Tabs tabs={TABS} />);
    expect(html).toContain('id="tab-one"');
    expect(html).toContain('aria-controls="panel-one"');
    expect(html).toContain('id="panel-one"');
    expect(html).toContain('aria-labelledby="tab-one"');
  });

  it('#A34 a controlled active tab shows that panel', () => {
    const html = renderToStaticMarkup(<Tabs tabs={TABS} activeId="two" onChange={() => {}} />);
    expect(html).toContain('second panel');
    expect(html).not.toContain('first panel');
  });
});
