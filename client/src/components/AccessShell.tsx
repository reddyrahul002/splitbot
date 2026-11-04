import type { ReactNode } from 'react';
import { Split } from 'lucide-react';

/** The page around the unlock and waking screens. */
export function AccessShell({ children }: { children: ReactNode }) {
  return (
    <main className="access-page">
      <div className="access-card">
        <span className="logo" aria-hidden="true">
          <Split />
        </span>
        <h1>SplitBot</h1>
        {children}
      </div>
    </main>
  );
}
