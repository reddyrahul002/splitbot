import type { ReactNode } from 'react';
import { Split } from 'lucide-react';
import type { Theme } from '../themeLogic';
import { Avatar } from './Avatar';
import { ThemeToggle } from './ThemeToggle';

export function AppShell(props: { theme: Theme; onToggleTheme: () => void; children: ReactNode; /** A drawer is open over the page. */ headerInert?: boolean }) {
  const { theme, onToggleTheme, children, headerInert = false } = props;
  return (
    <div className="app">
      <header className="topbar" inert={headerInert}>
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
