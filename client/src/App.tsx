import { AccountSummary } from './components/AccountSummary';
import { AppShell } from './components/AppShell';
import { Charts } from './components/Charts';
import { Chat } from './components/Chat';
import { Expenses } from './components/Expenses';
import { Groups } from './components/Groups';
import { SettleUp } from './components/SettleUp';
import { Tabs, type Tab } from './components/Tabs';
import { useAppData } from './useAppData';
import { useTheme } from './useTheme';

export function App() {
  const { people, account, plan, expenses, settlements, summary, groups, error, refresh } = useAppData();
  const { theme, toggle } = useTheme();
  const groupList = groups?.map((s) => s.group);

  const tabs: Tab[] = [
    { id: 'settle', label: 'Settle up', content: <SettleUp account={account} plan={plan} people={people} error={error} onChange={refresh} groups={groupList} /> },
    { id: 'expenses', label: 'Expenses', content: <Expenses expenses={expenses} settlements={settlements} people={people} error={error} onChange={refresh} /> },
    { id: 'charts', label: 'Charts', content: <Charts summary={summary} account={account} people={people} error={error} /> },
    { id: 'groups', label: 'Groups', content: <Groups groups={groups} people={people} error={error} onChange={refresh} /> },
  ];

  return (
    <AppShell theme={theme} onToggleTheme={toggle}>
      <div className="columns">
        <aside className="column" aria-label="Balances">
          <AccountSummary account={account} people={people} error={error} />
        </aside>
        <main className="column">
          <Tabs tabs={tabs} />
        </main>
        <aside className="column chat-column" aria-label="Chat with SplitBot">
          <Chat people={people} groups={groupList} onChange={refresh} />
        </aside>
      </div>
    </AppShell>
  );
}
