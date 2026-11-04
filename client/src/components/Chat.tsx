import { useEffect, useRef, useState, type FormEvent } from 'react';
import { SendHorizontal, X } from 'lucide-react';
import type { ChatMessage, Draft, Group, Person } from '@splitbot/shared';
import { sendChat } from '../api';
import { buildHistory, MAX_TEXT } from '../draftLogic';
import { BotAvatar, ChatBubble } from './ChatParts';
import { DraftCard } from './DraftCard';
import { TypingIndicator } from './TypingIndicator';

const EXAMPLES = [
  'Dinner $90, I paid, split with Arun and Mei, Arun had $12 of drinks',
  'How much does Arun owe me?',
  'Lunch $40 split with Aroon',
];

/** Errors are shown but aren't part of the history sent to Gemini. */
type Item = { id: number; kind: 'user' | 'model' | 'error'; text: string; drafts?: Draft[] };

const toMessages = (items: Item[]): ChatMessage[] =>
  items.flatMap((item) => (item.kind === 'error' ? [] : [{ role: item.kind, text: item.text }]));

export function Chat({ people, groups, onChange, onClose }: { people: Person[]; groups?: Group[]; onChange: () => void; onClose?: () => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const nextId = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [items, busy]);

  useEffect(() => {
    if (!busy) inputRef.current?.focus();
  }, [busy]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    const userItem: Item = { id: nextId.current++, kind: 'user', text };
    const history = buildHistory([...toMessages(items), { role: 'user', text }]);
    setItems((current) => [...current, userItem]);
    setInput('');
    setBusy(true);
    try {
      const { reply, drafts } = await sendChat(history);
      setItems((current) => [...current, { id: nextId.current++, kind: 'model', text: reply, drafts }]);
      onChange();
    } catch (err) {
      // The message wasn't answered: take it out of the history and put it back in the box to resend.
      const message = err instanceof Error ? err.message : String(err);
      setItems((current) => [...current.filter((i) => i.id !== userItem.id), { id: nextId.current++, kind: 'error', text: message }]);
      setInput(text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="chat">
      <header className="chat-header">
        <BotAvatar />
        <div>
          <h2>Ask SplitBot</h2>
          <p>Nothing saves until you confirm.</p>
        </div>
        {onClose && (
          <button type="button" className="icon-button chat-close" aria-label="Close chat" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        )}
      </header>
      <div className="messages">
        {items.length === 0 && (
          <div className="chat-welcome">
            <BotAvatar large />
            <p className="hint">Type an expense or a question, or start from an example below.</p>
            <div className="chips">
              {EXAMPLES.map((example) => (
                <button key={example} type="button" className="chip" onClick={() => setInput(example)}>
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}
        {items.map((item) => (
          <div key={item.id} className="item">
            <ChatBubble kind={item.kind} text={item.text} />
            {item.drafts?.map((draft) => <DraftCard key={draft.id} draft={draft} people={people} groups={groups} onSaved={onChange} />)}
          </div>
        ))}
        {busy && <TypingIndicator />}
        <div ref={endRef} />
      </div>

      <form className="composer" onSubmit={send}>
        <input
          id="chat-input"
          ref={inputRef}
          value={input}
          maxLength={MAX_TEXT}
          disabled={busy}
          placeholder="Type an expense or a question…"
          aria-label="Message"
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" className="with-icon" disabled={busy || !input.trim()}>
          <SendHorizontal aria-hidden="true" />
          Send
        </button>
      </form>
    </section>
  );
}
