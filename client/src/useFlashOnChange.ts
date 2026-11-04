// True for a moment after a value changes, so an amount can briefly highlight. Never on the first render.
import { useEffect, useRef, useState } from 'react';
import { FLASH_MS } from './motion';

export function useFlashOnChange(value: number): boolean {
  const [flashing, setFlashing] = useState(false);
  const previous = useRef(value);

  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    setFlashing(true);
    const timer = setTimeout(() => setFlashing(false), FLASH_MS);
    return () => clearTimeout(timer);
  }, [value]);

  return flashing;
}
