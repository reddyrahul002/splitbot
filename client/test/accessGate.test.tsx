import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AccessGate } from '../src/components/AccessGate';
import { UnlockScreen } from '../src/components/UnlockScreen';
import { WakingScreen } from '../src/components/WakingScreen';

const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ').trim();
const unlock = (props: { error?: string | null; busy?: boolean } = {}) =>
  renderToStaticMarkup(<UnlockScreen error={props.error ?? null} busy={props.busy ?? false} onSubmit={() => {}} />);

describe('UnlockScreen', () => {
  it('#U1 names the app and says what to do', () => {
    const html = unlock();
    expect(html).toMatch(/<h1[^>]*>SplitBot<\/h1>/);
    expect(textOf(html)).toContain('Enter the passcode to continue.');
    expect(html).toContain('<main');
  });

  it('#U2 the field is a labelled password field, so it is masked and managers can fill it', () => {
    const html = unlock();
    expect(html).toContain('<span>Passcode</span>');
    expect(html).toContain('type="password"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toMatch(/<label[^>]*>[^]*<input/);
  });

  it('#U3 Unlock is the primary submit button, off until something is typed', () => {
    expect(unlock()).toMatch(/<button type="submit" class="primary" disabled="">Unlock<\/button>/);
  });

  it('#U4 no error shows no alert', () => {
    expect(unlock()).not.toContain('role="alert"');
  });

  it('#U5 an error is announced, with an icon as well as colour', () => {
    const html = unlock({ error: "That passcode isn't right." });
    expect(html).toContain('role="alert"');
    expect(html).toContain('lucide-circle-alert');
    expect(textOf(html)).toContain("That passcode isn't right.");
  });

  it('#U6 while checking, the field and button are locked and it says so', () => {
    const html = unlock({ busy: true });
    expect(html.match(/disabled=""/g)).toHaveLength(2);
    expect(textOf(html)).toContain('Checking…');
  });
});

describe('WakingScreen', () => {
  it('#U7 says what is happening, announced to screen readers', () => {
    const html = renderToStaticMarkup(<WakingScreen attempts={1} />);
    expect(html).toContain('role="status"');
    expect(html).toMatch(/<h1[^>]*>SplitBot<\/h1>/);
    expect(textOf(html)).toContain('Waking up the server…');
    expect(textOf(html)).toContain('about a minute');
  });

  it('#U8 after a long wait it says something is wrong', () => {
    expect(textOf(renderToStaticMarkup(<WakingScreen attempts={18} />))).toContain('Still trying');
  });

  it('#U9 has no passcode field, because nothing can be checked yet', () => {
    expect(renderToStaticMarkup(<WakingScreen attempts={1} />)).not.toContain('<input');
  });
});

describe('AccessGate', () => {
  it('#U10 never renders the app before the server has answered', () => {
    const html = renderToStaticMarkup(
      <AccessGate>
        <p>the private app</p>
      </AccessGate>,
    );
    expect(html).not.toContain('the private app');
    expect(html).toContain('role="status"');
    expect(textOf(html)).toContain('Checking…');
  });

  it('#U11 wraps the app in the entry point, leaving App itself alone', () => {
    const main = readFileSync(resolve(import.meta.dirname, '../src/main.tsx'), 'utf8');
    expect(main).toMatch(/<AccessGate>\s*<App \/>\s*<\/AccessGate>/);
  });
});
