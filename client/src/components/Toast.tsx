import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Check, CircleAlert, X } from 'lucide-react';
import { addToast, removeToast, type ToastItem, type ToastKind } from '../toastLogic';

const SHOWN_MS: Record<ToastKind, number> = { success: 4000, error: 6000 };

type ShowToast = (kind: ToastKind, message: string) => void;

// Without a provider a toast does nothing, so components still render on their own.
const ToastContext = createContext<ShowToast>(() => {});

export const useToast = () => useContext(ToastContext);

/**
 * The region is always in the page, or the first toast wouldn't be announced. Every error toast repeats an inline
 * role="alert", so its text is hidden from screen readers and they don't hear it twice.
 */
export function ToastList({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = toast.kind === 'success' ? Check : CircleAlert;
        return (
          <div key={toast.id} className={`toast ${toast.kind}`}>
            <Icon aria-hidden="true" />
            {toast.kind === 'error' ? <span aria-hidden="true">{toast.message}</span> : <span>{toast.message}</span>}
            <button type="button" className="icon-button" aria-label="Dismiss" onClick={() => onDismiss(toast.id)}>
              <X aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((current) => removeToast(current, id)), []);

  const show = useCallback<ShowToast>(
    (kind, message) => {
      const id = nextId.current++;
      setToasts((current) => addToast(current, { id, kind, message }));
      setTimeout(() => dismiss(id), SHOWN_MS[kind]);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <ToastList toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}
