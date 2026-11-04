// Pure helpers for the chat and draft card. Money is computed on the server; these only convert input.
import { toCents, type ChatMessage, type Draft, type DraftEdits, type DraftWarning } from '@splitbot/shared';

/** POST /api/chat limits. */
export const MAX_HISTORY = 50;
export const MAX_TEXT = 4000;

/** Typed dollars ("90", "12.50", "$1,800") → integer cents, or null if it isn't a whole number of cents. */
export function parseDollars(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\$?(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(trimmed)) return null;
  return toCents(Number(trimmed.replace(/[$,]/g, '')));
}

/** What's currently in a card's description and amount inputs. A settlement has no description. */
export interface TypedInput {
  description?: string;
  amount?: string;
}

/** What's wrong with what's typed in a card, or null. */
export function inputProblem(typed: TypedInput): string | null {
  if (typed.description !== undefined && typed.description.trim() === '') return "The description can't be empty.";
  if (typed.amount !== undefined && !parseDollars(typed.amount)) return 'Enter an amount like 12.50.';
  return null;
}

const sameName = (a: string, b: string) => {
  const normalize = (s: string) => s.trim().toLowerCase().normalize('NFC');
  return normalize(a) === normalize(b);
};

/** The edit behind a "Use Arun" button, or null if the warning has nothing to swap. */
export function replaceEditFor(draft: Draft, warning: DraftWarning): DraftEdits | null {
  const suggestion = warning.suggestion;
  if (!suggestion) return null;
  const typed = draft.newPeople.find((p) => sameName(p.name, suggestion.name));
  return typed ? { replace: [{ from: typed.id, to: suggestion.person.id }] } : null;
}

/** What to send to /api/chat: the latest messages, starting on a user message, each within the server's limit. */
export function buildHistory(messages: ChatMessage[]): ChatMessage[] {
  const recent = messages.slice(-MAX_HISTORY);
  const start = recent.findIndex((m) => m.role === 'user');
  return recent.slice(Math.max(start, 0)).map((m) => ({ ...m, text: m.text.slice(0, MAX_TEXT) }));
}

export interface EditQueue {
  /** Runs `action` after everything already queued. Resolves to its own result; a throw counts as false. */
  run(action: () => Promise<boolean>): Promise<boolean>;
  /**
   * Waits for what is in flight. False if the latest edits failed and no later edit has succeeded; asking again then
   * gives true, so a second Confirm can save the values shown.
   */
  settled(): Promise<boolean>;
}

/**
 * Runs a card's edits one at a time. Typing an amount and clicking Confirm fires the edit and the confirm together, so
 * Confirm waits on settled(). A rejection can arrive before the mouse button comes up, with the field already back to
 * the old value, so a failure is remembered until a Confirm has stopped on it.
 */
export function createEditQueue(): EditQueue {
  let tail: Promise<boolean> | null = null;
  let failed = false;
  return {
    run(action) {
      let ok = false;
      const previous = tail ?? Promise.resolve(true);
      const current: Promise<boolean> = previous.then(async (previousOk) => {
        try {
          ok = await action();
        } catch {
          ok = false;
        }
        if (tail === current) tail = null;
        failed = !(previousOk && ok);
        return previousOk && ok;
      });
      tail = current;
      return current.then(() => ok);
    },
    async settled() {
      await tail;
      const ok = !failed;
      failed = false;
      return ok;
    },
  };
}

/**
 * Runs `confirm` only if what's typed is valid and the latest edit didn't fail. Resolves to whether it ran. An error
 * from `confirm` itself is passed on.
 */
export async function confirmIfValid(options: {
  typed: TypedInput;
  queue: EditQueue;
  confirm: () => Promise<void>;
  onInvalid: (problem: string) => void;
  onEditFailed?: () => void;
}): Promise<boolean> {
  const { typed, queue, confirm, onInvalid, onEditFailed } = options;
  const problem = inputProblem(typed);
  if (problem) {
    onInvalid(problem);
    return false;
  }
  if (!(await queue.settled())) {
    onEditFailed?.();
    return false;
  }
  await confirm();
  return true;
}
