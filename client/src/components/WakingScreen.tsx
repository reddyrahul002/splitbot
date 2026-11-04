import { wakingText } from '../accessFlow';
import { AccessShell } from './AccessShell';

/** The free host sleeps when idle, so the first visit can take about a minute. */
export function WakingScreen({ attempts }: { attempts: number }) {
  const { title, detail } = wakingText(attempts);
  return (
    <AccessShell>
      <span className="access-spinner" aria-hidden="true" />
      <div role="status">
        <p className="access-title">{title}</p>
        <p className="access-text">{detail}</p>
      </div>
    </AccessShell>
  );
}
