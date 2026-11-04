import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createAccessFlow, type AccessState } from '../accessFlow';
import { checkSession, onPasscodeRequired } from '../api';
import { clearPasscode, getStoredPasscode, storePasscode } from '../passcode';
import { AccessShell } from './AccessShell';
import { UnlockScreen } from './UnlockScreen';
import { WakingScreen } from './WakingScreen';

/** Shows the app only once the server has let this tab in. */
export function AccessGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AccessState>({ kind: 'checking' });
  const flow = useRef<ReturnType<typeof createAccessFlow> | null>(null);

  useEffect(() => {
    const current = createAccessFlow({
      check: checkSession,
      storage: { get: getStoredPasscode, save: storePasscode, clear: clearPasscode },
      wait: (fn, ms) => {
        const timer = setTimeout(fn, ms);
        return () => clearTimeout(timer);
      },
      onChange: setState,
    });
    flow.current = current;
    onPasscodeRequired(() => current.lock());
    current.start();
    return () => {
      current.stop();
      onPasscodeRequired(null);
    };
  }, []);

  if (state.kind === 'unlocked') return <>{children}</>;
  if (state.kind === 'waking') return <WakingScreen attempts={state.attempts} />;
  if (state.kind === 'locked') return <UnlockScreen error={state.error} busy={state.busy} onSubmit={(passcode) => flow.current?.submit(passcode)} />;
  return (
    <AccessShell>
      <span className="visually-hidden" role="status">
        Checking…
      </span>
    </AccessShell>
  );
}
