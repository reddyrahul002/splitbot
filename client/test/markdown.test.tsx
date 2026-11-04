import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Markdown } from '../src/components/Markdown';
import { parseInline, parseMarkdown } from '../src/markdown';

describe('parseInline', () => {
  it('#24 finds bold and italic', () => {
    expect(parseInline('Arun owes **$38.00** now')).toEqual([
      { kind: 'text', text: 'Arun owes ' },
      { kind: 'bold', text: '$38.00' },
      { kind: 'text', text: ' now' },
    ]);
    expect(parseInline('a *b* c')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'italic', text: 'b' },
      { kind: 'text', text: ' c' },
    ]);
  });

  it('#25 leaves stray and unmatched asterisks alone', () => {
    for (const text of ['$5 * 3 * 2', '**not closed', 'a*b*c', '* starts']) {
      expect(parseInline(text)).toEqual([{ kind: 'text', text }]);
    }
  });
});

describe('parseMarkdown', () => {
  it('#26 plain text is one paragraph; blank lines separate paragraphs', () => {
    expect(parseMarkdown('Draft ready.\nPlease confirm.\n\nThanks')).toEqual([
      { kind: 'paragraph', text: 'Draft ready.\nPlease confirm.' },
      { kind: 'paragraph', text: 'Thanks' },
    ]);
  });

  it('#27 bullet lists with -, * or •', () => {
    expect(parseMarkdown('Shares:\n- Me: $26\n* Arun: **$38**\n• Mei: $26\nDone')).toEqual([
      { kind: 'paragraph', text: 'Shares:' },
      { kind: 'bullets', items: ['Me: $26', 'Arun: **$38**', 'Mei: $26'] },
      { kind: 'paragraph', text: 'Done' },
    ]);
  });

  it('#28 numbered lists keep their first number', () => {
    expect(parseMarkdown('1. Arun pays you\n2) Mei pays you')).toEqual([{ kind: 'numbers', start: 1, items: ['Arun pays you', 'Mei pays you'] }]);
    expect(parseMarkdown('3. Third')).toEqual([{ kind: 'numbers', start: 3, items: ['Third'] }]);
  });

  it('#29 a line starting with bold, or an empty message, is not a list', () => {
    expect(parseMarkdown('**Dinner** is ready')).toEqual([{ kind: 'paragraph', text: '**Dinner** is ready' }]);
    expect(parseMarkdown('')).toEqual([]);
  });
});

describe('<Markdown>', () => {
  it('#30 renders bold and lists', () => {
    expect(renderToStaticMarkup(<Markdown text={'**Hi**\n- one\n- *two*'} />)).toBe('<p><strong>Hi</strong></p><ul><li>one</li><li><em>two</em></li></ul>');
    expect(renderToStaticMarkup(<Markdown text="3. x" />)).toBe('<ol start="3"><li>x</li></ol>');
  });

  it('#31 raw HTML stays text, including inside bold and list items', () => {
    const html = renderToStaticMarkup(
      <Markdown text={'<script>alert(1)</script>\n\n**<img src=x onerror=alert(1)>**\n- <a href="javascript:alert(1)">x</a>'} />,
    );
    expect(html).not.toMatch(/<script|<img|<a /);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('<strong>&lt;img src=x onerror=alert(1)&gt;</strong>');
  });

  it('#32 a markdown link is not turned into a link', () => {
    expect(renderToStaticMarkup(<Markdown text="[x](javascript:alert(1))" />)).toBe('<p>[x](javascript:alert(1))</p>');
  });
});
