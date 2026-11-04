import { useState } from 'react';
import { ReceiptText, SearchX, Trash2, Users } from 'lucide-react';
import { CATEGORIES, formatCents, type Category, type Expense, type Group, type Person, type Settlement } from '@splitbot/shared';
import { ApiRequestError, deleteExpense, deleteSettlement } from '../api';
import { useOpenChat } from '../chatOpener';
import { shortDate } from '../display';
import { expenseDetail, filterHistory, mergeHistory, settlementText, type HistoryItem } from '../history';
import { useExitingItems } from '../useExitingItems';
import { CategoryChip } from './CategoryChip';
import { EmptyState } from './EmptyState';
import { Skeleton } from './Skeleton';
import { useToast } from './Toast';
import { TransferAvatars } from './TransferAvatars';

const keyOf = (item: HistoryItem) => (item.kind === 'expense' ? `expense:${item.expense.id}` : `settlement:${item.settlement.id}`);

/** One record. Delete takes two clicks: Cancel lands where Delete was, so a double click deletes nothing. */
export function HistoryRow(props: {
  item: HistoryItem;
  people: Person[];
  /** To name the group on the badge. */
  groups?: Group[];
  confirming: boolean;
  busy: boolean;
  /** Deleted, and animating out. */
  exiting?: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const { item, people, groups = [], confirming, busy, exiting = false, onAsk, onCancel, onDelete } = props;
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? 'Unknown';
  const record = item.kind === 'expense' ? item.expense : item.settlement;
  const title = item.kind === 'expense' ? item.expense.description : settlementText(item.settlement, nameOf);
  const [, , paidBy, share] = item.kind === 'expense' ? expenseDetail(item.expense, nameOf) : [];
  const cents = item.kind === 'expense' ? item.expense.totalCents : item.settlement.cents;
  const groupName = groups.find((g) => g.id === record.groupId)?.name;

  return (
    <li className={exiting ? 'history-row exiting' : 'history-row'} inert={exiting}>
      {item.kind === 'expense' ? <CategoryChip category={item.expense.category} iconOnly /> : <TransferAvatars from={item.settlement.from} to={item.settlement.to} people={people} />}
      <div className="history-main">
        <div className="history-title">
          <span>{title}</span>
          {groupName && (
            <span className="badge group">
              <Users aria-hidden="true" />
              {groupName}
            </span>
          )}
        </div>
        <div className="history-detail">
          {paidBy ?? 'Payment'} · {shortDate(record.date)}
        </div>
        {share && <div className="history-detail">{share}</div>}
      </div>
      <strong className="history-amount">{formatCents(cents)}</strong>
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
          <button type="button" className="with-icon" disabled={busy} onClick={onAsk}>
            <Trash2 aria-hidden="true" />
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
  groups?: Group[];
  error: string | null;
  onChange: () => void;
}) {
  const { expenses, settlements, people, groups, error, onChange } = props;
  const [category, setCategory] = useState<Category | ''>('');
  const [personId, setPersonId] = useState('');
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const openChat = useOpenChat();
  const toast = useToast();
  const all = mergeHistory(expenses ?? [], settlements ?? []);
  const shown = filterHistory(all, { category: category || undefined, personId: personId || undefined });
  const rows = useExitingItems(shown, keyOf, all);

  if (!expenses || !settlements) {
    return error ? (
      <p className="panel-error" role="alert">
        {error}
      </p>
    ) : (
      <Skeleton />
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
      toast('success', item.kind === 'expense' ? 'Expense deleted' : 'Payment deleted');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setDeleteError(message);
      toast('error', message);
      // It's already gone (say, deleted in another window): show the list as it is now.
      if (err instanceof ApiRequestError && err.code === 'NOT_FOUND') {
        setConfirmingKey(null);
        onChange();
      }
    } finally {
      setBusy(false);
    }
  }

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

      {rows.length === 0 && all.length === 0 ? (
        <EmptyState icon={ReceiptText} title="No expenses yet." body="Add one in the chat." action={{ label: 'Add an expense', onClick: openChat }} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Nothing matches these filters."
          action={{
            label: 'Clear filters',
            onClick: () => {
              setCategory('');
              setPersonId('');
            },
          }}
        />
      ) : (
        <ul className="history">
          {rows.map(({ item, exiting }) => (
            <HistoryRow
              key={keyOf(item)}
              item={item}
              people={people}
              groups={groups}
              confirming={confirmingKey === keyOf(item)}
              busy={busy}
              exiting={exiting}
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
