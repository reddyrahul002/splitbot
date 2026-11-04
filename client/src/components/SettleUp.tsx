import { useState } from 'react';
import { formatCents, ME_ID, type Account, type Draft, type Group, type Person, type SettlePlan, type Transfer } from '@splitbot/shared';
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
  /** Set inside a group: recorded payments belong to it. */
  groupId?: string;
  /** Offered on the payment's draft card. */
  groups?: Group[];
  /** Inside a group: it has no expenses or payments yet. */
  noRecords?: boolean;
}) {
  const { account, plan, people, error, onChange, groupId, groups = [], noRecords = false } = props;
  // One draft at a time, so the amounts in the list can't go stale behind a second open card.
  const [draft, setDraft] = useState<Draft | null>(null);
  const [creating, setCreating] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);

  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? 'Unknown';

  async function record(transfer: Transfer) {
    const body = settlementRequest(transfer, people, groupId);
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
  const nothingYet =
    groupId === undefined
      ? account.people.length === 0 && 'Nothing to settle yet. Add an expense in the chat.'
      : noRecords && 'Nothing to settle yet. Add an expense in the chat and pick this group on its card.';

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
          groups={groups}
          onSaved={() => {
            setDraft(null);
            onChange();
          }}
          onClose={() => setDraft(null)}
        />
      )}

      {plan.transfers.length === 0 ? (
        <p className="hint">{nothingYet || 'All settled up.'}</p>
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
          <p className="hint">
            {groupId === undefined
              ? 'These payments simplify across everyone, so amounts can differ from the direct debts on the left.'
              : 'These payments simplify across this group, so amounts can differ from who paid for what.'}
          </p>
          {groupId === undefined && groups.length > 0 && (
            <p className="hint">If this payment belongs to a group, pick it on the card, or record it in the Groups tab.</p>
          )}
        </>
      )}
    </div>
  );
}
