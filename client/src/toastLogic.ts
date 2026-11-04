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
