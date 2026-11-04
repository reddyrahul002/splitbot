import { ME_ID, type GroupSummary, type Person } from '@splitbot/shared';
import { shortDate, tone } from '../display';
import { memberBalanceText } from '../groupLogic';
import { AvatarStack } from './AvatarStack';
import { ToneIcon } from './ToneIcon';

/** One group at a glance. Choosing it shows its details below. */
export function GroupCard(props: { summary: GroupSummary; people: Person[]; selected: boolean; lastDate: string | null; onSelect: () => void }) {
  const { summary, people, selected, lastDate, onSelect } = props;
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? 'Unknown';
  const { memberIds, name } = summary.group;
  const mine = summary.balances.find((b) => b.personId === ME_ID) ?? { personId: ME_ID, netCents: 0 };

  return (
    <button type="button" className={selected ? 'group-card selected' : 'group-card'} aria-pressed={selected} onClick={onSelect}>
      <span className="group-card-top">
        <span className="group-card-name">{name}</span>
        <AvatarStack people={memberIds.map((id) => ({ id, name: nameOf(id) }))} />
      </span>
      <span className="group-card-meta">{memberIds.length === 1 ? '1 member' : `${memberIds.length} members`}</span>
      <span className={`group-card-balance ${tone(mine.netCents)}`}>
        <ToneIcon cents={mine.netCents} />
        {memberBalanceText(mine, nameOf)}
      </span>
      <span className="group-card-meta">{lastDate ? `Last activity ${shortDate(lastDate)}` : 'No activity yet'}</span>
    </button>
  );
}
