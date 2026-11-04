import { ArrowRight } from 'lucide-react';
import { ME_ID, type Person } from '@splitbot/shared';
import { Avatar } from './Avatar';

/** Who pays whom, as a picture. Decorative: the sentence beside it says the same. */
export function TransferAvatars({ from, to, people }: { from: string; to: string; people: Person[] }) {
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? 'Unknown';
  return (
    <span className="transfer-avatars" aria-hidden="true">
      <Avatar name={nameOf(from)} isYou={from === ME_ID} size="sm" />
      <ArrowRight />
      <Avatar name={nameOf(to)} isYou={to === ME_ID} size="sm" />
    </span>
  );
}
