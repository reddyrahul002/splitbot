import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CircleAlert } from 'lucide-react';
import { AccessShell } from './AccessShell';

export function UnlockScreen({ error, busy, onSubmit }: { error: string | null; busy: boolean; onSubmit: (passcode: string) => void }) {
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);

  // After a refusal, the box is ready for another try.
  useEffect(() => {
    if (error) setText('');
    if (!busy) input.current?.focus();
  }, [error, busy]);

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit(text);
  }

  return (
    <AccessShell>
      <p className="access-text">Enter the passcode to continue.</p>
      <form className="access-form" onSubmit={submit}>
        <label className="field">
          <span>Passcode</span>
          <input ref={input} type="password" autoComplete="current-password" value={text} disabled={busy} onChange={(e) => setText(e.target.value)} />
        </label>
        {error && (
          <p className="card-error" role="alert">
            <CircleAlert aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}
        <button type="submit" className="primary" disabled={busy || !text.trim()}>
          {busy ? 'Checking…' : 'Unlock'}
        </button>
      </form>
    </AccessShell>
  );
}
