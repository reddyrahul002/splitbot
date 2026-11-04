import { useRef, useState, type FormEvent } from 'react';
import { UsersRound } from 'lucide-react';
import { ME_ID, type Expense, type GroupSummary, type Person, type Settlement } from '@splitbot/shared';
import { addGroupMember, createGroup } from '../api';
import { addablePeople, lastActivity, memberBalanceText } from '../groupLogic';
import { Avatar } from './Avatar';
import { EmptyState } from './EmptyState';
import { GroupCard } from './GroupCard';
import { SettleUp } from './SettleUp';
import { Skeleton } from './Skeleton';
import { useToast } from './Toast';

export function Groups(props: {
  groups: GroupSummary[] | null;
  people: Person[];
  /** For each card's last activity. */
  expenses?: Expense[] | null;
  settlements?: Settlement[] | null;
  error: string | null;
  onChange: () => void;
}) {
  const { groups, people, expenses, settlements, error, onChange } = props;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [memberId, setMemberId] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const toast = useToast();

  if (!groups) {
    return error ? (
      <p className="panel-error" role="alert">
        {error}
      </p>
    ) : (
      <Skeleton />
    );
  }

  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? 'Unknown';
  const current = groups.find((s) => s.group.id === selectedId) ?? groups[0];

  async function act(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      setActionError(null);
      onChange();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setActionError(message);
      toast('error', message);
    } finally {
      setBusy(false);
    }
  }

  function create(event: FormEvent) {
    event.preventDefault();
    void act(async () => {
      const group = await createGroup(name.trim());
      setSelectedId(group.id);
      setName('');
    });
  }

  function addMember(event: FormEvent, groupId: string) {
    event.preventDefault();
    void act(async () => {
      await addGroupMember(groupId, memberId);
      setMemberId('');
    });
  }

  const addable = current ? addablePeople(current.group, people) : [];

  return (
    <div className="groups">
      <form className="group-form" onSubmit={create}>
        <label className="field">
          <span>New group</span>
          <input ref={nameInput} value={name} maxLength={60} placeholder="Trip to Bali" disabled={busy} onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="submit" disabled={busy || !name.trim()}>
          Create group
        </button>
      </form>

      {actionError && (
        <p className="panel-error" role="alert">
          {actionError}
        </p>
      )}

      {!current ? (
        <EmptyState
          icon={UsersRound}
          title="No groups yet."
          body="Create one to track a trip or a household on its own."
          action={{ label: 'Name your first group', onClick: () => nameInput.current?.focus() }}
        />
      ) : (
        <>
          <div className="group-cards">
            {groups.map((s) => (
              <GroupCard
                key={s.group.id}
                summary={s}
                people={people}
                selected={s.group.id === current.group.id}
                lastDate={lastActivity(s.group.id, expenses ?? [], settlements ?? [])}
                onSelect={() => {
                  setSelectedId(s.group.id);
                  setMemberId('');
                }}
              />
            ))}
          </div>

          <label className="field group-picker">
            <span>Viewing</span>
            <select
              value={current.group.id}
              onChange={(e) => {
                setSelectedId(e.target.value);
                setMemberId('');
              }}
            >
              {groups.map((s) => (
                <option key={s.group.id} value={s.group.id}>
                  {s.group.name}
                </option>
              ))}
            </select>
          </label>

          <section className="group-section">
            <h2>Members</h2>
            <ul className="member-chips">
              {current.group.memberIds.map((id) => (
                <li key={id}>
                  <Avatar name={nameOf(id)} isYou={id === ME_ID} size="sm" />
                  <span>{id === ME_ID ? 'You' : nameOf(id)}</span>
                </li>
              ))}
            </ul>
            <form className="group-form" onSubmit={(event) => addMember(event, current.group.id)}>
              <label className="field">
                <span>Add a person</span>
                <select value={memberId} disabled={busy || addable.length === 0} onChange={(e) => setMemberId(e.target.value)}>
                  <option value="">{addable.length === 0 ? 'Everyone is already a member' : 'Choose a person'}</option>
                  {addable.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" disabled={busy || memberId === ''}>
                Add member
              </button>
            </form>
            <p className="hint">Not listed? Anyone on an expense in this group joins this group automatically when you confirm it.</p>
          </section>

          <section className="group-section">
            <h2>Balances in this group</h2>
            <ul className="group-balances">
              {current.balances.map((balance) => (
                <li key={balance.personId}>
                  <Avatar name={nameOf(balance.personId)} isYou={balance.personId === ME_ID} size="sm" />
                  <span>{memberBalanceText(balance, nameOf)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="group-section">
            <h2>Smart settle up for this group</h2>
            {/* Keyed so an open payment card doesn't carry over to another group. */}
            <SettleUp
              key={current.group.id}
              account={current.account}
              plan={current.plan}
              people={people}
              error={null}
              onChange={onChange}
              groupId={current.group.id}
              groups={groups.map((s) => s.group)}
              noRecords={current.recordCount === 0}
            />
            <p className="hint">Payments recorded outside this group don't change these balances.</p>
          </section>
        </>
      )}
    </div>
  );
}
