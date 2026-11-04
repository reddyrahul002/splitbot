import { Users } from 'lucide-react';
import { formatCents, ME_ID, type Account, type Person } from '@splitbot/shared';
import { debtText, oweTone, owedTone, signedCents, tone } from '../display';
import { useExitingItems } from '../useExitingItems';
import { useFlashOnChange } from '../useFlashOnChange';
import { Avatar } from './Avatar';
import { AvatarStack } from './AvatarStack';
import { EmptyState } from './EmptyState';
import { FlashAmount } from './FlashAmount';
import { Skeleton } from './Skeleton';
import { ToneIcon } from './ToneIcon';

const peopleCount = (count: number) => (count === 1 ? '1 person' : `${count} people`);

function PersonRow({ person, name, exiting }: { person: Account['people'][number]; name: string; exiting: boolean }) {
  const flashing = useFlashOnChange(person.netCents);
  const classes = ['person-row', flashing && 'flash', exiting && 'exiting'].filter(Boolean).join(' ');
  return (
    <li className={classes} inert={exiting}>
      <span className="person-avatar">
        <Avatar name={name} isYou={person.personId === ME_ID} />
        <ToneIcon cents={person.netCents} />
      </span>
      {/* Tests #54 and #55 pin this <li> exactly. role="none" keeps it from reading as a one-item list per person. */}
      <ul className="person-line" role="none">
        <li className={`person ${tone(person.netCents)}`}>
          <span>{name}</span>
          <span>{debtText(person.netCents)}</span>
        </li>
      </ul>
    </li>
  );
}

function PeopleList({ rows, nameOf }: { rows: Account['people']; nameOf: (id: string) => string }) {
  const shown = useExitingItems(rows, (row) => row.personId);
  return (
    <ul className="people">
      {shown.map(({ item, exiting }) => (
        <PersonRow key={item.personId} person={item} name={nameOf(item.personId)} exiting={exiting} />
      ))}
    </ul>
  );
}

export function AccountSummary({ account, people, error }: { account: Account | null; people: Person[]; error: string | null }) {
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? 'Unknown';
  const personOf = (id: string): Person => ({ id, name: nameOf(id) });
  const alert = error && (
    <p className="panel-error" role="alert">
      {error}
    </p>
  );

  if (!account) {
    return <section className="account">{alert ?? <Skeleton variant="summary" />}</section>;
  }

  const owing = account.people.filter((p) => p.netCents > 0).map((p) => personOf(p.personId));
  const owed = account.people.filter((p) => p.netCents < 0).map((p) => personOf(p.personId));

  return (
    <section className="account">
      {alert}
      <p className={`net ${tone(account.netCents)}`}>
        <span className="net-label">Net balance</span>{' '}
        <FlashAmount value={account.netCents}>
          <ToneIcon cents={account.netCents} />
          {signedCents(account.netCents)}
        </FlashAmount>
      </p>
      <div className="split">
        <div className="split-side">
          <p className="total">
            <span className="total-label">You are owed</span> <FlashAmount value={account.owedCents} className={owedTone(account.owedCents)}>{formatCents(account.owedCents)}</FlashAmount>
            {account.owedCount > 0 && <span className="total-count"> from {peopleCount(account.owedCount)}</span>}
          </p>
          <AvatarStack people={owing} />
        </div>
        <div className="split-side">
          <p className="total">
            <span className="total-label">You owe</span> <FlashAmount value={account.oweCents} className={oweTone(account.oweCents)}>{formatCents(account.oweCents)}</FlashAmount>
            {account.oweCount > 0 && <span className="total-count"> to {peopleCount(account.oweCount)}</span>}
          </p>
          <AvatarStack people={owed} />
        </div>
      </div>
      {account.people.length === 0 ? (
        <EmptyState icon={Users} title="No one to show yet." body="Add an expense in the chat." />
      ) : (
        <PeopleList rows={account.people} nameOf={nameOf} />
      )}
    </section>
  );
}
