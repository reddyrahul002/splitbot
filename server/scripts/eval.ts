// Agent eval against real Gemini: `npm run eval -w server`. Not part of `npm test` (it uses the free-tier quota).
// Each case runs the real loop over a fresh temp store with Arun, Mei and one dinner today. It checks the tool
// calls, the draft the server computed, and that nothing was written to db.json. Never prints the API key.
import { mkdtemp, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FunctionCall } from '@google/genai';
import type { ChatResponse, Draft } from '@splitbot/shared';
import { createGeminiClient, DEFAULT_GEMINI_MODEL, type GeminiClient } from '../src/agent/gemini';
import { BUSY_REPLY, runAgent } from '../src/agent/loop';
import { loadEnv, localToday } from '../src/config';
import { createDraftStore } from '../src/drafts';
import { normalizeName } from '../src/domain/guardrails';
import { openStore, type Store } from '../src/store';
import { CASES, type EvalCase } from './eval-cases';

/** Pause between cases, to stay under the free tier's requests-per-minute limit. */
const DELAY_MS = Number(process.env.EVAL_DELAY_MS ?? 10_000);
const DRAFT_TOOLS = new Set(['create_expense_draft', 'create_settlement_draft']);

loadEnv();
const apiKey = process.env.GEMINI_API_KEY?.trim();
if (!apiKey) {
  console.error('GEMINI_API_KEY is not set. Copy .env.example to .env and add a free key.');
  process.exit(2);
}
const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
const gemini = createGeminiClient({ apiKey, model });
const today = localToday();

/** A function call plus how it went: "ok" or an error code with its message; unset if no result was sent back. */
interface RecordedCall extends FunctionCall {
  status?: string;
}

/**
 * Wraps the client to record every function call the model makes and its result. The results are read from the
 * function responses the loop sends back in the next request, so this sees exactly what the model saw.
 */
function recording(client: GeminiClient) {
  const calls: RecordedCall[] = [];
  const wrapped: GeminiClient = {
    async generate(req) {
      const pending = calls.filter((c) => c.status === undefined);
      const responses = (req.contents.at(-1)?.parts ?? []).flatMap((p) => (p.functionResponse ? [p.functionResponse] : []));
      responses.forEach((r, i) => {
        const call = pending[i];
        if (!call) return;
        const error = (r.response as { error?: { code?: string; message?: string } } | undefined)?.error;
        call.status = error ? `${error.code}: ${String(error.message).replace(/\s+/g, ' ').slice(0, 120)}` : 'ok';
      });
      const result = await client.generate(req);
      calls.push(...result.functionCalls.map((c) => ({ ...c })));
      return result;
    },
  };
  return { client: wrapped, calls };
}

async function seededStore(dir: string) {
  let writes = 0;
  const store = await openStore(join(dir, 'db.json'), {
    fs: {
      rename: async (from, to) => {
        writes++;
        await rename(from, to);
      },
    },
  });
  await store.update((db) => {
    db.people.push({ id: 'arun', name: 'Arun' }, { id: 'mei', name: 'Mei' });
    db.expenses.push({
      id: 'seed-dinner',
      description: 'Dinner',
      category: 'Food & Drink',
      date: today,
      totalCents: 9000,
      paidBy: 'me',
      shares: [
        { personId: 'me', cents: 2600 },
        { personId: 'arun', cents: 3800 },
        { personId: 'mei', cents: 2600 },
      ],
      splitMeta: { splitType: 'equal', adjustments: [{ person: 'arun', cents: 1200 }] },
      createdAt: new Date().toISOString(),
    });
  });
  writes = 0;
  return { store, writes: () => writes };
}

const norm = (v: unknown) => (typeof v === 'string' ? normalizeName(v) : v);
const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].map(normalizeName).sort().join('|') === [...b].sort().join('|');

/** Lowercase display name for each id in the draft (existing or new people). */
function namer(store: Store, draft: Draft) {
  const people = [...store.snapshot().people, ...draft.newPeople];
  return (id: string) => (id === 'me' ? 'me' : normalizeName(people.find((p) => p.id === id)?.name ?? id));
}

interface Verdict {
  /** Mismatches with the expectation; empty means pass. */
  problems: string[];
  /** Worth knowing but not a failure, e.g. a draft call the server rejected. */
  notes: string[];
}

function check(c: EvalCase, response: ChatResponse, calls: RecordedCall[], store: Store, writes: number): Verdict {
  const v: Verdict = { problems: [], notes: [] };
  const problems = v.problems;
  const e = c.expect;
  if (writes !== 0) problems.push(`db.json was written ${writes} time(s)`);
  if (response.reply === BUSY_REPLY) problems.push('rate limited (BUSY_REPLY)');
  const draftCalls = calls.filter((call) => DRAFT_TOOLS.has(call.name ?? ''));
  // A draft call the server rejected made no draft; the expectation is about drafts, so it's only a note.
  for (const call of draftCalls) {
    if (call.status !== 'ok') v.notes.push(`${call.name}(${JSON.stringify(call.args ?? {})}) was attempted → ${call.status ?? 'no result sent'}; no draft made`);
  }

  if (e.kind === 'question' || e.kind === 'read') {
    if (response.drafts.length > 0) problems.push(`expected no draft, got ${response.drafts.length}`);
  }
  if (e.kind === 'question') {
    if (!response.reply.includes('?')) problems.push('reply is not a question (no "?")');
    return v;
  }
  if (e.kind === 'read') {
    const call = calls.find((x) => x.name === e.tool);
    if (!call) problems.push(`${e.tool} was not called (called: ${calls.map((x) => x.name).join(', ') || 'nothing'})`);
    if (call && e.checkArgs) {
      const why = e.checkArgs(call.args ?? {}, today);
      if (why) problems.push(why);
    }
    if (e.replyIncludes && !response.reply.includes(e.replyIncludes)) problems.push(`reply doesn't include ${e.replyIncludes}`);
    return v;
  }

  if (response.drafts.length !== 1) {
    problems.push(`expected 1 draft, got ${response.drafts.length}`);
    return v;
  }
  const draft = response.drafts[0]!;
  const name = namer(store, draft);

  if (e.kind === 'settlement') {
    if (draft.kind !== 'settlement') {
      problems.push(`expected a settlement draft, got ${draft.kind}`);
      return v;
    }
    const s = draft.settlement;
    if (name(s.from) !== e.from || name(s.to) !== e.to) problems.push(`payment ${name(s.from)} → ${name(s.to)}, expected ${e.from} → ${e.to}`);
    if (s.cents !== e.cents) problems.push(`cents ${s.cents}, expected ${e.cents}`);
    return v;
  }

  if (draft.kind !== 'expense') {
    problems.push(`expected an expense draft, got ${draft.kind}`);
    return v;
  }
  // The arguments of the call that made the draft (earlier rejected attempts are notes).
  const args = (draftCalls.filter((call) => call.status === 'ok').at(-1)?.args ?? {}) as Record<string, unknown>;
  if (args.totalDollars !== e.args.totalDollars) problems.push(`totalDollars ${String(args.totalDollars)}, expected ${e.args.totalDollars}`);
  if (norm(args.paidBy) !== e.args.paidBy) problems.push(`paidBy ${String(args.paidBy)}, expected ${e.args.paidBy}`);
  if (!Array.isArray(args.participants) || !sameSet(args.participants as string[], e.args.participants)) {
    problems.push(`participants ${JSON.stringify(args.participants)}, expected ${JSON.stringify(e.args.participants)}`);
  }
  if (args.splitType !== e.args.splitType) problems.push(`splitType ${String(args.splitType)}, expected ${e.args.splitType}`);
  if (args.category !== e.args.category) problems.push(`category ${String(args.category)}, expected ${e.args.category}`);

  const shares = Object.fromEntries(draft.expense.shares.map((s) => [name(s.personId), s.cents]));
  if (JSON.stringify(Object.entries(shares).sort()) !== JSON.stringify(Object.entries(e.shares).sort())) {
    problems.push(`shares ${JSON.stringify(shares)}, expected ${JSON.stringify(e.shares)}`);
  }
  const codes = draft.warnings.map((w) => w.code).sort();
  const expected = [...(e.warnings ?? [])].sort();
  if (codes.join() !== expected.join()) problems.push(`warnings [${codes.join(', ')}], expected [${expected.join(', ')}]`);
  return v;
}

/** Runs one case once and prints the outcome. Returns its problems (empty = pass). */
async function runCase(c: EvalCase, run: string): Promise<string[]> {
  const dir = await mkdtemp(join(tmpdir(), 'splitbot-eval-'));
  try {
    const { store, writes } = await seededStore(dir);
    const { client, calls } = recording(gemini);
    const response = await runAgent([{ role: 'user', text: c.text }], { client, store, drafts: createDraftStore(), today: () => today });
    const { problems, notes } = check(c, response, calls, store, writes());
    console.log(`${problems.length === 0 ? 'PASS' : 'FAIL'}  #${c.id}${run}  ${c.text}`);
    if (calls.length === 0) console.log('      tools: none');
    // No recorded result: the loop stopped (5-call cap or a Gemini error) before sending this call's result back.
    for (const call of calls) console.log(`      tool: ${call.name} → ${call.status ?? 'no result sent (loop stopped)'}`);
    console.log(`      drafts in response: ${response.drafts.length}`);
    console.log(`      reply: ${response.reply.replace(/\s+/g, ' ').slice(0, 160)}`);
    for (const n of notes) console.log(`      note: ${n}`);
    for (const p of problems) console.log(`      ✗ ${p}`);
    return problems;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`FAIL  #${c.id}${run}  ${c.text}\n      ✗ error: ${message}`);
    return [message];
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** `[ids...] [--repeat N]`, e.g. `-- 2 9 --repeat 5`. */
function parseArgs(argv: string[]): { ids: number[]; repeat: number } {
  const ids: number[] = [];
  let repeat = 1;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const inline = arg.match(/^--repeat=(.*)$/);
    if (arg === '--repeat' || inline) {
      repeat = Number(inline ? inline[1] : argv[++i]);
      if (!Number.isInteger(repeat) || repeat < 1) {
        console.error('--repeat needs a whole number of at least 1.');
        process.exit(2);
      }
    } else if (/^\d+$/.test(arg)) {
      ids.push(Number(arg));
    } else {
      console.error(`Unknown argument "${arg}". Usage: npm run eval -w server -- [case ids...] [--repeat N]`);
      process.exit(2);
    }
  }
  return { ids, repeat };
}

const { ids, repeat } = parseArgs(process.argv.slice(2));
const cases = ids.length > 0 ? CASES.filter((c) => ids.includes(c.id)) : CASES;
console.log(`Eval: ${cases.length} cases × ${repeat} run(s), model ${model}, today ${today}\n`);

const passes = new Map<number, number>();
let first = true;
for (const c of cases) {
  for (let r = 1; r <= repeat; r++) {
    if (!first) await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    first = false;
    const ok = (await runCase(c, repeat > 1 ? ` (run ${r}/${repeat})` : '')).length === 0;
    passes.set(c.id, (passes.get(c.id) ?? 0) + (ok ? 1 : 0));
  }
}

const allPassed = cases.filter((c) => passes.get(c.id) === repeat).length;
if (repeat > 1) {
  console.log('\nConsistency:');
  for (const c of cases) console.log(`  #${c.id}: ${passes.get(c.id)}/${repeat} runs passed`);
}
console.log(`\n${allPassed}/${cases.length} cases passed${repeat > 1 ? ' every run' : ''}`);
process.exit(allPassed === cases.length ? 0 : 1);
