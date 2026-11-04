import { AccountSummary } from './components/AccountSummary';
import { Chat } from './components/Chat';
import { Expenses } from './components/Expenses';
import { SettleUp } from './components/SettleUp';
import { Tabs, type Tab } from './components/Tabs';
import { useAppData } from './useAppData';

const comingSoon = (what: string) => <p className="hint">{what} will appear here.</p>;

export function App() {
  const { people, account, plan, expenses, settlements, error, refresh } = useAppData();

  const tabs: Tab[] = [
    { id: 'settle', label: 'Smart settle up', content: <SettleUp account={account} plan={plan} people={people} error={error} onChange={refresh} /> },
    { id: 'expenses', label: 'Expenses', content: <Expenses expenses={expenses} settlements={settlements} people={people} error={error} onChange={refresh} /> },
    { id: 'charts', label: 'Charts', content: comingSoon('Spending charts') },
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
          <Chat people={people} onChange={refresh} />
        </div>
      </div>
    </main>
  );
}
