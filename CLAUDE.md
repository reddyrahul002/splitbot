# SplitBot

SplitBot is a Splitwise-style web app. You type expenses in plain English, and a Gemini function-calling agent turns them into draft expenses. It tracks who owes whom, suggests how to settle up, and charts spending by category.

- Stack: TypeScript everywhere. Node + Express backend, React (Vite) frontend, npm workspaces.
- Gemini free tier only ($0). Single user, no login. Data is stored in a JSON file. Runs locally.
- PLAN.md has the full plan and the numbered steps. DECISIONS.md is the decision log.

## Core principles
1. **The LLM never does arithmetic.** Gemini only extracts structure: payer, participants, amounts, itemized adjustments and category. Deterministic TypeScript in `server/src/domain/` computes every share, balance and transfer.
2. **All money is integer cents.** Convert at the boundary with `toCents` / `formatCents`. Leftover cents are distributed in a deterministic order, so shares always add up exactly to the total.
3. **Every write goes through a draft.** Tools create drafts, the UI shows them, and nothing is saved until the user clicks Confirm. Read-only questions are answered directly from tool results.
4. **The agent is bounded.** At most 5 tool calls per user message. If names, the payer or amounts are unclear, it asks a clarifying question instead of guessing. When no payer is mentioned at all, the payer is me. Guardrails add warnings to drafts: an amount that isn't in the user's messages, a name close to an existing person, or a name the model respelled from what the user typed (`NAME_RESPELLED`). The model's date is used only if a date phrase appears in a user message in the chat; otherwise the draft uses today.

## Repo layout
```
shared/src/types.ts       # types shared by server and client
shared/src/money.ts       # toCents, formatCents (server/src/domain/money.ts re-exports them)
server/src/index.ts       # Express app + routes
server/src/store.ts       # JSON file store (data/db.json), atomic writes
server/src/drafts.ts      # in-memory drafts with TTL
server/src/domain/        # split, balances, settle, summary, guardrails (pure functions)
server/src/agent/         # Gemini tools, loop, system prompt
server/test/              # vitest
client/src/               # React app: Chat, DraftCard, Balances, SettleUp, Insights, History
client/test/              # vitest (pure logic and fetch wrappers)
```

## How we work
- **One step at a time.** Do only the current step from PLAN.md. When it's finished, stop for the user's review before starting the next one.
- **Each step ends with tests passing and a commit.** Commit message: `Step N: <summary>`.
- **Tests first for domain logic.** Write the tests, confirm they fail, then implement.
- **Never edit tests just to make them pass.** If a test looks wrong, stop and explain why instead of changing it.
- **Never modify source or test files with shell commands (sed, python, heredocs).** Always use the Edit/Write tools so every change shows as a reviewable diff.
- **Never print or commit the API key.** `GEMINI_API_KEY` lives only in `.env`, which is gitignored. Commit only `.env.example`. Don't echo env vars or log request headers.
- Log notable decisions, AI mistakes and re-prompts in DECISIONS.md as they happen.
- Use `/review-step` to review the current step before committing.

## Commands
- `npm test`: run all tests
- `npm run typecheck`: type-check every workspace (from Step 1)
- `npm run dev`: start the server and client (from Step 3/5)
