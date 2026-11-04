import { useState, type FormEvent } from 'react';
import type { GroupSummary, Person } from '@splitbot/shared';
import { addGroupMember, createGroup } from '../api';
import { addablePeople, memberBalanceText } from '../groupLogic';
import { SettleUp } from './SettleUp';

export function Groups(props: { groups: GroupSummary[] | null; people: Person[]; error: string | null; onChange: () => void }) {
  const { groups, people, error, onChange } = props;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [memberId, setMemberId] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!groups) {
    return error ? (
      <p className="panel-error" role="alert">
        {error}
      </p>
    ) : (
      <p className="hint">Loading…</p>
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
      setActionError(err instanceof Error ? err.message : String(err));
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
          <input value={name} maxLength={60} placeholder="Trip to Bali" disabled={busy} onChange={(e) => setName(e.target.value)} />
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
        <p className="hint">No groups yet. Create one to track a trip or a household on its own.</p>
      ) : (
        <>
          <label className="field group-picker">
            <span>Group</span>
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
            <p className="group-members">{current.group.memberIds.map(nameOf).join(', ')}</p>
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
                <li key={balance.personId}>{memberBalanceText(balance, nameOf)}</li>
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
