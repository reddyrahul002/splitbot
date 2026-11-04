import { useEffect, type ReactNode } from 'react';

/**
 * Chat's one home in every layout: CSS makes it a column, a drawer or a full view, so its messages and open drafts are
 * never unmounted. `modal` means it's open as a tablet drawer, covering the page.
 */
export function ChatDrawer({ modal, onClose, children }: { modal: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!modal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [modal, onClose]);

  return (
    <>
      {modal && <div className="chat-backdrop" aria-hidden="true" onClick={onClose} />}
      <aside className="column chat-column" aria-label="Chat with SplitBot" role={modal ? 'dialog' : undefined} aria-modal={modal || undefined}>
        {children}
      </aside>
    </>
  );
}
