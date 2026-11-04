// Pure helpers for navigation. Tabs and the bottom bar share one state, so changing layout never loses your place.
export type TabId = 'settle' | 'expenses' | 'charts' | 'groups';
export type NavId = 'home' | 'expenses' | 'groups' | 'charts' | 'chat';

export const NAV_ITEMS: { id: NavId; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'groups', label: 'Groups' },
  { id: 'charts', label: 'Charts' },
  { id: 'chat', label: 'Chat' },
];

/** Where a bottom bar item goes. Chat keeps the current tab underneath, so going back returns to it. */
export function navTarget(id: NavId, currentTab: TabId): { tab: TabId; chatOpen: boolean } {
  if (id === 'chat') return { tab: currentTab, chatOpen: true };
  return { tab: id === 'home' ? 'settle' : id, chatOpen: false };
}

export function activeNav(tab: TabId, chatOpen: boolean): NavId {
  if (chatOpen) return 'chat';
  return tab === 'settle' ? 'home' : tab;
}
