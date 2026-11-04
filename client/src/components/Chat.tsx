import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ChatMessage, Draft, Group, Person } from '@splitbot/shared';
import { sendChat } from '../api';
import { buildHistory, MAX_TEXT } from '../draftLogic';
import { DraftCard } from './DraftCard';
import { Markdown } from './Markdown';

const EXAMPLES = [
  'Dinner $90, I paid, split with Arun and Mei, Arun had $12 of drinks',
  'How much does Arun owe me?',
  'Lunch $40 split with Aroon',
];

/** Errors are shown but aren't part of the history sent to Gemini. */
type Item = { id: number; kind: 'user' | 'model' | 'error'; text: string; drafts?: Draft[] };

const toMessages = (items: Item[]): ChatMessage[] =>
  items.flatMap((item) => (item.kind === 'error' ? [] : [{ role: item.kind, text: item.text }]));

export function Chat({ people, groups, onChange }: { people: Person[]; groups?: Group[]; onChange: () => void }) {
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
      <div className="messages">
        {items.length === 0 && <p className="hint">Type an expense or a question, or start from an example below.</p>}
        {items.map((item) => (
          <div key={item.id} className="item">
            {item.kind === 'model' ? (
              <div className="bubble model">
                <Markdown text={item.text} />
              </div>
            ) : (
              <p className={`bubble ${item.kind}`} role={item.kind === 'error' ? 'alert' : undefined}>
                {item.text}
              </p>
            )}
            {item.drafts?.map((draft) => <DraftCard key={draft.id} draft={draft} people={people} groups={groups} onSaved={onChange} />)}
          </div>
        ))}
        {busy && <p className="bubble model thinking">Thinking…</p>}
        <div ref={endRef} />
      </div>

      {items.length === 0 && (
        <div className="chips">
          {EXAMPLES.map((example) => (
            <button key={example} type="button" className="chip" onClick={() => setInput(example)}>
              {example}
            </button>
          ))}
        </div>
      )}
      <form className="composer" onSubmit={send}>
        <input
          ref={inputRef}
          value={input}
          maxLength={MAX_TEXT}
          disabled={busy}
          placeholder="Dinner $90, I paid, split with Arun and Mei…"
          aria-label="Message"
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}
