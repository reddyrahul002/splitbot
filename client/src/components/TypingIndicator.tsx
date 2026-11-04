import { BotAvatar } from './ChatParts';

/** Dots for sighted users, words for screen readers. */
export function TypingIndicator() {
  return (
    <div className="bubble-row model">
      <BotAvatar />
      <div className="bubble model typing" role="status">
        <span className="visually-hidden">Thinking…</span>
        <span className="typing-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </div>
    </div>
  );
}
