import { formatCents, type Account, type AccountPerson, type Person } from '@splitbot/shared';
import { signedCents, tone } from '../display';

const peopleCount = (count: number) => (count === 1 ? '1 person' : `${count} people`);

function personText({ netCents }: AccountPerson): string {
  if (netCents > 0) return `owes you ${formatCents(netCents)}`;
  if (netCents < 0) return `you owe ${formatCents(Math.abs(netCents))}`;
  return 'settled up';
}

export function AccountSummary({ account, people, error }: { account: Account | null; people: Person[]; error: string | null }) {
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? 'Unknown';
  const alert = error && (
    <p className="panel-error" role="alert">
      {error}
    </p>
  );

  if (!account) {
    return <section className="account">{alert ?? <p className="hint">Loading…</p>}</section>;
  }

  return (
    <section className="account">
      {alert}
      <p className="total">
        You are owed <strong className="owes-me">{formatCents(account.owedCents)}</strong>
        {account.owedCount > 0 && ` from ${peopleCount(account.owedCount)}`}
      </p>
      <p className="total">
        You owe <strong className="i-owe">{formatCents(account.oweCents)}</strong>
        {account.oweCount > 0 && ` to ${peopleCount(account.oweCount)}`}
      </p>
      <p className={`net ${tone(account.netCents)}`}>
        Net balance <strong>{signedCents(account.netCents)}</strong>
      </p>
      {account.people.length === 0 ? (
        <p className="hint">No one to show yet. Add an expense in the chat.</p>
      ) : (
        <ul className="people">
          {account.people.map((person) => (
            <li key={person.personId} className={`person ${tone(person.netCents)}`}>
              <span>{nameOf(person.personId)}</span>
              <span>{personText(person)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
