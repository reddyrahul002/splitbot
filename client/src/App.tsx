import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { ChatOpenerContext } from './chatOpener';
import { AccountSummary } from './components/AccountSummary';
import { AppShell } from './components/AppShell';
import { BottomTabBar } from './components/BottomTabBar';
import { Charts } from './components/Charts';
import { Chat } from './components/Chat';
import { ChatDrawer } from './components/ChatDrawer';
import { Expenses } from './components/Expenses';
import { Groups } from './components/Groups';
import { SettleUp } from './components/SettleUp';
import { Tabs, type Tab } from './components/Tabs';
import { ToastProvider, useToast } from './components/Toast';
import { withViewTransition } from './motion';
import { activeNav, navTarget, type NavId, type TabId } from './navLogic';
import { loadErrorToast } from './toastLogic';
import { useAppData } from './useAppData';
import { useMediaQuery } from './useMediaQuery';
import { useTheme } from './useTheme';

// Keep in step with the media queries in styles.css.
const DESKTOP = '(min-width: 1280px)';
const TABLET = '(min-width: 768px) and (max-width: 1279px)';

function Dashboard() {
  const { people, account, plan, expenses, settlements, summary, groups, error, refresh } = useAppData();
  const { theme, toggle } = useTheme();
  const toast = useToast();
  const groupList = groups?.map((s) => s.group);

  const [tab, setTab] = useState<TabId>('settle');
  const [chatOpen, setChatOpen] = useState(false);
  const isDesktop = useMediaQuery(DESKTOP);
  const isTablet = useMediaQuery(TABLET);
  const askButton = useRef<HTMLButtonElement>(null);
  const drawerOpen = isTablet && chatOpen;

  // On desktop chat is always showing, so "open" means nothing. Don't let it pop open when the window narrows later.
  useEffect(() => {
    if (isDesktop) setChatOpen(false);
  }, [isDesktop]);

  const openChat = useCallback(() => {
    if (!isDesktop) setChatOpen(true);
    requestAnimationFrame(() => document.getElementById('chat-input')?.focus());
  }, [isDesktop]);

  const closeChat = useCallback(() => {
    setChatOpen(false);
    requestAnimationFrame(() => askButton.current?.focus());
  }, []);

  function selectNav(id: NavId) {
    const target = navTarget(id, tab);
    withViewTransition(() => {
      setTab(target.tab);
      setChatOpen(target.chatOpen);
    });
  }

  const failedRefresh = loadErrorToast(error, account !== null);
  useEffect(() => {
    if (failedRefresh) toast('error', failedRefresh);
  }, [failedRefresh, toast]);

  const tabs: Tab[] = [
    { id: 'settle', label: 'Settle up', content: <SettleUp account={account} plan={plan} people={people} error={error} onChange={refresh} groups={groupList} /> },
    { id: 'expenses', label: 'Expenses', content: <Expenses expenses={expenses} settlements={settlements} people={people} groups={groupList} error={error} onChange={refresh} /> },
    { id: 'charts', label: 'Charts', content: <Charts summary={summary} account={account} people={people} error={error} /> },
    { id: 'groups', label: 'Groups', content: <Groups groups={groups} people={people} expenses={expenses} settlements={settlements} error={error} onChange={refresh} /> },
  ];

  return (
    <AppShell theme={theme} onToggleTheme={toggle} headerInert={drawerOpen}>
      <ChatOpenerContext.Provider value={openChat}>
        <div className={`columns tab-${tab}${chatOpen ? ' chat-open' : ''}`}>
          <aside className="column sidebar" aria-label="Balances" inert={drawerOpen}>
            <AccountSummary account={account} people={people} error={error} />
          </aside>
          <main className="column main-column" inert={drawerOpen}>
            <Tabs tabs={tabs} activeId={tab} onChange={(id) => setTab(id as TabId)} />
          </main>
          <ChatDrawer modal={drawerOpen} onClose={closeChat}>
            <Chat people={people} groups={groupList} onChange={refresh} onClose={closeChat} />
          </ChatDrawer>
          <button ref={askButton} type="button" className="ask-fab action with-icon" inert={drawerOpen} onClick={openChat}>
            <MessageCircle aria-hidden="true" />
            Ask SplitBot
          </button>
        </div>
        <BottomTabBar active={activeNav(tab, chatOpen)} onSelect={selectNav} />
      </ChatOpenerContext.Provider>
    </AppShell>
  );
}

export function App() {
  return (
    <ToastProvider>
      <Dashboard />
    </ToastProvider>
  );
}
