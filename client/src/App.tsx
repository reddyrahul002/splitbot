import { AccountSummary } from './components/AccountSummary';
import { Charts } from './components/Charts';
import { Chat } from './components/Chat';
import { Expenses } from './components/Expenses';
import { Groups } from './components/Groups';
import { SettleUp } from './components/SettleUp';
import { Tabs, type Tab } from './components/Tabs';
import { useAppData } from './useAppData';

export function App() {
  const { people, account, plan, expenses, settlements, summary, groups, error, refresh } = useAppData();
  const groupList = groups?.map((s) => s.group);

  const tabs: Tab[] = [
    { id: 'settle', label: 'Smart settle up', content: <SettleUp account={account} plan={plan} people={people} error={error} onChange={refresh} groups={groupList} /> },
    { id: 'expenses', label: 'Expenses', content: <Expenses expenses={expenses} settlements={settlements} people={people} error={error} onChange={refresh} /> },
    { id: 'charts', label: 'Charts', content: <Charts summary={summary} account={account} people={people} error={error} /> },
    { id: 'groups', label: 'Groups', content: <Groups groups={groups} people={people} error={error} onChange={refresh} /> },
  ];

  return (
    <main className="app">
      <h1>SplitBot</h1>
      <div className="columns">
        <div className="column">
          <AccountSummary account={account} people={people} error={error} />
        </div>
        <div className="column">
          <Tabs tabs={tabs} />
        </div>
        <div className="column chat-column">
          <Chat people={people} groups={groupList} onChange={refresh} />
        </div>
      </div>
    </main>
  );
}
