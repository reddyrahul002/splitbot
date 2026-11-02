# SplitBot: build plan

## Context
SplitBot is a Splitwise-style web app that you drive with plain-English chat. For example: "Dinner $90, I paid, split with Arun and Mei, Arun had $12 of drinks". A Gemini function-calling agent turns messages like this into **draft** expenses. Nothing is saved until you click Confirm. The agent also answers questions such as "how much does Arun owe me?", suggests how to settle up, and the app shows spending by category in charts.

Constraints:
- About 1.5 days to build, $0 cost (Gemini free tier).
- TypeScript throughout: Node + Express backend, React frontend.
- Single user, no login. Data lives in a JSON file. Runs locally. Free deployment is a stretch goal.

The repo is empty, so this is a new build.

## Core principles
1. **The LLM never does arithmetic.** Gemini only extracts structure: who paid, who took part, amounts, itemized adjustments and category. Deterministic TypeScript does all the money calculations.
2. **All money is stored as integer cents.** Leftover cents from a split go to people in a fixed, deterministic order, so the shares always add up exactly to the total.
3. **Every write goes through a draft.** A tool creates a draft, the UI shows it, and the user confirms it before anything is persisted. Read questions are answered directly from tool results.
4. **The agent is bounded.** It makes at most 5 tool calls per user message. If names, the payer or amounts are unclear, it asks a clarifying question instead of guessing.

## Repo layout (npm workspaces)
```
splitbot/
  package.json            # workspaces: shared, server, client; "dev" runs both via concurrently
  shared/src/types.ts     # Person, Expense, Settlement, Draft, Balance, Transfer, ChatMessage, Category
  server/
    src/index.ts          # Express app, routes, CORS, dotenv
    src/store.ts          # JSON file store (data/db.json): in-memory cache, atomic write (tmp + rename), serialized write queue
    src/domain/split.ts   # computeShares(): equal | exact | percent | shares, plus itemized adjustments
    src/domain/balances.ts# net balances, pairwise "who owes whom"
    src/domain/settle.ts  # minimum-transfers debt simplification (greedy: largest creditor vs largest debtor)
    src/domain/summary.ts # spend by category and by month (the user's own share vs group total)
    src/agent/tools.ts    # Gemini function declarations + handlers (call domain + store)
    src/agent/loop.ts     # function-calling loop, 5-call cap, error -> model feedback
    src/agent/prompt.ts   # system prompt
    src/drafts.ts         # in-memory Map<draftId, Draft>, 30-min TTL
    test/*.test.ts        # vitest
  client/ (Vite + React + TS)
    src/App.tsx           # two-pane layout: Chat (left) | Tabs: Balances · Settle up · Insights · History (right)
    src/components/Chat.tsx, DraftCard.tsx, Balances.tsx, SettleUp.tsx, Insights.tsx, History.tsx
    src/api.ts            # fetch wrappers
  .env.example            # GEMINI_API_KEY, GEMINI_MODEL (default: current free-tier Flash, e.g. gemini-2.5-flash)
```
Dependencies: express, cors, dotenv, @google/genai, zod, nanoid; vitest, tsx, concurrently; client: react, recharts.

## Data model (shared/types.ts)
- `Person { id, name }`. A built-in person with id `me` represents the user. The agent resolves "I" and "me" to it. New names are created only when an expense is confirmed, and the draft card shows them as "new".
- `Expense { id, description, category, date, totalCents, paidBy: personId, shares: {personId, cents}[], splitMeta, createdAt }`. Storing the computed shares makes balances simple sums.
- `Settlement { id, from, to, cents, date }`. This records a payment, e.g. "Arun paid me back $20".
- `Draft = { kind: 'expense', expense } | { kind: 'settlement', settlement }` plus `id`, `newPeople[]` and `warnings[]`.
- Categories (fixed enum): Food & Drink, Groceries, Transport, Housing & Utilities, Entertainment, Travel, Shopping, Other.

## Split engine (server/src/domain/split.ts)
Input: `{ totalCents, participants[], splitType, adjustments?: {person, cents, note}[], exact?/percent?/shares? }`
- Itemized adjustments are applied first: each person's extra amount is charged only to them. The remainder (total minus all adjustments) is then split according to `splitType`.
- Worked example: total 9000, adjustments Arun +1200, remainder 7800 split equally among 3 → me 2600, Arun 3800, Mei 2600, which adds up to 9000.
- Validation throws a typed `SplitError`. Its message goes back to the model as the tool result, so the agent can ask the user to fix it. Errors:
  - adjustments add up to more than the total
  - exact amounts don't add up to the total
  - percentages don't add up to 100
  - empty participant list

## Agent tools (server/src/agent/tools.ts)
| Tool | Type | Purpose |
|---|---|---|
| `list_people` | read | Known names, used for fuzzy name matching |
| `create_expense_draft` | write→draft | Gets structured input; the server runs `computeShares` and stores and returns the draft with each person's share |
| `create_settlement_draft` | write→draft | "I paid Mei $30" / "Arun paid me back" |
| `get_balances` | read | Optional `person`: net balance and pairwise debts |
| `suggest_settlements` | read | Minimum list of transfers |
| `get_spending_summary` | read | By category, optional date range |
| `list_expenses` | read | Filter by person or category, with a limit |

**Draft guardrails (in `create_expense_draft`; these add to `draft.warnings[]` and never block the draft):**
- **Amount check:** the handler receives the user's latest message from the loop. It pulls out every number in the message, handling `$`, commas, decimals and forms like "90 bucks", and compares them with the total and each adjustment amount. Any amount that isn't in the message gets a warning, e.g. "Total $95.00 wasn't in your message, please check." For percent/shares splits, the percentages and share counts are checked the same way.
- **Close-name check:** each participant or payer name that doesn't exactly match an existing person (case-insensitive) is compared with existing names using Levenshtein distance (≤2, or ≤1 for names of 4 letters or fewer) plus a shared-prefix check. A close match gets a warning, e.g. "'Aroon' looks like existing person 'Arun'. Use Arun?". The DraftCard shows this with a one-click "Use Arun" button, and nothing is silently merged or created. New people are created only on Confirm, after the user has seen these warnings. The logic lives in `server/src/domain/guardrails.ts` so it can be unit tested.

Tool parameter schemas are written in zod and converted to Gemini `FunctionDeclaration`s, and the same zod schema validates the model's arguments.

**Loop (loop.ts):**
1. Send history + system prompt + tools.
2. Run each function call through its handler and send the results back.
3. Repeat until the model returns text, or stop after 5 calls with a polite fallback message.

The response is `{ reply, drafts: Draft[] }`. The client renders each draft as a `DraftCard`.

Chat history lives in client state and is sent with each request; the server is stateless apart from drafts. Gemini 429 and 5xx errors become a friendly "rate limited, try again in a moment" message.

**System prompt essentials:**
- The user is "me".
- Never compute amounts; always use tools.
- If the payer, amounts or participants are ambiguous, ask a question instead of guessing.
- Default category comes from the description; default date is today.
- Default currency is $.
- When asked about money, quote the numbers from tool results only.

## REST API (server/src/index.ts)
- `POST /api/chat` `{ messages }` → `{ reply, drafts }`
- `POST /api/drafts/:id/confirm` (optionally with edited fields; shares are recomputed on the server) → saved record. `DELETE /api/drafts/:id` discards a draft.
- `GET /api/people`, `GET /api/expenses`, `DELETE /api/expenses/:id`, `GET /api/balances`, `GET /api/settlements/suggest`, `GET /api/summary?from&to`
- `POST /api/expenses`: manual form fallback, so the app still works when Gemini is unavailable. It goes through the same split engine.

## Frontend
- **Chat**: message list, input box and example-prompt chips.
- **DraftCard**: editable fields (description, amount, payer, category, date), a table of each person's share, and "new person" badges. Buttons: Confirm / Discard. Editing a field calls the server to recompute the shares.
- **Balances**: a list of "Arun owes you $38.00", with green for money owed to you and red for money you owe.
- **Settle up**: suggested transfers, each with a "Record" button that creates a settlement draft and confirms it.
- **Insights (Recharts)**: donut chart of spending by category, bar chart by month, and a toggle between "my share" and "group total". I'll load the `dataviz` skill before writing the chart code.
- **History**: list of expenses and settlements, each with a delete button.

After any confirm or delete, the right-hand panels refetch. Styling is plain CSS, with no UI library, to save time.

## Steps
Each step ends with `npm test` passing and a commit. After each step I stop for your review before starting the next one.

- **Step 0: Project docs and workflow** (Day 1, first hour)
  - `PLAN.md`: this plan, copied into the repo.
  - `CLAUDE.md`: the core principles above, the repo layout, and how we work:
    - one step at a time, then stop for your review
    - tests first for domain logic
    - never edit tests just to make them pass
    - never print or commit the API key (`.env` goes in `.gitignore`; only `.env.example` is committed)
  - `DECISIONS.md` with these sections: Decisions & trade-offs · Where AI got it wrong · Re-prompts · Where AI sped me up / got in the way · How I checked quality · What I'd do differently. I'll pre-fill it with the decisions made so far: JSON storage, drafts before writes, integer cents, the LLM never doing arithmetic, and the 5-call cap.
  - `.claude/commands/review-step.md`: a slash command that reviews the current step's changes (`git diff` since the last step commit) against CLAUDE.md. It lists edge cases and suggests missing tests, and does not change any code.
  - Also in this step: `.gitignore`, root `package.json` with workspaces, and a `npm test` that runs and passes.
- **Step 1: Shared types + split engine** (Day 1 morning). Tests first. Covers `split.ts`: leftover cents, itemized adjustments, exact/percent/shares, and validation errors.
- **Step 2: Balances, settle-up, summary, guardrails** (Day 1 morning). Tests first. Covers `balances.ts`, `settle.ts`, `summary.ts` and `guardrails.ts`, including amount and close-name detection.
- **Step 3: JSON store + drafts + REST API** (Day 1 afternoon). Tests cover store round-trip and atomic writes, and the draft confirm/discard flow through the routes (supertest). The `/api/chat` route is not included yet.
- **Step 4: Gemini agent** (Day 1 afternoon). Tools, loop, prompt and `/api/chat`. Tests use a mocked Gemini client and cover tool dispatch, the 5-call cap, errors going back to the model, and guardrail warnings appearing on drafts. Then a manual curl check against real Gemini, and the eval script.
- **Step 5: Chat UI + DraftCard + confirm flow** (Day 1 evening). The dinner example works end to end in the browser, and warnings and "Use Arun" are visible.
- **Step 6: Balances, Settle up, History panels** (Day 2 morning).
- **Step 7: Insights charts + polish** (Day 2 morning). Recharts donut and bar charts, error and empty states, manual expense form fallback, README with setup steps and screenshots, and DECISIONS.md brought up to date.
- **Step 8 (stretch): Deploy** the server to Render and the client to Vercel. Render's free tier has an ephemeral disk, so the JSON file would reset on restart; document this or move to a free hosted database.

## Step 1 detail: shared types + split engine
Prerequisite: Step 0 is committed. Step 1 also adds the `workspaces` field to the root `package.json` and replaces the placeholder `npm test` with the real vitest run. (npm fails if a listed workspace folder doesn't exist, so Step 0 can't declare them yet.)

### Files
| File | Contents |
|---|---|
| `tsconfig.base.json` | strict, ES2022, moduleResolution bundler; shared by every workspace |
| `shared/package.json`, `shared/tsconfig.json` | `@splitbot/shared`, exports `src/index.ts` (TS source imported directly by vitest/tsx/Vite, no build step) |
| `shared/src/types.ts` | `PersonId`, `Person`, `CATEGORIES` const + `Category`, `SplitType`, `Adjustment`, `SplitInput`, `Share`, `Expense`, `Settlement`, `Draft`, `Balance`, `Transfer`, `ChatMessage` |
| `shared/src/index.ts` | re-exports |
| `server/package.json`, `server/tsconfig.json` | vitest, tsx, typescript; `test` and `typecheck` scripts |
| `server/src/domain/money.ts` | `toCents(dollars)` (float-safe rounding), `formatCents(cents)` → `"$38.00"` |
| `server/src/domain/split.ts` | `computeShares(input: SplitInput): Share[]`, `SplitError { code, message }` |
| `server/test/money.test.ts`, `server/test/split.test.ts` | written first; confirmed to fail before the implementation exists |

### Split engine rules
- **Output:** one `Share` for every participant, in the order participants are listed, including shares of 0. All values are integer cents ≥0 and always add up exactly to `totalCents`.
- **Order of operations:** validate, apply adjustments, then split the remainder by `splitType`.
- **Leftover cents:** use the largest-remainder method. Ties go to the payer first (if the payer is a participant), then in listed participant order. For equal splits that means the payer always gets the first extra cent. Shares are still returned in listed order.
- **Payer:** `SplitInput.paidBy` is required and is used only for the tie-break. The payer doesn't have to be a participant; if they aren't, ties fall back to listed order. (Changed during Step 1 review: the AI picks the participant order, so listed-order alone wasn't predictable.)
- **`exact`** values must add up to the full total. Adjustments are rejected with `exact`, because exact amounts are already itemized.
- **Percent tolerance:** the raw percentages must add up to within 0.01 of 100 (checked before any rounding), so 33.33 + 33.33 + 33.34 and 33.336 × 3 pass. 0% is allowed; negative → `INVALID_AMOUNT`.
- **Shares** must be more than 0 with at most 3 decimal places → otherwise `INVALID_SHARES`.
- **Values for another split type** (e.g. `percent` given with `equal`) → `SPLIT_VALUES_TYPE_MISMATCH`. An empty map counts as absent. Unknown split type → `INVALID_SPLIT_TYPE`.
- **Exact 0** is allowed (a participant who owes nothing).
- **Error messages** are written in dollars, including invalid inputs such as a total of `$1.005` (e.g. "Exact amounts add up to $87.00 but the total is $90.00 (off by $3.00)"), because they go back to the model.

### Test cases (written first)
**money**
1. `toCents(90)`=9000, `toCents(12.5)`=1250, `toCents(0.1+0.2)`=30, `toCents(19.999)`=2000
2. `formatCents(3800)`="$38.00", `(5)`="$0.05", `(-1200)`="-$12.00"

**equal**
3. 9000 / 3 → 3000 ×3
4. 1000 / 3, payer Mei → me 333, Arun 333, Mei 334 (the payer gets the leftover cent)
5. 1 cent / 3 → 1, 0, 0
6. A single participant gets the whole total
7. Reordering the participants doesn't change the payer's extra cent; with 2 leftover cents (1001 / 3) the second goes to the first-listed non-payer

**adjustments**
8. The dinner example: 9000, Arun +1200 → me 2600, Arun 3800, Mei 2600
9. Adjustments on two different people
10. Two adjustments on the same person add together
11. Adjustments equal to the total → the remainder is 0 and everyone else pays 0
12. Adjustment plus leftover cents: 1001, Arun +100 → remainder 901 split 301/300/300, so Arun pays 400
13. Adjustment combined with a percent split of the remainder

**exact**
14. Amounts that add up to the total are returned as given
15. Amounts that don't add up → `EXACT_SUM_MISMATCH`, and the message shows how far off they are
16. Adjustments with exact → `ADJUSTMENTS_WITH_EXACT`

**percent**
17. 60/40 of 180000 → 108000 / 72000
18. 33.33/33.33/33.34 of 1000 → 333 / 333 / 334
19. 50/50 of 101, payer Arun (listed second) → 50 / 51 (on a tie, the payer gets the cent)
20. Percentages adding up to 90 → `PERCENT_SUM_NOT_100`

**shares**
21. 2:1:1 of 1000 → 500 / 250 / 250
22. 1:1:1 of 100, payer Mei → 33 / 33 / 34
23. Zero or negative shares → `INVALID_SHARES`

**validation**
24. Total of 0, negative, or a fraction of a cent → `INVALID_TOTAL`
25. Empty participant list → `NO_PARTICIPANTS`
26. The same participant listed twice → `DUPLICATE_PARTICIPANT`
27. Adjustments add up to more than the total → `ADJUSTMENTS_EXCEED_TOTAL`
28. Adjustment for someone who isn't a participant → `ADJUSTMENT_NOT_PARTICIPANT`
29. Negative adjustment, or an exact amount that isn't a whole number of cents → `INVALID_AMOUNT`
30. A participant with no value for exact/percent/shares → `MISSING_SPLIT_VALUE`; a value given for a non-participant → `UNKNOWN_PERSON_IN_SPLIT_VALUES`

**invariants**
31. Seeded random loop of 500 cases (no extra dependency): shares always add up to the total, are all integers ≥0, and in equal splits no two shares differ by more than 1 cent and a participating payer has the largest share

**payer not a participant**
32. 1000 among [Arun, Mei, Kai], payer me → 334 / 333 / 333 (falls back to listed order)

**review follow-ups (#33–#47)**: `toCents` -0 → 0 and NaN/Infinity → RangeError; `formatCents` rejects non-integers; money error messages in dollars; raw-percent tolerance (33.336 × 3 accepted, 25.0049 × 4 rejected); 33.33 × 3 accepted / 33.32 × 3 rejected; `SPLIT_VALUES_TYPE_MISMATCH`; shares with > 3 decimals; 1.5:1 shares; payer not first + adjustment; unknown person / missing map for exact and percent; unknown split type; a 999,999,999,999-cent total split 7 ways; `constructor`/`toString` ids; a second seeded random loop (off-100 percentages, 3-decimal shares, totals up to 10¹³ cents).

### Done when
`npm test` and `npm run typecheck` pass. Then commit "Step 1: shared types and split engine" and stop for `/review-step`.

## Verification
- **Unit tests (vitest)**, run with `npm test -w server`:
  - split engine: equal splits with leftover cents, itemized adjustments, exact/percent/shares, and every validation error
  - balances adding up to zero overall
  - settle-up producing at most n−1 transfers that clear every balance
  - guardrails: "$95" when the message said "$90" gives a warning, "90 bucks" counts as 90, "Aroon" against "Arun" gives a warning, "Ana" against "Arun" gives none
  - agent loop with a mocked Gemini client: tool dispatch, the 5-call cap, and a validation error going back to the model
- **Agent check script** (`npm run eval -w server`): about 12 example sentences sent to real Gemini, comparing the structured `create_expense_draft` arguments with the expected values. Examples include the dinner sentence, "Uber $24 Mei paid split 3 ways", "rent 1800 split 60/40 with Arun", an ambiguous one that should trigger a clarifying question, and "how much does Arun owe me?".
- **End-to-end manual check** (`npm run dev`):
  1. Type the dinner example and check the draft shows me 26 / Arun 38 / Mei 26.
  2. Confirm it; Balances should show Arun owes $38 and Mei owes $26.
  3. Ask "how much does Arun owe me?"; the answer should be $38.
  4. Settle up should list 2 transfers; record one and check the balances update.
  5. Insights should show Food & Drink.
  6. Restart the server and check the data is still there (JSON file).
  7. Type "Lunch $40 split with Aroon"; the draft should show the close-name warning, and "Use Arun" should fix it.
