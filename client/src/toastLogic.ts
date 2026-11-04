// Pure helpers for the toast list.
export type ToastKind = 'success' | 'error';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

export const MAX_TOASTS = 3;

/** Newest last. The same message again replaces the old one, so a repeating failure doesn't stack up. */
export function addToast(list: ToastItem[], toast: ToastItem): ToastItem[] {
  const others = list.filter((t) => t.kind !== toast.kind || t.message !== toast.message);
  return [...others, toast].slice(-MAX_TOASTS);
}

export const removeToast = (list: ToastItem[], id: number) => list.filter((t) => t.id !== id);

/**
 * The toast for a failed data load, if it needs one. Before any data the panels show the error themselves; after that
 * they keep the old numbers on screen, so the toast says why they may be stale.
 */
export const loadErrorToast = (error: string | null, hasData: boolean) => (error && hasData ? error : null);
