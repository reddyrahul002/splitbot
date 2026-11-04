import { ME_ID, type Person } from '@splitbot/shared';
import { Avatar } from './Avatar';

const MAX_SHOWN = 4;

/** Overlapping avatars, with "+N" past four. Screen readers get every name as one label. */
export function AvatarStack({ people, size = 'sm' }: { people: Person[]; size?: 'sm' | 'md' }) {
  if (people.length === 0) return null;
  const hidden = people.length - MAX_SHOWN;
  const label = people.map((p) => (p.id === ME_ID ? 'You' : p.name)).join(', ');

  return (
    <span className="avatar-stack" role="img" aria-label={label}>
      {people.slice(0, MAX_SHOWN).map((p) => (
        <Avatar key={p.id} name={p.name} isYou={p.id === ME_ID} size={size} />
      ))}
      {hidden > 0 && <span className={`avatar avatar-${size} avatar-more`} data-initials={`+${hidden}`} aria-hidden="true" />}
    </span>
  );
}
