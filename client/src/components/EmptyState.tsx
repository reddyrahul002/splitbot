import type { LucideIcon } from 'lucide-react';

/** The title and body read as consecutive sentences. */
export function EmptyState(props: { icon: LucideIcon; title: string; body?: string; action?: { label: string; onClick: () => void } }) {
  const { icon: Icon, title, body, action } = props;
  return (
    <div className="empty-state">
      <span className="empty-icon" aria-hidden="true">
        <Icon />
      </span>
      <p className="empty-title">{title}</p>
      {body && <p className="empty-body">{body}</p>}
      {action && (
        <button type="button" className="action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
