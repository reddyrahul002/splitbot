// Pure helpers for the theme. index.html repeats THEME_KEY and the same rule, so the first paint is already right.
export type Theme = 'light' | 'dark';

export const THEME_KEY = 'splitbot-theme';

/** A saved choice wins; anything else follows the system. */
export function resolveTheme(stored: string | null, systemDark: boolean): Theme {
  if (stored === 'light' || stored === 'dark') return stored;
  return systemDark ? 'dark' : 'light';
}

export const otherTheme = (theme: Theme): Theme => (theme === 'light' ? 'dark' : 'light');
