import { ArrowDownLeft, ArrowUpRight, Check } from 'lucide-react';
import { tone } from '../display';

/** Direction as a shape, so an amount's meaning never rests on colour: money coming in, going out, or nothing owed. */
export function ToneIcon({ cents }: { cents: number }) {
  const Icon = cents > 0 ? ArrowDownLeft : cents < 0 ? ArrowUpRight : Check;
  return (
    <span className={`tone-icon ${tone(cents)}`} aria-hidden="true">
      <Icon />
    </span>
  );
}
