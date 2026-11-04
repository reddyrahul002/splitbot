import { User } from 'lucide-react';
import { avatarTone, initials } from '../avatarLogic';

type AvatarSize = 'sm' | 'md' | 'lg';

/**
 * Decorative: the person's name is always written beside it. Initials come from a data attribute through CSS, so they
 * never end up in the text of the sentence next to the avatar.
 */
export function Avatar({ name, isYou = false, size = 'md' }: { name: string; isYou?: boolean; size?: AvatarSize }) {
  if (isYou) {
    return (
      <span className={`avatar avatar-${size} avatar-you`} aria-hidden="true">
        <User />
      </span>
    );
  }
  return <span className={`avatar avatar-${size}`} data-initials={initials(name)} style={{ background: `var(--avatar-${avatarTone(name)})` }} aria-hidden="true" />;
}
