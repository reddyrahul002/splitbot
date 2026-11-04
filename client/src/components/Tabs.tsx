import { useState, type ReactNode } from 'react';

export interface Tab {
  id: string;
  label: string;
  content: ReactNode;
}

/** Only the active tab's content is mounted. */
export function Tabs({ tabs }: { tabs: Tab[] }) {
  const [activeId, setActiveId] = useState(tabs[0]?.id);
  const active = tabs.find((tab) => tab.id === activeId);

  return (
    <section className="tabs">
      <div className="tab-list" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className={tab.id === activeId ? 'tab active' : 'tab'}
            aria-selected={tab.id === activeId}
            onClick={() => setActiveId(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="tab-panel" role="tabpanel">
        {active?.content}
      </div>
    </section>
  );
}
