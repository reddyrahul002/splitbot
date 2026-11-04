import { Moon, Sun } from 'lucide-react';
import { otherTheme, type Theme } from '../themeLogic';

export function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const Icon = theme === 'light' ? Moon : Sun;
  return (
    <button type="button" className="icon-button" aria-label={`Switch to ${otherTheme(theme)} theme`} onClick={onToggle}>
      <Icon aria-hidden="true" />
    </button>
  );
}
