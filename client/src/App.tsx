import { AccountSummary } from './components/AccountSummary';
import { Chat } from './components/Chat';
import { Tabs, type Tab } from './components/Tabs';
import { useAppData } from './useAppData';

const comingSoon = (what: string) => <p className="hint">{what} will appear here.</p>;

const TABS: Tab[] = [
  { id: 'settle', label: 'Smart settle up', content: comingSoon('Suggested payments') },
  { id: 'expenses', label: 'Expenses', content: comingSoon('Expenses and payments') },
  { id: 'charts', label: 'Charts', content: comingSoon('Spending charts') },
];

export function App() {
  const { people, account, error, refresh } = useAppData();

  return (
    <main className="app">
      <h1>SplitBot</h1>
      <div className="columns">
        <div className="column">
          <AccountSummary account={account} people={people} error={error} />
        </div>
        <div className="column">
          <Tabs tabs={TABS} />
        </div>
        <div className="column chat-column">
          <Chat people={people} onChange={refresh} />
        </div>
      </div>
    </main>
  );
}
