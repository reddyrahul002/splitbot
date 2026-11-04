import { useState } from 'react';
import { formatCents, ME_ID, type Account, type Draft, type Person, type SettlePlan, type Transfer } from '@splitbot/shared';
import { createDraft } from '../api';
import { signedCents, tone } from '../display';
import { savingsNote, settlementRequest, transferText } from '../settleLogic';
import { DraftCard } from './DraftCard';

const rowTone = ({ from, to }: Transfer) => (to === ME_ID ? 'owes-me' : from === ME_ID ? 'i-owe' : 'settled');

export function SettleUp(props: {
  account: Account | null;
  plan: SettlePlan | null;
  people: Person[];
  error: string | null;
  onChange: () => void;
}) {
  const { account, plan, people, error, onChange } = props;
  // One draft at a time, so the amounts in the list can't go stale behind a second open card.
  const [draft, setDraft] = useState<Draft | null>(null);
  const [creating, setCreating] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);

  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? 'Unknown';

  async function record(transfer: Transfer) {
    const body = settlementRequest(transfer, people);
    if (!body) {
      setRecordError("Can't find one of those people. Reload the page and try again.");
      return;
    }
    setCreating(true);
    try {
      setDraft(await createDraft(body));
      setRecordError(null);
    } catch (err) {
      setRecordError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  if (!account || !plan) {
    return error ? (
      <p className="panel-error" role="alert">
        {error}
      </p>
    ) : (
      <p className="hint">Loading…</p>
    );
  }

  const note = savingsNote(plan);

  return (
    <div className="settle-up">
      <div className="totals">
        <p>
          You are owed <strong className="owes-me">{formatCents(account.owedCents)}</strong>
        </p>
        <p>
          You owe <strong className="i-owe">{formatCents(account.oweCents)}</strong>
        </p>
        <p className={tone(account.netCents)}>
          Net balance <strong>{signedCents(account.netCents)}</strong>
        </p>
      </div>

      {recordError && (
        <p className="panel-error" role="alert">
          {recordError}
        </p>
      )}

      {draft && (
        <DraftCard
          key={draft.id}
          draft={draft}
          people={people}
          onSaved={() => {
            setDraft(null);
            onChange();
          }}
          onClose={() => setDraft(null)}
        />
      )}

      {plan.transfers.length === 0 ? (
        <p className="hint">{account.people.length === 0 ? 'Nothing to settle yet. Add an expense in the chat.' : 'All settled up.'}</p>
      ) : (
        <>
          <ul className="transfers">
            {plan.transfers.map((transfer) => (
              <li key={`${transfer.from}>${transfer.to}`} className={`transfer-row ${rowTone(transfer)}`}>
                <span>{transferText(transfer, nameOf)}</span>
                <button type="button" disabled={creating || draft !== null} onClick={() => record(transfer)}>
                  Record payment
                </button>
              </li>
            ))}
          </ul>
          {note && <p className="savings">{note}</p>}
          <p className="hint">These payments simplify across everyone, so amounts can differ from the direct debts on the left.</p>
        </>
      )}
    </div>
  );
}
