// Express app and REST routes. Every write goes through a draft: POST /api/drafts → (PATCH) → confirm.
import express, { type ErrorRequestHandler, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  CATEGORIES,
  SPLIT_TYPES,
  type ApiError,
  type BalancesResponse,
  type DraftEdits,
  type DraftRequest,
  type Expense,
  type Settlement,
} from '@splitbot/shared';
import { computeBalances, pairwiseDebts } from './domain/balances';
import { suggestSettlements } from './domain/settle';
import { SplitError } from './domain/split';
import { spendingSummary } from './domain/summary';
import { applyEdits, buildExpenseDraft, buildSettlementDraft, DraftError, finalizeDraft, type DraftStore } from './drafts';
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
});
const SettlementDraftSchema = z.strictObject({
  kind: z.literal('settlement'),
  from: name,
  to: name,
  cents: z.number(),
  date: z.string().optional(),
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
});

const SummaryQuerySchema = z.object({ from: z.string().optional(), to: z.string().optional() });

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

/** Newest first: by date, then by `tiebreak` (larger first). */
function newestFirst<T extends { date: string }>(items: T[], tiebreak: (item: T) => string | number): T[] {
  return [...items].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    const [x, y] = [tiebreak(a), tiebreak(b)];
    return x === y ? 0 : x < y ? 1 : -1;
  });
}

export function createApp(deps: AppDeps): express.Express {
  const { store, drafts, today, now = Date.now, log = (m) => console.error(m) } = deps;
  const app = express();
  app.use(express.json());

  const send = (res: Response, status: number, body?: unknown) => (body === undefined ? res.status(status).end() : res.status(status).json(body));

  app.get('/api/people', (_req, res) => {
    res.json(store.snapshot().people);
  });

  app.post('/api/drafts', (req, res) => {
    const body: DraftRequest = DraftRequestSchema.parse(req.body);
    const people = store.snapshot().people;
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
    const edited = applyEdits(draft, edits, store.snapshot().people);
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
