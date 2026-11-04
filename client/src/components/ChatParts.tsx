import { Bot, CircleAlert } from 'lucide-react';
import { Markdown } from './Markdown';

export function BotAvatar({ large = false }: { large?: boolean }) {
  return (
    <span className={large ? 'bot-avatar large' : 'bot-avatar'} aria-hidden="true">
      <Bot />
    </span>
  );
}

/** One message: the user's on the right, replies on the left with the SplitBot avatar. */
export function ChatBubble({ kind, text }: { kind: 'user' | 'model' | 'error'; text: string }) {
  if (kind === 'model') {
    return (
      <div className="bubble-row model">
        <BotAvatar />
        <div className="bubble model">
          <Markdown text={text} />
        </div>
      </div>
    );
  }
  if (kind === 'error') {
    return (
      <div className="bubble-row error">
        <p className="bubble error" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{text}</span>
        </p>
      </div>
    );
  }
  return (
    <div className="bubble-row user">
      <p className="bubble user">{text}</p>
    </div>
  );
}
