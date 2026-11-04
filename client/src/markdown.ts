// A small markdown subset for chat replies: bold, italic and lists. It only produces plain data for React to render as
// text, so raw HTML in a reply stays visible text. Links, headings and code aren't parsed.

export type Inline = { kind: 'text' | 'bold' | 'italic'; text: string };

export type Block =
  | { kind: 'paragraph'; text: string }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'numbers'; start: number; items: string[] };

/** A single * must hug its text and not touch a word, so "$5 * 3 * 2" and "a*b*c" stay as they are. */
const INLINE = /\*\*(.+?)\*\*|(?<![\w*])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?![\w*])/g;

export function parseInline(text: string): Inline[] {
  const parts: Inline[] = [];
  let end = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > end) parts.push({ kind: 'text', text: text.slice(end, match.index) });
    parts.push(match[1] !== undefined ? { kind: 'bold', text: match[1] } : { kind: 'italic', text: match[2]! });
    end = match.index + match[0].length;
  }
  if (end < text.length) parts.push({ kind: 'text', text: text.slice(end) });
  return parts;
}

export function parseMarkdown(text: string): Block[] {
  const blocks: Block[] = [];
  let afterBlank = false;
  for (const line of text.split('\n')) {
    if (line.trim() === '') {
      afterBlank = true;
      continue;
    }
    const last = blocks.at(-1);
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const number = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    // List items continue across a blank line, so "1." and "2." with a gap between them stay one list.
    if (bullet) {
      if (last?.kind === 'bullets') last.items.push(bullet[1]!);
      else blocks.push({ kind: 'bullets', items: [bullet[1]!] });
    } else if (number) {
      if (last?.kind === 'numbers') last.items.push(number[2]!);
      else blocks.push({ kind: 'numbers', start: Number(number[1]), items: [number[2]!] });
    } else if (last?.kind === 'paragraph' && !afterBlank) {
      last.text += `\n${line.trim()}`;
    } else {
      blocks.push({ kind: 'paragraph', text: line.trim() });
    }
    afterBlank = false;
  }
  return blocks;
}
