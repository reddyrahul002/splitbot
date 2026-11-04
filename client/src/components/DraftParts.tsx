import { Check, Clock, FileCheck } from 'lucide-react';
import { formatCents, ME_ID, type Draft, type Person } from '@splitbot/shared';
import { shortDate } from '../display';
import { expenseDetail, settlementText } from '../history';
import { useFlashOnChange } from '../useFlashOnChange';
import { Avatar } from './Avatar';
import { CategoryChip } from './CategoryChip';
import { TransferAvatars } from './TransferAvatars';

export type DraftStatus = 'open' | 'saved' | 'discarded' | 'expired';

const HEADINGS = {
  open: { Icon: FileCheck, title: 'Review before saving' },
  saved: { Icon: Check, title: 'Saved' },
  expired: { Icon: Clock, title: 'Draft expired' },
};

export function DraftHeader({ kind, status }: { kind: Draft['kind']; status: Exclude<DraftStatus, 'discarded'> }) {
  const { Icon, title } = HEADINGS[status];
  return (
    <div className="draft-header">
      <span className="draft-icon" aria-hidden="true">
        <Icon />
      </span>
      <div>
        <div className="draft-kind">{kind === 'expense' ? 'Expense' : 'Payment'}</div>
        <div className="draft-title">{title}</div>
      </div>
    </div>
  );
}

/** What a saved draft reads as once its fields have folded away. */
export function DraftSummary(props: { draft: Draft; people: Person[]; nameOf: (id: string) => string; groupName?: string }) {
  const { draft, people, nameOf, groupName } = props;
  const isExpense = draft.kind === 'expense';
  const date = shortDate(isExpense ? draft.expense.date : draft.settlement.date);
  const meta = isExpense ? [expenseDetail(draft.expense, nameOf)[2], date] : ['Payment', date];

  return (
    <div className="draft-summary">
      {isExpense ? <CategoryChip category={draft.expense.category} iconOnly /> : <TransferAvatars from={draft.settlement.from} to={draft.settlement.to} people={people} />}
      <div className="draft-summary-text">
        <div className="draft-summary-title">{isExpense ? draft.expense.description : settlementText(draft.settlement, nameOf)}</div>
        <div className="history-detail">{[...meta, ...(groupName ? [groupName] : [])].join(' · ')}</div>
      </div>
      <strong className="history-amount">{formatCents(isExpense ? draft.expense.totalCents : draft.settlement.cents)}</strong>
    </div>
  );
}

export function ShareRow({ personId, name, cents, isNew }: { personId: string; name: string; cents: number; isNew: boolean }) {
  const flashing = useFlashOnChange(cents);
  return (
    <tr>
      <td>
        <span className="share-person">
          <Avatar name={name} isYou={personId === ME_ID} size="sm" />
          <span>{name}</span>
          {isNew && <span className="badge new">new</span>}
        </span>
      </td>
      <td>
        <span className={flashing ? 'flash' : undefined}>{formatCents(cents)}</span>
      </td>
    </tr>
  );
}
