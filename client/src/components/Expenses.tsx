import { useState } from 'react';
import { CATEGORIES, formatCents, type Category, type Expense, type Person, type Settlement } from '@splitbot/shared';
import { ApiRequestError, deleteExpense, deleteSettlement } from '../api';
import { expenseDetail, filterHistory, mergeHistory, settlementText, type HistoryItem } from '../history';

const keyOf = (item: HistoryItem) => (item.kind === 'expense' ? `expense:${item.expense.id}` : `settlement:${item.settlement.id}`);

/** One record. Delete takes two clicks: Cancel lands where Delete was, so a double click deletes nothing. */
export function HistoryRow(props: {
  item: HistoryItem;
  people: Person[];
  confirming: boolean;
  busy: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const { item, people, confirming, busy, onAsk, onCancel, onDelete } = props;
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? 'Unknown';
  const title = item.kind === 'expense' ? item.expense.description : settlementText(item.settlement, nameOf);
  const details = item.kind === 'expense' ? expenseDetail(item.expense, nameOf) : [item.settlement.date, 'Payment'];
  const cents = item.kind === 'expense' ? item.expense.totalCents : item.settlement.cents;

  return (
    <li className="history-row">
      <div className="history-main">
        <div className="history-title">
          <span>{title}</span>
          <strong>{formatCents(cents)}</strong>
        </div>
        <div className="history-detail">{details.join(' · ')}</div>
      </div>
      <div className="history-actions">
        {confirming ? (
          <>
            <button type="button" className="danger" disabled={busy} onClick={onDelete}>
              Yes, delete
            </button>
            <button type="button" disabled={busy} onClick={onCancel}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" disabled={busy} onClick={onAsk}>
            Delete
          </button>
        )}
      </div>
    </li>
  );
}

export function Expenses(props: {
  expenses: Expense[] | null;
  settlements: Settlement[] | null;
  people: Person[];
  error: string | null;
  onChange: () => void;
}) {
  const { expenses, settlements, people, error, onChange } = props;
  const [category, setCategory] = useState<Category | ''>('');
  const [personId, setPersonId] = useState('');
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (!expenses || !settlements) {
    return error ? (
      <p className="panel-error" role="alert">
        {error}
      </p>
    ) : (
      <p className="hint">Loading…</p>
    );
  }

  async function remove(item: HistoryItem) {
    setBusy(true);
    try {
      if (item.kind === 'expense') await deleteExpense(item.expense.id);
      else await deleteSettlement(item.settlement.id);
      setDeleteError(null);
      setConfirmingKey(null);
      onChange();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
      // It's already gone (say, deleted in another window): show the list as it is now.
      if (err instanceof ApiRequestError && err.code === 'NOT_FOUND') {
        setConfirmingKey(null);
        onChange();
      }
    } finally {
      setBusy(false);
    }
  }

  const all = mergeHistory(expenses, settlements);
  const shown = filterHistory(all, { category: category || undefined, personId: personId || undefined });

  return (
    <div className="expenses">
      <div className="filters">
        <label className="field">
          <span>Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value as Category | '')}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Person</span>
          <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
            <option value="">Everyone</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {category && <p className="hint">Payments have no category, so they're hidden while one is selected.</p>}

      {deleteError && (
        <p className="panel-error" role="alert">
          {deleteError}
        </p>
      )}

      {all.length === 0 ? (
        <p className="hint">No expenses yet. Add one in the chat.</p>
      ) : shown.length === 0 ? (
        <p className="hint">Nothing matches these filters.</p>
      ) : (
        <ul className="history">
          {shown.map((item) => (
            <HistoryRow
              key={keyOf(item)}
              item={item}
              people={people}
              confirming={confirmingKey === keyOf(item)}
              busy={busy}
              onAsk={() => setConfirmingKey(keyOf(item))}
              onCancel={() => setConfirmingKey(null)}
              onDelete={() => remove(item)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
