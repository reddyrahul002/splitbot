import type { ReactNode } from 'react';
import { Split } from 'lucide-react';
import type { Theme } from '../themeLogic';
import { Avatar } from './Avatar';
import { ThemeToggle } from './ThemeToggle';

export function AppShell({ theme, onToggleTheme, children }: { theme: Theme; onToggleTheme: () => void; children: ReactNode }) {
  return (
    <div className="app">
      <header className="topbar">
        <span className="logo" aria-hidden="true">
          <Split />
        </span>
        <h1>SplitBot</h1>
        <div className="topbar-end">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <span className="topbar-you">
            <Avatar name="You" isYou />
            <span>You</span>
          </span>
        </div>
      </header>
      {children}
    </div>
  );
}
