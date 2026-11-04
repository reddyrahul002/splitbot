import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CATEGORIES, formatCents, NEW_PERSON_PREFIX, type Category, type Draft, type DraftEdits, type Person } from '@splitbot/shared';
import { ApiRequestError, confirmDraft, discardDraft, editDraft } from '../api';
import { confirmIfValid, createEditQueue, inputProblem, parseDollars, replaceEditFor, type TypedInput } from '../draftLogic';

type Status = 'open' | 'saved' | 'discarded' | 'expired';

/**
 * A text-like input that commits on blur or Enter. `onCommit` resolving to false puts the last good value back. Text that
 * fails `check` stays in the input and isn't committed, with the result reported through `onCheck`.
 */
function Field(props: {
  label: string;
  value: string;
  type?: string;
  disabled: boolean;
  onCommit: (text: string) => Promise<boolean>;
  check?: (text: string) => string | null;
  onCheck?: (problem: string | null) => void;
  onText?: (text: string) => void;
}) {
  const { label, value, type = 'text', disabled, onCommit, check, onCheck, onText } = props;
  const [text, setText] = useState(value);
  const update = (next: string) => {
    setText(next);
    onText?.(next);
  };
  useEffect(() => update(value), [value]);

  async function commit() {
    const problem = check?.(text) ?? null;
    onCheck?.(problem);
    if (problem || text === value) return;
    if (!(await onCommit(text))) update(value);
  }

  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={text}
        disabled={disabled}
        onChange={(e) => update(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </label>
  );
}

function Select(props: { label: string; value: string; disabled: boolean; onChange: (value: string) => void; children: ReactNode }) {
  const { label, value, disabled, onChange, children } = props;
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </label>
  );
}

export function DraftCard(props: {
  draft: Draft;
  people: Person[];
  onSaved: () => void;
  /** Called after Discard, and offered as a Close button on an expired draft. Without it the card stays in place. */
  onClose?: () => void;
}) {
  const { draft: initial, people, onSaved, onClose } = props;
  const [draft, setDraft] = useState(initial);
  const [status, setStatus] = useState<Status>('open');
  const [error, setError] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [queue] = useState(createEditQueue);
  // What's in the inputs right now, so Confirm checks that and not what was last saved to the draft.
  const typed = useRef<TypedInput>({});

  const locked = status !== 'open' || finishing;
  const known = [...people, ...draft.newPeople];
  const nameOf = (id: string) => known.find((p) => p.id === id)?.name ?? 'Unknown';
  const isNew = (id: string) => status !== 'saved' && id.startsWith(NEW_PERSON_PREFIX);

  function fail(err: unknown) {
    if (err instanceof ApiRequestError && err.code === 'DRAFT_NOT_FOUND') setStatus('expired');
    setError(err instanceof Error ? err.message : String(err));
  }

  const edit = (edits: DraftEdits) =>
    queue.run(async () => {
      try {
        setDraft(await editDraft(draft.id, edits));
        setError(null);
        return true;
      } catch (err) {
        fail(err);
        return false;
      }
    });

  function editDescription(text: string) {
    const description = text.trim();
    if (draft.kind !== 'expense') return Promise.resolve(false);
    if (description === draft.expense.description) return Promise.resolve(false);
    return edit({ description });
  }

  function editAmount(text: string) {
    const cents = parseDollars(text);
    if (cents === null) return Promise.resolve(false);
    // "90" over "$90.00" isn't an edit: a PATCH would clear the amount warning without the amount changing.
    if (draft.kind === 'expense') return cents === draft.expense.totalCents ? Promise.resolve(false) : edit({ totalCents: cents });
    return cents === draft.settlement.cents ? Promise.resolve(false) : edit({ cents });
  }

  async function confirm() {
    setFinishing(true);
    try {
      // An edit from this same click (blur, then click) goes first. If an edit failed, stay here so the error can be read.
      await confirmIfValid({
        typed: typed.current,
        queue,
        onInvalid: setInputError,
        // The edit's own error is usually still showing; a later edit in the same burst can have cleared it.
        onEditFailed: () => setError((current) => current ?? 'That edit failed. Check the values, then click Confirm again.'),
        confirm: async () => {
          await confirmDraft(draft.id);
          setStatus('saved');
          setError(null);
          setInputError(null);
          onSaved();
        },
      });
    } catch (err) {
      fail(err);
    } finally {
      setFinishing(false);
    }
  }

  async function discard() {
    setFinishing(true);
    try {
      await queue.settled();
      await discardDraft(draft.id);
      setStatus('discarded');
      setError(null);
      onClose?.();
    } catch (err) {
      fail(err);
    } finally {
      setFinishing(false);
    }
  }

  if (status === 'discarded') return <div className="card muted">Draft discarded.</div>;

  const date = draft.kind === 'expense' ? draft.expense.date : draft.settlement.date;

  return (
    <div className={`card ${status}`}>
      <div className="card-title">
        {draft.kind === 'expense' ? 'Expense draft' : 'Payment draft'}
        {status === 'saved' && <span className="badge saved">Saved</span>}
      </div>

      {status === 'open' &&
        draft.warnings.map((warning) => {
          const useSuggestion = replaceEditFor(draft, warning);
          return (
            <div key={`${warning.code}:${warning.message}`} className="warning" role="status">
              <span>{warning.message}</span>
              {useSuggestion && warning.suggestion && (
                <button type="button" disabled={locked} onClick={() => edit(useSuggestion)}>
                  Use {warning.suggestion.person.name}
                </button>
              )}
            </div>
          );
        })}

      {draft.kind === 'expense' ? (
        <>
          <div className="fields">
            <Field
              label="Description"
              value={draft.expense.description}
              disabled={locked}
              onCommit={editDescription}
              check={(description) => inputProblem({ description })}
              onCheck={setInputError}
              onText={(description) => {
                typed.current.description = description;
              }}
            />
            <Field
              label="Amount"
              value={formatCents(draft.expense.totalCents)}
              disabled={locked}
              onCommit={editAmount}
              check={(amount) => inputProblem({ amount })}
              onCheck={setInputError}
              onText={(amount) => {
                typed.current.amount = amount;
              }}
            />
            <Select label="Paid by" value={draft.expense.paidBy} disabled={locked} onChange={(paidBy) => edit({ paidBy })}>
              {known.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <Select label="Category" value={draft.expense.category} disabled={locked} onChange={(category) => edit({ category: category as Category })}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
            <Field label="Date" type="date" value={date} disabled={locked} onCommit={(text) => edit({ date: text })} />
          </div>
          <table className="shares">
            <thead>
              <tr>
                <th>Person</th>
                <th>Share</th>
              </tr>
            </thead>
            <tbody>
              {draft.expense.shares.map((share) => (
                <tr key={share.personId}>
                  <td>
                    {nameOf(share.personId)}
                    {isNew(share.personId) && <span className="badge new">new</span>}
                  </td>
                  <td>{formatCents(share.cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {isNew(draft.expense.paidBy) && !draft.expense.shares.some((s) => s.personId === draft.expense.paidBy) && (
            <p className="payer-note">
              Paid by {nameOf(draft.expense.paidBy)}
              <span className="badge new">new</span>
            </p>
          )}
        </>
      ) : (
        <>
          <p className="transfer">
            {nameOf(draft.settlement.from)}
            {isNew(draft.settlement.from) && <span className="badge new">new</span>} paid {nameOf(draft.settlement.to)}
            {isNew(draft.settlement.to) && <span className="badge new">new</span>}
          </p>
          <div className="fields">
            <Field
              label="Amount"
              value={formatCents(draft.settlement.cents)}
              disabled={locked}
              onCommit={editAmount}
              check={(amount) => inputProblem({ amount })}
              onCheck={setInputError}
              onText={(amount) => {
                typed.current.amount = amount;
              }}
            />
            <Field label="Date" type="date" value={date} disabled={locked} onCommit={(text) => edit({ date: text })} />
          </div>
        </>
      )}

      {(inputError ?? error) && (
        <p className="card-error" role="alert">
          {inputError ?? error}
        </p>
      )}

      {status === 'open' && (
        <div className="actions">
          <button type="button" className="primary" disabled={finishing} onClick={confirm}>
            Confirm
          </button>
          <button type="button" disabled={finishing} onClick={discard}>
            Discard
          </button>
        </div>
      )}

      {status === 'expired' && onClose && (
        <div className="actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      )}
    </div>
  );
}
