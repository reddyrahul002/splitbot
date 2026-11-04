import { ChartColumn, House, MessageCircle, ReceiptText, UsersRound, type LucideIcon } from 'lucide-react';
import { NAV_ITEMS, type NavId } from '../navLogic';

const ICONS: Record<NavId, LucideIcon> = { home: House, expenses: ReceiptText, groups: UsersRound, charts: ChartColumn, chat: MessageCircle };

/** The phone layout's navigation. CSS shows it only below 768px. */
export function BottomTabBar({ active, onSelect }: { active: NavId; onSelect: (id: NavId) => void }) {
  return (
    <nav className="bottom-nav" aria-label="Main">
      {NAV_ITEMS.map(({ id, label }) => {
        const Icon = ICONS[id];
        return (
          <button key={id} type="button" className="nav-item" aria-current={id === active ? 'page' : undefined} onClick={() => onSelect(id)}>
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
