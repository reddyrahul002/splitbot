import type { ReactNode } from 'react';
import { useFlashOnChange } from '../useFlashOnChange';

/** A strong amount that briefly highlights when `value` changes. `value` only detects the change; the text is passed in. */
export function FlashAmount({ value, className, children }: { value: number; className?: string; children: ReactNode }) {
  const flashing = useFlashOnChange(value);
  const classes = [className, flashing && 'flash'].filter(Boolean).join(' ');
  return <strong className={classes || undefined}>{children}</strong>;
}
