import { parseInline, parseMarkdown } from '../markdown';

function InlineText({ text }: { text: string }) {
  return parseInline(text).map((part, i) => {
    if (part.kind === 'bold') return <strong key={i}>{part.text}</strong>;
    if (part.kind === 'italic') return <em key={i}>{part.text}</em>;
    return part.text;
  });
}

/** Renders a chat reply. Everything goes through React as text, so raw HTML is never interpreted. */
export function Markdown({ text }: { text: string }) {
  return parseMarkdown(text).map((block, i) => {
    if (block.kind === 'paragraph') {
      return (
        <p key={i}>
          <InlineText text={block.text} />
        </p>
      );
    }
    const items = block.items.map((item, j) => (
      <li key={j}>
        <InlineText text={item} />
      </li>
    ));
    if (block.kind === 'bullets') return <ul key={i}>{items}</ul>;
    return (
      <ol key={i} start={block.start === 1 ? undefined : block.start}>
        {items}
      </ol>
    );
  });
}
