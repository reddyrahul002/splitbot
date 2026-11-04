import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Chat } from '../src/components/Chat';
import { BotAvatar, ChatBubble } from '../src/components/ChatParts';
import { TypingIndicator } from '../src/components/TypingIndicator';

const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('BotAvatar', () => {
  it('#C17 is decorative', () => {
    const html = renderToStaticMarkup(<BotAvatar />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('<svg');
    expect(textOf(html)).toBe('');
  });
});

describe('ChatBubble', () => {
  it('#C18 a user message is on the right with no avatar', () => {
    const html = renderToStaticMarkup(<ChatBubble kind="user" text="Dinner $90" />);
    expect(html).toContain('bubble-row user');
    expect(html).toContain('bubble user');
    expect(html).not.toContain('bot-avatar');
    expect(textOf(html)).toBe('Dinner $90');
  });

  it('#C19 a reply is on the left with the SplitBot avatar, and renders its markdown', () => {
    const html = renderToStaticMarkup(<ChatBubble kind="model" text="**Arun** owes you $38.00" />);
    expect(html).toContain('bubble-row model');
    expect(html).toContain('bot-avatar');
    expect(html).toContain('<strong>Arun</strong>');
  });

  it('#C20 raw HTML in a reply stays text', () => {
    const html = renderToStaticMarkup(<ChatBubble kind="model" text="<img src=x onerror=alert(1)>" />);
    expect(html).not.toContain('<img');
  });

  it('#C21 an error is an alert with an icon, not just red', () => {
    const html = renderToStaticMarkup(<ChatBubble kind="error" text="Rate limited" />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('lucide-circle-alert');
    expect(textOf(html)).toBe('Rate limited');
  });
});

describe('TypingIndicator', () => {
  it('#C22 screen readers hear the words, sighted users see the dots', () => {
    const html = renderToStaticMarkup(<TypingIndicator />);
    expect(html).toContain('role="status"');
    expect(textOf(html)).toBe('Thinking…');
    expect(html).toMatch(/class="typing-dots" aria-hidden="true"/);
    expect(html).toContain('bot-avatar');
  });
});

describe('Chat', () => {
  const html = renderToStaticMarkup(<Chat people={[]} onChange={() => {}} />);

  it('#C23 has a heading and says nothing saves without you', () => {
    expect(html).toMatch(/<h2[^>]*>Ask SplitBot<\/h2>/);
    expect(textOf(html)).toContain('Nothing saves until you confirm.');
  });

  it('#C24 before the first message there is a welcome and the three example chips', () => {
    expect(textOf(html)).toContain('Type an expense or a question, or start from an example below.');
    expect(html.match(/class="chip"/g)).toHaveLength(3);
    expect(html).toContain('Lunch $40 split with Aroon');
  });

  it('#C25 Send keeps its word and is off until there is text', () => {
    expect(html).toMatch(/<button type="submit" class="with-icon" disabled="">[^]*Send<\/button>/);
  });

  it('#C26 the message box keeps its label and id', () => {
    expect(html).toContain('aria-label="Message"');
    expect(html).toContain('id="chat-input"');
  });
});
