// Express app and REST routes. Every write goes through a draft: POST /api/drafts → (PATCH) → confirm.
import express, { type ErrorRequestHandler, type Request, type Response } from 'express';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import {
  CATEGORIES,
  ME_ID,
  SPLIT_TYPES,
  type ApiError,
  type BalancesResponse,
  type ChatMessage,
  type ChatResponse,
  type DraftEdits,
  type DraftRequest,
  type Expense,
  type Group,
  type GroupSummary,
  type Settlement,
} from '@splitbot/shared';
import { GeminiRequestError } from './agent/gemini';
import { accountSummary, groupSummary, settlePlan } from './domain/account';
import { computeBalances, pairwiseDebts } from './domain/balances';
import { suggestSettlements } from './domain/settle';
import { normalizeName } from './domain/guardrails';
import { SplitError } from './domain/split';
import { spendingSummary } from './domain/summary';
import { applyEdits, buildExpenseDraft, buildSettlementDraft, DraftError, finalizeDraft, joinGroup, type DraftStore } from './drafts';
import type { Store } from './store';

export interface AppDeps {
  store: Store;
  drafts: DraftStore;
  /** Today's date as YYYY-MM-DD (the default draft date). */
  today: () => string;
  /** Clock for createdAt; defaults to Date.now. */
  now?: () => number;
  /** Where unexpected errors are logged; defaults to console.error. */
  log?: (message: string) => void;
  /** Answers POST /api/chat. Undefined when GEMINI_API_KEY isn't set; the route then answers 503. */
  agent?: (messages: ChatMessage[]) => Promise<ChatResponse>;
}

const cents = z.int();
const name = z.string().trim().min(1);
const valueMap = z.record(z.string(), z.number());

const ExpenseDraftSchema = z.strictObject({
  kind: z.literal('expense'),
  description: z.string().trim().min(1),
  category: z.enum(CATEGORIES),
  date: z.string().optional(),
  totalCents: cents,
  paidBy: name,
  participants: z.array(name),
  splitType: z.enum(SPLIT_TYPES),
  adjustments: z.array(z.strictObject({ person: name, cents, note: z.string().optional() })).optional(),
  exact: valueMap.optional(),
  percent: valueMap.optional(),
  shares: valueMap.optional(),
  groupId: z.string().min(1).optional(),
});
const SettlementDraftSchema = z.strictObject({
  kind: z.literal('settlement'),
  from: name,
  to: name,
  cents: z.number(),
  date: z.string().optional(),
  groupId: z.string().min(1).optional(),
});
const DraftRequestSchema = z.discriminatedUnion('kind', [ExpenseDraftSchema, SettlementDraftSchema]);

const DraftEditsSchema = z.strictObject({
  description: z.string().trim().min(1).optional(),
  category: z.enum(CATEGORIES).optional(),
  date: z.string().optional(),
  totalCents: cents.optional(),
  paidBy: z.string().optional(),
  cents: z.number().optional(),
  replace: z.array(z.strictObject({ from: z.string(), to: z.string() })).optional(),
  groupId: z.string().min(1).nullable().optional(),
});

const GroupCreateSchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .transform((name) => name.replace(/\s+/g, ' ')),
});
const GroupMemberSchema = z.strictObject({ personId: z.string().min(1) });

const SummaryQuerySchema = z.object({ from: z.string().optional(), to: z.string().optional() });

const ChatRequestSchema = z.strictObject({
  messages: z
    .array(z.strictObject({ role: z.enum(['user', 'model']), text: z.string().trim().min(1).max(4000) }))
    .min(1)
    .max(50)
    .refine((messages) => messages.at(-1)?.role === 'user', 'The last message must be from the user.'),
});

/** A request problem that maps to a 4xx response. */
class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const draftNotFound = () => new HttpError(404, 'DRAFT_NOT_FOUND', 'That draft no longer exists. It may have expired, been confirmed or been discarded.');
const notFound = (what: string) => new HttpError(404, 'NOT_FOUND', `${what} not found.`);

/** A draft can only point at a group that exists. */
function findDraftGroup(groups: Group[] | undefined, id: string): Group {
  const group = groups?.find((g) => g.id === id);
  if (!group) throw new DraftError('UNKNOWN_GROUP', 'That group no longer exists. Pick another one.');
  return group;
}

/** Newest first: by date, then by `tiebreak` (larger first). */
function newestFirst<T extends { date: string }>(items: T[], tiebreak: (item: T) => string | number): T[] {
  return [...items].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    const [x, y] = [tiebreak(a), tiebreak(b)];
    return x === y ? 0 : x < y ? 1 : -1;
  });
}

export function createApp(deps: AppDeps): express.Express {
  const { store, drafts, today, now = Date.now, log = (m) => console.error(m), agent } = deps;
  const app = express();
  app.use(express.json());

  const send = (res: Response, status: number, body?: unknown) => (body === undefined ? res.status(status).end() : res.status(status).json(body));

  app.get('/api/people', (_req, res) => {
    res.json(store.snapshot().people);
  });

  app.post('/api/chat', async (req, res) => {
    if (!agent) {
      throw new HttpError(503, 'GEMINI_NOT_CONFIGURED', 'Chat needs GEMINI_API_KEY in .env (see .env.example).');
    }
    const { messages } = ChatRequestSchema.parse(req.body);
    const body: ChatResponse = await agent(messages);
    res.json(body);
  });

  app.post('/api/drafts', (req, res) => {
    const body: DraftRequest = DraftRequestSchema.parse(req.body);
    const { people, groups } = store.snapshot();
    if (body.groupId !== undefined) findDraftGroup(groups, body.groupId);
    const draft =
      body.kind === 'expense'
        ? buildExpenseDraft(body, people, { today: today() })
        : buildSettlementDraft(body, people, { today: today() });
    drafts.put(draft);
    send(res, 201, draft);
  });

  app.patch('/api/drafts/:id', (req, res) => {
    const draft = drafts.get(req.params.id);
    if (!draft) throw draftNotFound();
    const edits: DraftEdits = DraftEditsSchema.parse(req.body ?? {});
    const { people, groups } = store.snapshot();
    if (typeof edits.groupId === 'string') findDraftGroup(groups, edits.groupId);
    const edited = applyEdits(draft, edits, people);
    if (!drafts.replace(edited)) throw draftNotFound();
    res.json(edited);
  });

  app.post('/api/drafts/:id/confirm', async (req, res) => {
    // Parse before taking the draft, so a bad body leaves it in place.
    const edits: DraftEdits = DraftEditsSchema.parse(req.body ?? {});
    const draft = drafts.take(req.params.id);
    if (!draft) throw draftNotFound();
    try {
      const result = await store.update((db) => {
        const edited = Object.keys(edits).length > 0 ? applyEdits(draft, edits, db.people) : draft;
        const confirmed = finalizeDraft(edited, db.people, { now: new Date(now()).toISOString() });
        db.people.push(...confirmed.createdPeople);
        if (confirmed.kind === 'expense') db.expenses.push(confirmed.expense);
        else db.settlements.push(confirmed.settlement);
        const groupId = confirmed.kind === 'expense' ? confirmed.expense.groupId : confirmed.settlement.groupId;
        if (groupId !== undefined) joinGroup(findDraftGroup(db.groups, groupId), confirmed);
        return confirmed;
      });
      res.json(result);
    } catch (err) {
      drafts.restore(draft);
      throw err;
    }
  });

  app.delete('/api/drafts/:id', (req, res) => {
    if (!drafts.delete(req.params.id)) throw draftNotFound();
    send(res, 204);
  });

  app.get('/api/expenses', (_req, res) => {
    const expenses: Expense[] = newestFirst(store.snapshot().expenses, (e) => e.createdAt);
    res.json(expenses);
  });

  app.delete('/api/expenses/:id', async (req, res) => {
    const removed = await removeById('expenses', req.params.id);
    if (!removed) throw notFound('Expense');
    send(res, 204);
  });

  app.get('/api/settlements', (_req, res) => {
    // Settlements have no createdAt; later in the stored list means recorded later.
    const stored = store.snapshot().settlements.map((s, index) => ({ s, index, date: s.date }));
    const settlements: Settlement[] = newestFirst(stored, (x) => x.index).map((x) => x.s);
    res.json(settlements);
  });

  app.get('/api/settlements/suggest', (_req, res) => {
    const { people, expenses, settlements } = store.snapshot();
    res.json(suggestSettlements(computeBalances(people, expenses, settlements)));
  });

  app.get('/api/settlements/plan', (_req, res) => {
    const { people, expenses, settlements } = store.snapshot();
    res.json(settlePlan(people, expenses, settlements));
  });

  app.delete('/api/settlements/:id', async (req, res) => {
    const removed = await removeById('settlements', req.params.id);
    if (!removed) throw notFound('Settlement');
    send(res, 204);
  });

  app.get('/api/balances', (_req, res) => {
    const { people, expenses, settlements } = store.snapshot();
    const body: BalancesResponse = {
      balances: computeBalances(people, expenses, settlements),
      debts: pairwiseDebts(people, expenses, settlements),
    };
    res.json(body);
  });

  app.get('/api/account', (_req, res) => {
    const { people, expenses, settlements } = store.snapshot();
    res.json(accountSummary(people, expenses, settlements));
  });

  app.get('/api/groups', (_req, res) => {
    const { people, expenses, settlements, groups = [] } = store.snapshot();
    const body: GroupSummary[] = groups.map((group) => groupSummary(group, people, expenses, settlements));
    res.json(body);
  });

  // Groups write directly, not through a draft: they move no money (logged in DECISIONS.md).
  app.post('/api/groups', async (req, res) => {
    const { name: groupName } = GroupCreateSchema.parse(req.body);
    const group = await store.update((db) => {
      const existing = db.groups?.find((g) => normalizeName(g.name) === normalizeName(groupName));
      if (existing) throw new HttpError(400, 'GROUP_EXISTS', `There is already a group called ${existing.name}.`);
      const created: Group = { id: nanoid(), name: groupName, memberIds: [ME_ID] };
      db.groups = [...(db.groups ?? []), created];
      return created;
    });
    send(res, 201, group);
  });

  app.post('/api/groups/:id/members', async (req, res) => {
    const { personId } = GroupMemberSchema.parse(req.body);
    const { people, groups } = store.snapshot();
    const found = groups?.find((g) => g.id === req.params.id);
    if (!found) throw notFound('Group');
    if (!people.some((p) => p.id === personId)) throw new HttpError(400, 'UNKNOWN_PERSON', "That person doesn't exist.");
    // Already a member needs no write.
    if (found.memberIds.includes(personId)) {
      res.json(found);
      return;
    }
    const group = await store.update((db) => {
      const current = db.groups?.find((g) => g.id === req.params.id);
      if (!current) throw notFound('Group');
      if (!current.memberIds.includes(personId)) current.memberIds.push(personId);
      return current;
    });
    res.json(group);
  });

  app.get('/api/summary', (req: Request, res) => {
    const { from, to } = SummaryQuerySchema.parse(req.query);
    try {
      res.json(spendingSummary(store.snapshot().expenses, { from, to }));
    } catch (err) {
      if (err instanceof RangeError) throw new HttpError(400, 'INVALID_DATE', err.message);
      throw err;
    }
  });

  app.use('/api', () => {
    throw notFound('Route');
  });

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    const fail = (status: number, code: string, message: string) => {
      const body: ApiError = { error: { code, message } };
      res.status(status).json(body);
    };
    if (err instanceof HttpError) return fail(err.status, err.code, err.message);
    if (err instanceof GeminiRequestError) {
      // The detail (status and Google's message) is for the log; the response says what to fix.
      log(err.message);
      return fail(502, err.code, err.publicMessage);
    }
    if (err instanceof SplitError || err instanceof DraftError) return fail(400, err.code, err.message);
    if (err instanceof z.ZodError) return fail(400, 'VALIDATION_ERROR', z.prettifyError(err));
    if (err?.type === 'entity.parse.failed') return fail(400, 'VALIDATION_ERROR', 'The request body is not valid JSON.');
    // Log the error itself, never the request (headers could carry secrets).
    log(`Unexpected error: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    fail(500, 'INTERNAL', 'Something went wrong on the server. Please try again.');
  };
  app.use(errorHandler);

  async function removeById(list: 'expenses' | 'settlements', id: string): Promise<boolean> {
    // An unknown id needs no write. The check is repeated inside the update in case another request removed it first.
    if (!store.snapshot()[list].some((item) => item.id === id)) return false;
    return store.update((db) => {
      const index = db[list].findIndex((item) => item.id === id);
      if (index === -1) return false;
      db[list].splice(index, 1);
      return true;
    });
  }

  return app;
}
