// The theme on <html>: follows the system until the user picks one, then remembers it.
import { useCallback, useEffect, useState } from 'react';
import { otherTheme, resolveTheme, THEME_KEY, type Theme } from './themeLogic';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Storage can throw (blocked or private mode). The toggle still works, it just isn't remembered. */
function readStored(): string | null {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

function initialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  return resolveTheme(readStored(), window.matchMedia(DARK_QUERY).matches);
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const follow = () => setTheme(resolveTheme(readStored(), media.matches));
    media.addEventListener('change', follow);
    return () => media.removeEventListener('change', follow);
  }, []);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = otherTheme(current);
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        // Not remembered; see readStored.
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
