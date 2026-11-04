import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Skeleton } from '../src/components/Skeleton';

const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('Skeleton', () => {
  it.each(['list', 'summary', 'chart'] as const)('#B44 %s tells screen readers it is loading, and only that', (variant) => {
    const html = renderToStaticMarkup(<Skeleton variant={variant} />);
    expect(textOf(html)).toBe('Loading…');
    expect(html).toMatch(/<span class="visually-hidden" role="status">Loading…<\/span>/);
  });

  it.each(['list', 'summary', 'chart'] as const)('#B45 %s hides its placeholder shapes from screen readers', (variant) => {
    const html = renderToStaticMarkup(<Skeleton variant={variant} />);
    expect(html).toMatch(/aria-hidden="true"/);
    expect(html).toContain('skeleton-block');
  });

  it('#B46 defaults to a list', () => {
    expect(renderToStaticMarkup(<Skeleton />)).toBe(renderToStaticMarkup(<Skeleton variant="list" />));
  });
});
