import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { ToastList, ToastProvider, useToast } from '../src/components/Toast';
import { addToast, MAX_TOASTS, removeToast, type ToastItem } from '../src/toastLogic';

const item = (id: number, kind: ToastItem['kind'] = 'success', message = `message ${id}`): ToastItem => ({ id, kind, message });
const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('addToast', () => {
  it('#B47 adds to the end without changing the old list', () => {
    const first = [item(1)];
    expect(addToast(first, item(2)).map((t) => t.id)).toEqual([1, 2]);
    expect(first).toHaveLength(1);
  });

  it('#B48 keeps only the newest few', () => {
    let list: ToastItem[] = [];
    for (let id = 1; id <= MAX_TOASTS + 2; id++) list = addToast(list, item(id));
    expect(list).toHaveLength(MAX_TOASTS);
    expect(list.at(-1)?.id).toBe(MAX_TOASTS + 2);
  });

  it('#B49 the same message again replaces the old one instead of stacking', () => {
    const list = addToast([item(1, 'error', 'Server down')], item(2, 'error', 'Server down'));
    expect(list.map((t) => t.id)).toEqual([2]);
  });

  it('#B50 the same words with another kind are a different toast', () => {
    expect(addToast([item(1, 'error', 'Saved')], item(2, 'success', 'Saved'))).toHaveLength(2);
  });
});

describe('removeToast', () => {
  it('#B51 removes by id, and an unknown id changes nothing', () => {
    expect(removeToast([item(1), item(2)], 1).map((t) => t.id)).toEqual([2]);
    expect(removeToast([item(1)], 9).map((t) => t.id)).toEqual([1]);
  });
});

describe('ToastList', () => {
  const render = (toasts: ToastItem[]) => renderToStaticMarkup(<ToastList toasts={toasts} onDismiss={() => {}} />);

  it('#B52 the live region exists before any toast, or the first would not be announced', () => {
    expect(render([])).toMatch(/role="status"/);
    expect(render([])).toMatch(/aria-live="polite"/);
  });

  it('#B53 success has a check, its message and a labelled dismiss button', () => {
    const html = render([item(1, 'success', 'Expense saved')]);
    expect(textOf(html)).toBe('Expense saved');
    expect(html).toContain('lucide-check');
    expect(html).toContain('aria-label="Dismiss"');
  });

  it('#B54 an error has its own icon and is not read twice, because the inline alert already says it', () => {
    const html = render([item(1, 'error', 'Server down')]);
    expect(html).toContain('toast error');
    expect(html).toContain('lucide-circle-alert');
    expect(html).toMatch(/<span aria-hidden="true">Server down<\/span>/);
  });

  it('#B55 a success message is read out', () => {
    expect(render([item(1, 'success', 'Expense saved')])).toMatch(/<span>Expense saved<\/span>/);
  });
});

describe('useToast', () => {
  function Caller() {
    const toast = useToast();
    return <p>{typeof toast}</p>;
  }

  it('#B56 without a provider it does nothing, so components render alone', () => {
    expect(renderToStaticMarkup(<Caller />)).toBe('<p>function</p>');
  });

  it('#B57 the provider renders its children and the region', () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <Caller />
      </ToastProvider>,
    );
    expect(html).toContain('<p>function</p>');
    expect(html).toContain('class="toasts"');
  });

  it('#B58 the app has the toast region', () => {
    expect(renderToStaticMarkup(<App />).match(/class="toasts"/g)).toHaveLength(1);
  });
});
