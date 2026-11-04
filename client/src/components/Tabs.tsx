import { useState, type KeyboardEvent, type ReactNode } from 'react';

export interface Tab {
  id: string;
  label: string;
  content: ReactNode;
}

/** Only the active tab's content is mounted. Pass `activeId` and `onChange` to control it from outside. */
export function Tabs({ tabs, activeId, onChange }: { tabs: Tab[]; activeId?: string; onChange?: (id: string) => void }) {
  const [ownId, setOwnId] = useState(tabs[0]?.id);
  const currentId = activeId ?? ownId;
  const active = tabs.find((tab) => tab.id === currentId);

  function select(id: string) {
    setOwnId(id);
    onChange?.(id);
  }

  function onKeyDown(event: KeyboardEvent, index: number) {
    const targets: Record<string, number> = {
      ArrowRight: (index + 1) % tabs.length,
      ArrowLeft: (index - 1 + tabs.length) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    };
    const target = tabs[targets[event.key] ?? -1];
    if (!target) return;
    event.preventDefault();
    select(target.id);
    document.getElementById(`tab-${target.id}`)?.focus();
  }

  return (
    <section className="tabs">
      <div className="tab-list" role="tablist">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            type="button"
            role="tab"
            className={tab.id === currentId ? 'tab active' : 'tab'}
            aria-selected={tab.id === currentId}
            aria-controls={`panel-${tab.id}`}
            tabIndex={tab.id === currentId ? 0 : -1}
            onClick={() => select(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="tab-panel" id={`panel-${currentId}`} role="tabpanel" aria-labelledby={`tab-${currentId}`}>
        {active?.content}
      </div>
    </section>
  );
}
