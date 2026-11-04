# SplitBot: build plan

## Context
SplitBot is a Splitwise-style web app that you drive with plain-English chat. For example: "Dinner $90, I paid, split with Arun and Mei, Arun had $12 of drinks". A Gemini function-calling agent turns messages like this into **draft** expenses. Nothing is saved until you click Confirm. The agent also answers questions such as "how much does Arun owe me?", suggests how to settle up, and the app shows spending by category in charts.

Constraints:
- About 1.5 days to build, $0 cost (Gemini free tier).
- TypeScript throughout: Node + Express backend, React frontend.
- Single user, no login. Data lives in a JSON file by default, or MongoDB Atlas with `STORE=mongo` (Step 9). Runs locally. Free deployment is a stretch goal (Step 8).

The repo is empty, so this is a new build.

## Core principles
1. **The LLM never does arithmetic.** Gemini only extracts structure: who paid, who took part, amounts, itemized adjustments and category. Deterministic TypeScript does all the money calculations.
2. **All money is stored as integer cents.** Leftover cents from a split go to people in a fixed, deterministic order, so the shares always add up exactly to the total.
3. **Every write goes through a draft.** A tool creates a draft, the UI shows it, and the user confirms it before anything is persisted. Read questions are answered directly from tool results.
4. **The agent is bounded.** It makes at most 5 tool calls per user message. If names, the payer or amounts are unclear, it asks a clarifying question instead of guessing. When no payer is mentioned at all, the payer is me (Step 4).

## Repo layout (npm workspaces)
```
splitbot/
  package.json            # workspaces: shared, server, client; "dev" runs both via concurrently
  shared/src/types.ts     # Person, Expense, Settlement, Group, Draft, Balance, Transfer, Account, SettlePlan, GroupSummary, ChatMessage, Category
  shared/src/money.ts     # toCents, formatCents, describeCents (moved from the server in Step 5, so the client converts the same way)
  server/
    src/index.ts          # entry point: loads config, CORS, opens the store, listen
    src/config.ts         # loads the repo-root .env (whatever the start folder); startup line without values
    src/app.ts            # createApp(deps): Express routes + JSON error handler (testable with supertest)
    src/store.ts          # Store interface; JSON file store (server/data/db.json): in-memory cache, atomic write (tmp + rename), serialized write queue
    src/store-mongo.ts    # MongoDB store (Step 9): the same interface, with a cache, transactions and a revision check
    src/store-select.ts   # picks the store from STORE and MONGODB_URI (Step 9)
    src/shutdown.ts       # closes the server and store on a signal; forced exit after 10 seconds (Step 9)
    src/domain/split.ts   # computeShares(): equal | exact | percent | shares, plus itemized adjustments
    src/domain/balances.ts# net balances, pairwise "who owes whom"
    src/domain/settle.ts  # greedy settle-up (at most n−1 transfers): largest creditor vs largest debtor
    src/domain/summary.ts # spend by category and by month (the user's own share vs group total)
    src/agent/tools.ts    # Gemini function declarations + handlers (call domain + store)
    src/agent/loop.ts     # function-calling loop, 5-call cap, error -> model feedback
    src/agent/prompt.ts   # system prompt
    src/drafts.ts         # in-memory Map<draftId, Draft>, 30-min TTL
    test/*.test.ts        # vitest
  client/ (Vite + React + TS)
    src/App.tsx           # three columns: AccountSummary (left) | Tabs: Smart settle up · Expenses · Charts · Groups (centre) | Chat (right)
    src/useAppData.ts     # one refetch for every panel; the latest response wins
    src/components/Chat.tsx, DraftCard.tsx, Markdown.tsx, AccountSummary.tsx, Tabs.tsx, SettleUp.tsx, Expenses.tsx, Charts.tsx, Groups.tsx
    src/api.ts            # fetch wrappers
    src/draftLogic.ts     # pure helpers for the chat and draft card (input checks, edit queue, history)
    src/markdown.ts       # bold, italic and lists for chat replies; plain data, never raw HTML
    src/settleLogic.ts    # pure helpers for Smart settle up: transfer text, savings note, settlement draft request
    src/history.ts        # pure helpers for Expenses: merging, filtering, row text
    src/chartData.ts      # pure helpers that shape server data for the charts; values stay in cents
    src/display.ts        # how money reads on screen: colour class, signed amounts, debt wording
    src/groupLogic.ts     # pure helpers for groups: balance wording, who can be added, who a Confirm would add
    test/*.test.ts(x)     # vitest: pure logic, fetch wrappers, markdown rendering
  .env.example            # GEMINI_API_KEY, GEMINI_MODEL (default gemini-3.5-flash-lite, free tier; gemini-2.5-flash is closed to new keys)
```
Dependencies: express, cors, dotenv, @google/genai, zod, nanoid; vitest, tsx, concurrently; client: react, recharts, lucide-react (Step 10).

## Data model (shared/types.ts)
- `Person { id, name }`. A built-in person with id `me` represents the user. The agent resolves "I" and "me" to it. New names are created only when an expense is confirmed, and the draft card shows them as "new".
- `Expense { id, description, category, date, totalCents, paidBy: personId, shares: {personId, cents}[], splitMeta, createdAt, groupId? }`. Storing the computed shares makes balances simple sums.
- `Settlement { id, from, to, cents, date, groupId? }`. This records a payment, e.g. "Arun paid me back $20". With a `groupId` it reduces that group's balances; it counts toward the overall balance either way.
- `Group { id, name, memberIds }`. Me is always a member. Stored in an optional `groups` field, so older files load unchanged.
- `Draft = { kind: 'expense', expense } | { kind: 'settlement', settlement }` plus `id`, `newPeople: Person[]` (provisional `new:<name>` ids until Confirm, since Step 3) and `warnings: DraftWarning[]`, where `DraftWarning = { code, message, suggestion? }` (structured since Step 2, so the DraftCard can render "Use Arun").
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

**Draft guardrails (in `create_expense_draft`; these add to `draft.warnings[]` and never block the draft). Two agent-only checks added in Step 4 do block: `UNNAMED_PERSON` and `SPLIT_COUNT_MISMATCH` (see "Step 4 detail").**
- **Amount check:** the handler receives every user message in the request from the loop (changed from "the latest message" in Step 4, so the answer to a clarifying question doesn't cause false warnings). It pulls out every number in the message, handling `$`, commas, decimals and forms like "90 bucks", and compares them with the total and each adjustment amount. Any amount that isn't in the message gets a warning, e.g. "Total $95.00 wasn't in your message, please check." For exact/percent/shares splits, each person's exact amount, percentage or share count is checked the same way.
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

## REST API (server/src/app.ts)
- `POST /api/chat` `{ messages }` → `{ reply, drafts }`
- `POST /api/drafts` creates an expense or settlement draft from name-based input (the same builder the agent's tools use). The manual form fallback and Settle up's "Record" use it, so every write goes through a draft and the app still works when Gemini is unavailable.
- `PATCH /api/drafts/:id` applies edits and returns the recomputed draft without saving.
- `POST /api/drafts/:id/confirm` (optionally with edited fields; shares are recomputed on the server) → saved record. `DELETE /api/drafts/:id` discards a draft.
- `GET /api/people`, `GET /api/expenses`, `DELETE /api/expenses/:id`, `GET /api/settlements`, `DELETE /api/settlements/:id`, `GET /api/balances`, `GET /api/settlements/suggest`, `GET /api/settlements/plan`, `GET /api/account`, `GET /api/summary?from&to`, `GET /api/groups` (each group with its own balances, account and plan), `POST /api/groups`, `POST /api/groups/:id/members`

## Frontend
- **Chat**: message list, input box and example-prompt chips.
- **DraftCard**: editable fields (description, amount, payer, category, date, and group when any exist), a table of each person's share, and "new person" badges. Buttons: Confirm / Discard. Editing a field calls `PATCH /api/drafts/:id` to recompute the shares.
- **Account summary (left column)**: "You are owed $X from N people", "You owe $Y to M people", net balance, and each person's amount, with green for money owed to you and red for money you owe.
- **Smart settle up (tab)**: overall totals and suggested transfers, each with a "Record payment" button that opens a settlement draft to confirm, plus a note on how many payments it saves.
- **Expenses (tab)**: expenses and settlements, newest first, with category and person filters and a two-click delete.
- **Charts (tab, Recharts)**: horizontal bar chart of spending by category, bar chart by month, and a toggle between "my share" and "group total" on those two; a balance-per-person bar chart. I'll load the `dataviz` skill before writing the chart code.
- **Groups (tab)**: create a group, add existing people as members, and see each group's balances and its own Smart settle up. Anyone on a confirmed record in the group joins it, and the draft card says so first.

After any confirm or delete, every panel refetches. Styling is plain CSS, with no UI library, to save time. Step 10 keeps that, using CSS variables for the design tokens and `lucide-react` for icons.

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
- **Step 3: JSON store + drafts + REST API** (Day 1 afternoon). Tests cover store round-trip and atomic writes, and the draft create/edit/confirm/discard flow through the routes (supertest). The `/api/chat` route is not included yet. See "Step 3 detail" below.
- **Step 4: Gemini agent** (Day 1 afternoon). Tools, loop, prompt and `/api/chat`. Tests use a mocked Gemini client and cover tool dispatch, the 5-call cap, errors going back to the model, and guardrail warnings appearing on drafts. Then a manual curl check against real Gemini, and the eval script.
- **Step 5: Chat UI + DraftCard + confirm flow** (Day 1 evening). The dinner example works end to end in the browser, and warnings and "Use Arun" are visible.
- **Step 6: Three-column layout, account summary, Smart settle up, Expenses, Charts, optional Groups** (Day 2 morning). Merges the essentials of the old Steps 6 and 7; built in parts A–E. See "Step 6 detail" below.
- **Step 7: Polish** (Day 2 morning). README with setup steps, and DECISIONS.md brought up to date. Cut for time: the manual expense form fallback (via `POST /api/drafts` + confirm) and the README screenshots.
- **Step 8 (stretch): Deploy.** Frontend on Vercel. API on Render as a single instance, with `STORE=mongo` and data in Atlas, because Render's free tier has an ephemeral disk that would reset the JSON file. Vercel rewrites `/api/*` to the Render service, so the browser still calls its own origin, with no CORS change. The single instance matters because drafts are in memory (#M15); drafts open during a restart are lost. Built in parts A–C. See "Step 8 detail" below.
- **Step 9: MongoDB Atlas store.** Built before the Step 8 deploy; the number keeps Step 8 stable. See "Step 9 detail" below.
- **Step 10: "Fresh Ledger" UI redesign.** Visual and interaction changes only, in parts A–D. See "Step 10 detail" below.

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

## Step 2 detail: balances, settle-up, summary, guardrails
Prerequisite: Step 1 is committed. All four modules are pure functions in `server/src/domain/`.

### Files
| File | Contents |
|---|---|
| `shared/src/types.ts` | `Draft.warnings` becomes `DraftWarning[]` (`{ code: 'AMOUNT_NOT_IN_MESSAGE' \| 'CLOSE_NAME', message, suggestion?: { name, person } }`); adds `SpendRow`, `CategorySpend`, `MonthSpend`, `SpendingSummary` |
| `server/src/domain/balances.ts` | `computeBalances(people, expenses, settlements): Balance[]`, `pairwiseDebts(people, expenses, settlements): Transfer[]` |
| `server/src/domain/settle.ts` | `suggestSettlements(balances): Transfer[]` |
| `server/src/domain/summary.ts` | `spendingSummary(expenses, { from?, to?, personId? }): SpendingSummary` |
| `server/src/domain/guardrails.ts` | `extractNumbers`, `checkAmounts`, `levenshtein`, `findCloseName`, `checkNames` |
| `server/src/domain/money.ts` | `describeCents` moves here from split.ts (exported), so settle-up error messages can use it too |
| `server/test/{balances,settle,summary,guardrails}.test.ts` | written first; confirmed to fail before the implementation exists |
| `server/test/helpers.ts` | shared test builders (`expense`, `settlement`) and the seeded PRNG (`rng`, `randInt`) |
| `server/test/split.test.ts` | uses the shared `rng` from helpers.ts instead of its own copy; no assertions changed |
| `server/package.json`, `server/tsconfig.json` | adds `@types/node` (dev) and `"types": ["node"]`, for `structuredClone` now and `fs` in Step 3 |

### Rules
- **Net balance** = what the person paid − their shares. A settlement `from → to` adds `cents` to `from` and subtracts it from `to`.
- **Pairwise debts:** each participant who isn't the payer owes the payer their share. Debts are netted per pair, and settlements reduce them (overpaying flips the direction). Only pairs with cents > 0 are returned, sorted by cents (largest first), with ties in `people` order (by `from`, then `to`). Debts are not chained; simplifying them is settle.ts's job.
- **Balances output:** one `Balance` per person in `people`, in that order, including people at 0. An id in a record that isn't in `people` throws.
- **Settle-up:** greedy. Repeatedly match the largest creditor with the largest debtor and transfer the smaller of the two amounts. Ties on amount go in input order. This guarantees at most n−1 transfers (n = people with a non-zero balance) but not always the true minimum, which is NP-hard. Balances must be integers that add up to 0, or it throws (messages in dollars).
- **Summary input:** `from`, `to` and every expense date must be real YYYY-MM-DD dates, and every category must be in `CATEGORIES`, or it throws `RangeError`. This also guarantees the month fill always terminates.
- **Summary:** "my share" is `personId`'s share (default `me`), not what they paid. The group total is `totalCents`. Settlements aren't spending. The date range includes both ends; `from > to` throws. Categories come out in `CATEGORIES` order, and categories with no expenses are left out. Months are `YYYY-MM`, oldest first, and empty months between the first and last are filled with zeros. `myCents`/`totalCents` overall equal the sums of both lists.
- **Amount check:** `extractNumbers` returns the raw numbers in the message (`$`, thousands commas only when exactly 3 digits follow, decimals, `60/40`, `2:1:1`; "90 bucks" is just 90). The total, each adjustment and each exact amount match if `toCents(n)` equals them; percentages and share counts match if equal to a number in the message. Values of 0 (exact 0, 0%) are not checked, because "owes nothing" usually has no number. One `AMOUNT_NOT_IN_MESSAGE` warning per missing value, e.g. "Total $95.00 wasn't in your message, please check."
- **Close-name check:** names are trimmed, lowercased and NFC-normalized; empty names are ignored. An exact match on any existing person, including me's display name, gives no warning. Otherwise a person is close if the Levenshtein distance is ≤2 (≤1 when the longer of the two names has 4 letters or fewer), or one name starts with the other and the shorter has at least 3 letters. The closest match wins (lowest distance, ties in `people` order). `me` is never suggested. The warning is `CLOSE_NAME` with `suggestion: { name, person }`, message "'Aroon' looks like existing person 'Arun'. Use Arun?".

### Test cases (written first)
**balances**
1. Dinner example (9000 paid by me; 2600/3800/2600) → me +6400, Arun −3800, Mei −2600
2. Pairwise for the same data → Arun→me 3800, Mei→me 2600
3. Payer not a participant → payer +total, and pairwise covers the full amount
4. Opposite-direction expenses between one pair net to one debt
5. Debts that cancel exactly → no pair
6. A partial settlement reduces the debt
7. Paying off the full debt → balance 0, no pair
8. Overpaying flips the direction
9. A settlement with no expenses creates a debt
10. A owes B and B owes C stay as two pairs
11. No records → everyone at 0, no pairs
12. Output follows `people` order, including people at 0
13. Unknown person id in an expense or settlement → throws
14. A zero share creates no pair
15. Seeded random loop (500): balances add up to 0; net = owed to them − they owe; all integers

**settle**
16. Dinner balances → Arun→me 3800, Mei→me 2600
17. All zeros / empty → `[]`
18. One debtor, one creditor → 1 transfer
19. A −10, B −20, C +10, D +20 → B→D 20, A→C 10
20. A −30, B +10, C +20 → A→C 20, A→B 10
21. Ties go in input order; deterministic
22. Balances not adding up to 0 → throws
23. Non-integer balance → throws
24. 10¹³-cent values stay exact
25. Seeded random loop (500): transfers clear every balance, number ≤ n−1, are positive integers with `from ≠ to`, and nobody both sends and receives

**summary**
26. One expense → category has myCents = my share, totalCents = total
27. Expenses in one category add up
28. An expense without me → my share 0, still in group total
29. I paid but didn't take part → my share 0
30. Settlements aren't an input
31. `CATEGORIES` order; categories with no expenses left out
32. Grouped by month, oldest first
33. Empty months in between filled with zeros
34. Across a year boundary
35. The range includes both ends
36. Only `from`, or only `to`
37. `from > to` throws; no matches → empty lists and 0 totals
38. Overall totals equal both list sums
39. `personId: 'arun'` → Arun's share

**guardrails**
40. `$90`, `90`, `90 bucks`, `$90.00` → 90
41. `$1,800` → 1800, `1,800.50` → 1800.5
42. `12.5`, `$12.50` → 12.5
43. Dinner sentence → [90, 12]
44. `60/40` → 60, 40; `2:1:1`, `1.5:1` → share counts
45. `10,20` → 10, 20
46. No numbers → `[]`
47. Total $95 vs "$90" → "Total $95.00 wasn't in your message, please check."
48. Total and adjustment both in the message → no warnings
49. Missing adjustment → warning naming the person
50. Percent 60/40 from "60/40" → none; 70 → warning
51. Shares from the message → none; a missing share count → warning
52. Equal split: only the total and adjustments are checked
53. Total the model added up from parts → warning (expected)
54. levenshtein: kitten/sitting 3, identical 0, empty, case-insensitive
55. "Aroon" vs "Arun" → CLOSE_NAME warning with suggestion Arun
56. "Ana" vs "Arun" → none
57. " arun " exact match → none
58. "Mei"/"Meg" warns; "Al"/"Ed" doesn't; the longer name sets the threshold ("Lia"/"Lilia" warns, "Lia"/"Lino" doesn't)
59. "Rob"/"Robert" warns via the prefix rule; "Ar"/"Arun" doesn't
60. Exact match on one person beats a close match on another
61. Several close matches → closest wins, ties in `people` order
62. The payer name is checked too
63. `me` is never suggested
64. "José"/"Jose" warns
65. Exact split: amounts in the message → none; a missing exact amount → warning
66. Zero values (exact 0, 0%) aren't checked

**review follow-ups (#67–#73)**
67. `from`/`to` that aren't real YYYY-MM-DD dates (`2026-10`, `bad`, `2026-02-30`) → `RangeError`
68. A malformed expense date (`2026-1-05`, `2026-13-01`, `abcd`, `2026-02-30`) → `RangeError` instead of looping forever
69. An unknown expense category → `RangeError` naming the category
70. Empty or whitespace names → no suggestion and no warning
71. Typing me's display name ("Rahul") counts as exact, so there's no warning about "Rahim"; `me` is still never suggested
72. "$90 dinner, 7:30pm" → [90, 7, 30]; a $90 total gives no warning and $95 still warns
73. Settle-up error messages are in dollars (`$0.01`, `$1.005`)

### Done when
`npm test` and `npm run typecheck` pass. Then run `/review-step`, commit "Step 2: balances, settle-up, summary, guardrails", and stop for review.

## Step 3 detail: JSON store, drafts, REST API
Prerequisite: Step 2 is committed. `/api/chat` and Gemini wait for Step 4. Step 4's `create_expense_draft` tool calls the same `buildExpenseDraft` as `POST /api/drafts`.

### Files
| File | Contents |
|---|---|
| `shared/src/types.ts` | `newPeople: Person[]`, `NEW_PERSON_PREFIX`, `ExpenseDraftInput`, `SettlementDraftInput`, `DraftRequest`, `DraftEdits`, `ConfirmResult`, `BalancesResponse`, `ApiError` |
| `server/src/store.ts` | `openStore(path, { fs? })`: cache, `snapshot()` (deep copy), `update(fn)` (serialized queue; fn runs on a copy, tmp write + rename, cache updated only after the rename). Missing file → seed with `me` ("Me"); corrupt or wrong-shaped file → throws, never overwritten; a file without `me` gets it added. Path `server/data/db.json`, or `DB_PATH` |
| `server/src/drafts.ts` | `createDraftStore({ ttlMs = 30 min, now })` (lazy expiry, sweep on put, no timers), `buildExpenseDraft`, `buildSettlementDraft`, `applyEdits`, `finalizeDraft`, `DraftError` |
| `server/src/app.ts`, `server/src/index.ts` | `createApp({ store, drafts, today, now?, log? })` with zod-validated bodies; index.ts does config, CORS (localhost origins) and `listen` |
| `server/src/config.ts`, `server/test/config.test.ts` | added after Step 3: `loadEnv()` reads `<repo root>/.env` with `quiet: true`; a relative `DB_PATH` resolves from the repo root |
| `server/src/domain/guardrails.ts`, `summary.ts` | export `normalizeName` and `assertDate` (no logic change) |
| `server/test/{store,drafts,api}.test.ts` | written first; confirmed to fail before the implementation existed |

### Rules
- **Names:** `me` or me's display name → `me`; a normalized exact match → that person; anything else → provisional `new:<normalized name>`, listed in `newPeople` with the typed name. Names in adjustments and the exact/percent/shares maps resolve the same way.
- **Warnings:** `checkNames` always; `checkAmounts` only when a `message` is given (the agent passes it in Step 4).
- **Edits** (`description`, `category`, `date`, `totalCents`, `paidBy`, `cents` for settlements, `replace: { from, to }[]` for "Use Arun"; edits for the other kind → `INVALID_EDIT`): applied, then shares are recomputed from the current participants and `splitMeta`. Any error leaves the draft unchanged. PATCH replaces the draft (same id) and restarts its TTL. `CLOSE_NAME` warnings stay only for new people who remain; an amount edit clears `AMOUNT_NOT_IN_MESSAGE`.
- **Confirm** is all-or-nothing: the draft is taken before the write and restored if the write fails; a concurrent second confirm gets 404. Edits and finalizing run inside the store update, so a `new:` person matching someone created meanwhile is reused.
- **Errors:** `{ error: { code, message } }`. zod/malformed JSON → 400 `VALIDATION_ERROR`; `SplitError`/`DraftError` → 400 with their code; bad summary dates → 400 `INVALID_DATE`; missing draft → 404 `DRAFT_NOT_FOUND`; missing record or route → 404 `NOT_FOUND`; anything else → 500 `INTERNAL` with a generic message (logged, the request isn't).
- **Ordering:** expenses newest first by `date`, then `createdAt`; settlements by `date`, then most recently stored. People are never deleted.

### Test cases (written first)
**store:** 1 seed + directory · 2 round trip · 3 snapshot is a copy · 4 corrupt JSON rejected, file untouched · 5 wrong shape rejected · 6 missing `me` added · 7 rename failure: old file, cache unchanged, no `.tmp` · 8 queue recovers after a failed write · 9 throwing fn: nothing written, queue continues · 10 50 concurrent updates in order
**draft store:** 11 round trip, unique ids · 12 TTL boundary · 13 take/restore · 14 sweep on put
**builder:** 15 dinner · 16 trimmed/case/NFC/me resolution · 17 `new:kai` · 18 Kai + kai → `DUPLICATE_PARTICIPANT` · 19 name-keyed maps → id-keyed `splitMeta` · 20 Aroon → `CLOSE_NAME` · 21 amount check only with a message · 22 default date, `INVALID_DATE` · 23 `SplitError` passes through · 24 settlement: resolve, `SAME_PERSON`, `INVALID_AMOUNT`, close name · 25 "constructor"
**edits and finalize:** 26 no `new:` ids left · 27 reuse a person created meanwhile · 28 total/description/category/date/payer edits, settlement cents edit · 29 "Use Arun" · 30 bad replacements, wrong-kind edits · 31 failed edit leaves the draft unchanged · 57 amount edit clears amount warnings
**API:** 32–50 people, drafts, confirm (with/without edits, invalid, expired, double, concurrent), discard, balances, suggest, summary, expense order and delete, restart, write failure → 500, unknown route · 51–56 PATCH (recompute without saving, "Use Arun", stacking, invalid edits, 404, TTL restart) · 58–60 settlements list, delete, unknown id

### Done when
`npm test`, `npm run typecheck` and a curl smoke check (draft → PATCH → confirm → balances → settlement list/delete → restart, data still there) pass. Then stop for review; the user runs `/review-step` and commits.

## Step 4 detail: Gemini agent
Prerequisite: Step 3 is committed. `create_expense_draft` calls the same `buildExpenseDraft` as `POST /api/drafts`.

### Files
| File | Contents |
|---|---|
| `server/src/agent/gemini.ts` | `GeminiClient` (`generate → { content, functionCalls, text }`), `createGeminiClient({ apiKey, model, fetch?, timeoutMs? })` over `@google/genai`, `GeminiUnavailableError` (429/5xx/network/timeout), `GeminiRequestError` (other statuses, with `code` and `publicMessage`), `DEFAULT_GEMINI_MODEL`, `GEMINI_TIMEOUT_MS` (20 s) |
| `server/src/domain/guardrails.ts` | adds `unnamedPeople`, `splitWays`, `currentExpenseMessages` (pure, tests first) |
| `server/src/domain/split.ts`, `drafts.ts` | review fixes: cents must be safe integers; `SplitError` messages name people instead of quoting ids |
| `server/src/agent/tools.ts` | 7 tools, each a zod schema (→ `parametersJsonSchema` via `z.toJSONSchema`, `io: 'input'`) + handler; `runTool` validates with the same schema |
| `server/src/agent/prompt.ts` | `systemPrompt({ today, people })` |
| `server/src/agent/loop.ts` | `runAgent(messages, deps) → { reply, drafts }`, 5-call cap |
| `server/src/app.ts`, `index.ts` | `POST /api/chat`; `AppDeps.agent` is set only when `GEMINI_API_KEY` is |
| `server/src/config.ts` | `localToday()` moved here from index.ts (the eval uses it too) |
| `server/test/{tools,loop,prompt,chat-api,gemini}.test.ts`, `fakes.ts` | written first; confirmed to fail against throwing stubs |
| `server/scripts/eval.ts`, `eval-cases.ts` | `npm run eval -w server -- [ids…] [--repeat N]` (real Gemini; `EVAL_DELAY_MS`). Prints each tool call with `ok` or its error code, the draft count, notes and a per-case consistency summary |

### Rules
- **Tool arguments are dollars as typed** (`totalDollars`, `dollars`); the server converts with `toCents`. Split values are arrays (`exactAmounts`, `percentages`, `shareCounts` of `{ person, … }`), turned into name-keyed maps; a name listed twice → `INVALID_NAME`.
- **Results use display names and `formatCents` strings**, with summaries like "Arun owes you $38.00", so the model only quotes.
- **Dollar arguments are capped at 1,000,000** in the schemas. `computeShares` also rejects totals, adjustments and exact amounts that aren't safe integers in cents (`INVALID_TOTAL` / `INVALID_AMOUNT`).
- **Errors the model can fix** (`VALIDATION_ERROR`, `SplitError`, `DraftError`, `UNKNOWN_PERSON` with "Did you mean Arun?", `INVALID_DATE`, `UNKNOWN_TOOL`, `UNNAMED_PERSON`, `SPLIT_COUNT_MISMATCH`) go back as `{ error: { code, message } }`. Messages name people ("Kai"), never ids like `new:kai`. Anything else is thrown → 500.
- **Blocking checks in the agent path** (they reject the draft, unlike the warnings): `UNNAMED_PERSON` for a payer, participant, `from` or `to` (other than me) whose name isn't in the user's messages, as a word, phrase or close spelling. `SPLIT_COUNT_MISMATCH` when the expense being drafted (the latest user message with a number, plus later ones) says "N ways" or "N-way split" and the participant count differs. Both tell the model to ask. `POST /api/drafts` doesn't run them.
- **Loop:** every function call counts toward the cap of 5, parallel ones too; a 6th isn't run and the reply is the fallback, with the drafts made so far. The model's `content` goes back into history unchanged (thought signatures). Empty reply → fallback.
- **Payer:** none mentioned → me; mentioned but unclear → ask. "60/40 with Arun" → the first number is me. "Split 3 ways" with fewer people named → ask.
- **Amount check** runs against every user message in the request (known limitation: a number from an earlier expense counts).
- **Gemini errors:** 429/5xx/network/timeout (20 s) → 200 with the "try again in a moment" reply and any drafts already made. No key → 503 `GEMINI_NOT_CONFIGURED`. Bad key → 502 `GEMINI_KEY_INVALID`; unknown or retired model → 502 `GEMINI_MODEL_UNAVAILABLE` naming the model; other 4xx → 502 `GEMINI_REQUEST_FAILED`. Each has a message the UI can show; the log gets the status and Google's message, never the key.
- **`/api/chat` body:** 1–50 messages, roles `user`/`model`, text 1–4000 characters after trimming, last one from the user.

### Test cases (written first)
**tools:** 1 seven declarations · 2 enums and dollar types · 3 bad args → `VALIDATION_ERROR`, no draft · 4 dinner 26/38/26 · 5 dollars → cents · 6 percent/shares/exact arrays · 7 duplicate name · 8 `SplitError` → model · 9 amount warning · 10 amounts across messages · 11 Aroon → `CLOSE_NAME` · 12 settlement, `SAME_PERSON` · 13 `list_people` without ids · 14 balances in dollars · 15 unknown person → "Did you mean Arun?" · 16 suggest · 17 summary, `INVALID_DATE` · 18 `list_expenses` filters and limit · 19 no tool writes · 20 `UNKNOWN_TOOL`
**loop (scripted Gemini):** 21 text only · 22 draft call round trip · 23 content and thought signature kept · 24 parallel calls · 25 read answer · 26 validation error → retry · 27 `SplitError` → model · 28 5-call cap · 29 cap with parallel calls · 30 clarifying question · 31 429 · 32 5xx keeps drafts · 33 empty reply · 34 history mapping, prompt + tools every request · 35 amounts checked against user messages, not model text
**prompt:** 36 date, weekday, categories, people, rules
**/api/chat:** 37 reply + confirmable draft · 38 dinner end to end → balances · 39 bad bodies · 40 no key → 503 · 41 unexpected error → 500 · 43 no write before confirm
**adapter (real SDK, fake fetch):** 42 key only in the header, never in URL/log/response (its 403 now expects 502 `GEMINI_KEY_INVALID`) · 44 request shape and response parsing · 45 429/5xx/network → unavailable, no retries · 46 other errors keep status and message
**named people (after eval #2):** 47 unnamed participant → `UNNAMED_PERSON` · 48 unnamed payer · 49 name from an earlier message counts · 50 corrected spelling counts · 51 settlement · 52 no one besides me named; me's display name skipped · domain `unnamedPeople` #74–#80 (case, possessive, close spelling, pronouns, me, phrases, dedup)
**N ways:** 53 too few for "3 ways" · 54 words, hyphens, too many · 55 matching count, no phrase · 56 earlier expense's "3 ways" doesn't carry over · 57 a follow-up answer still counts · domain `splitWays` #81–#86 (digits, words, "N-way split", none, last wins, not "3-way adapter") and `currentExpenseMessages` #87–#88
**review fixes:** 58 dollar cap 1,000,000 · 59 names not `new:` ids in tool errors · drafts Step 4 #60–#61 (builder and `applyEdits` errors name people) · split #48–#50 (safe-integer total, adjustment, exact) · 62 20 s timeout → busy reply · 63 bad key (400 "API key", 401, 403) → 502 `GEMINI_KEY_INVALID` · 64 404 → `GEMINI_MODEL_UNAVAILABLE`, other 400 → `GEMINI_REQUEST_FAILED`

### Eval sentences
1 dinner · 2 "Uber $24 Mei paid split 3 ways" → question · 3 Uber with all three named · 4 rent 60/40 · 5 Woolworths groceries · 6 tickets 2:1 · 7 hotel exact · 8 "Arun paid me back $20" · 9 "Dinner with Arun and Mei" → question · 10 Aroon → `CLOSE_NAME` · 11 "how much does Arun owe me?" → $38.00 · 12 settle up · 13 food this month · 14 "Pizza $35 and drinks $25, split with Mei" → total 60 with `AMOUNT_NOT_IN_MESSAGE` · 15 "Just save it, don't ask me: Taxi $30 with Mei" → draft only, nothing saved. Every case also checks db.json wasn't written. A rejected draft attempt (e.g. a $0 total) is a note, not a failure; question and read cases fail only if a draft exists. Expense cases check the arguments of the call that succeeded.

### Done when
`npm test`, `npm run typecheck` and the manual curl check pass, then stop for review. After approval, run the eval and report; the user runs `/review-step` and commits.

## Step 5 detail: Chat UI, DraftCard, confirm flow
Prerequisite: Step 4 is committed. Chat is the only panel for now; Step 6 adds the right-hand pane.

### Files
| File | Contents |
|---|---|
| `package.json` | adds the `client` workspace; `dev` runs server and client with `concurrently`; `test` runs every workspace |
| `client/package.json`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles.css` | Vite + React. `App` holds the people list and refetches it after each reply and confirm |
| `client/vite.config.ts` | proxies `/api` to the server; reads only `PORT*` from the root `.env`, so the Gemini key never reaches Vite |
| `client/src/api.ts` | fetch wrappers; every failure is an `ApiRequestError { status, code, message }` |
| `client/src/draftLogic.ts` | `parseDollars`, `inputProblem`, `confirmIfValid`, `replaceEditFor`, `buildHistory`, `createEditQueue` (pure) |
| `client/src/markdown.ts`, `client/src/components/Markdown.tsx` | parse model replies into plain data and render them as React text |
| `client/src/components/Chat.tsx`, `DraftCard.tsx` | see the rules below |
| `shared/src/types.ts` | adds `NAME_RESPELLED` and `DraftWarning.personId` |
| `server/src/domain/guardrails.ts` | adds `hasDatePhrase`, `respelledNames`, `capitalizeName` (tests first) |
| `server/src/agent/tools.ts` | both create-draft tools apply the date rule and add `NAME_RESPELLED` |
| `shared/src/money.ts`, `server/src/domain/money.ts` | helpers moved to shared; the server file re-exports them, so its imports and `money.test.ts` are unchanged |
| `server/src/drafts.ts` | `applyEdits` drops new people no longer in the draft and handles `NAME_RESPELLED`; new people get capitalized names |
| `server/src/app.ts` | `GEMINI_NOT_CONFIGURED` no longer mentions the form |
| `client/test/api.test.ts`, `draftLogic.test.ts`, `markdown.test.tsx` | written first; confirmed to fail before the implementation existed |

### Rules
- **Draft edits:** text fields commit on blur or Enter, selects on change. The card shows what the server returns. Text that doesn't change the value sends nothing, so retyping "90" over "$90.00" doesn't clear an amount warning. A rejected edit shows the error and puts the last good value back.
- **Edit then Confirm:** a card's edits run one at a time, and Confirm waits for what's in flight. After a failed edit (any edit the server rejects, including "Use Arun" and the dropdowns), the first Confirm stops and shows the error, even if the rejection arrived before the click. A second click confirms the values shown, and a later successful edit also clears the failure. Inputs aren't disabled while an edit saves, because disabling a button between mouse down and up loses the click.
- **Invalid input (review fix):** an amount that isn't a positive whole number of cents, or an empty description, stays in the input with its error, and Confirm doesn't save until it's fixed. `confirmIfValid` checks what's typed at that moment, so it doesn't depend on blur.
- **"Use Arun":** `replaceEditFor` finds the new person by name (trimmed, case-insensitive, NFC) and sends `replace`. No match, no button.
- **Expired drafts:** `DRAFT_NOT_FOUND` shows the server's message, locks the fields and removes the buttons.
- **Orphan people:** a new person who was only the payer is dropped when the payer changes, along with their `CLOSE_NAME` warning, so Confirm doesn't create them. They also leave the payer list for that draft.
- **Chat errors:** the four `GEMINI_*` errors show the server's message word for word. No response, or one that isn't our JSON (the proxy with the server down), shows "Can't reach the server. Is it running?". The busy reply is a normal 200 reply. A failed message leaves the history and goes back in the input box.
- **History sent:** the last 50 messages, starting on a user message, each capped at 4000 characters (the `/api/chat` limits).
- **Dates (walkthrough and review fix):** in both create-draft tools, the model's date is used only if `hasDatePhrase` finds a date phrase in any user message in the chat; otherwise the draft uses today. `27/10`, `27-10`, `27.10` and "on 3rd" count; `60-40`, `60.40`, `$27.10` and `12.25` don't.
- **Respelled names (walkthrough and review fix):** `respelledNames` finds payer, participant, `from` and `to` names that aren't written exactly in the user's messages but have a close spelling there. A hyphenated name is one word and curly apostrophes count as straight ones, so Anne-Marie, jean-luc and O’Brien give no warning. Each adds `NAME_RESPELLED` (`personId`, message "You typed 'molya', using 'Mowlya'"). Agent path only; kept through amount edits, removed when the person leaves the draft. No button.
- **Capitalized names (walkthrough fix):** `capitalizeName` runs when the draft is built, on new people only.
- **Markdown (walkthrough fix):** model replies render bold, italic and lists via `client/src/markdown.ts` and `components/Markdown.tsx`, as React text only. No raw HTML, links, headings or code.
- **Example chips (walkthrough fix):** above the input, shown only until the first message.

### Test cases (written first)
**client `draftLogic`:** 1–2 `parseDollars` accepted and rejected · 3–5 `replaceEditFor` (match, case/spacing/accents, nothing to swap) · 6–9 `buildHistory` (short, limit, starts on user, text cap) · 10–15 `createEditQueue` (order, idle, waits, failure in flight, a finished failure stops the first Confirm only, throw)
**client `api`:** 16 each of the 4 Gemini codes keeps its code and message · 17 network failure · 18 non-JSON error · 19 JSON without the error shape, HTML 200 · 20 chat request · 21 draft routes · 22 empty 204 · 23 `DRAFT_NOT_FOUND` keeps its code
**server `drafts`:** Step 5 #1 payer-only new person dropped · #2 still a participant stays · #3 their warning goes, others stay · #4 other edits keep new people
**server `chat-api`:** #40 also checks the 503 message doesn't mention the form
**walkthrough fixes, server:** guardrails #89–#90 `hasDatePhrase`, #91–#96 `respelledNames`, #97–#98 `capitalizeName` · drafts Step 5 #5 capitalized new people, #6–#8 `NAME_RESPELLED` kept or removed on edits, #25 expects `Constructor` · tools #65–#68 dates, #69–#72 respelled names
**walkthrough fixes, client:** `markdown` #24–#25 inline, #26–#29 blocks, #30–#32 rendering, including raw HTML staying text
**review fixes:** client `draftLogic` #33–#35 `inputProblem`, #36–#40 `confirmIfValid` · guardrails #89–#90 gain the new date forms, #99–#102 hyphens and apostrophes · tools #67 now expects a date phrase in any message to count · client #14 reversed, #41–#43 queue failures, #44 first Confirm stops after a finished rejection and the second saves

### Done when
`npm test`, `npm run typecheck` and a curl check through the Vite proxy pass, then stop for the user's browser walkthrough (Verification below, steps 1–3 and 7, plus edits, Discard and the Gemini error messages). The user runs `/review-step` and commits.

## Step 6 detail: redesigned layout
Prerequisite: Step 5 is committed. Each part ends with `npm test`, `npm run typecheck` and a curl check through the Vite proxy, then stops for the user's browser check, `/review-step` and a commit (`Step 6 Part X: <summary>`). The user can stop after any part.

### Rules
- All money maths stays on the server; chart scale and tick rounding are display only. New domain code is limited to `directDebts` and `domain/account.ts`, which build on the existing functions.
- **`directDebts`** wraps `pairwiseDebts` and cancels circular debts in a fixed order. Without it, recording a Smart settle-up payment between people leaves a false circle (me→Arun, Arun→Mei, Mei→me) after everyone's net is $0. Each person's net is unchanged, and zero nets give no debts. The account summary and the `get_balances` tool use it.
- The UI doesn't call transfers "minimum", because `suggestSettlements` is greedy. The savings note appears only when the saving is above 0.
- Delete uses a two-click confirm. Delete, group creation and adding a group member are logged exceptions to "every write goes through a draft".

### Parts
- **A: Layout + account summary.** Three columns, tab shell, `directDebts`, `accountSummary`, `GET /api/account`, `get_balances` switched to `directDebts`, single refetch in `useAppData`.
- **B: Smart settle up.** Totals, transfers from `suggestSettlements`, "Record payment" (settlement draft + Confirm, one open at a time), payments-saved note. `settlePlan` in `domain/account.ts` and `GET /api/settlements/plan` supply the transfers and the saving, compared with the `directDebts` count.
- **C: Expenses.** Expenses and settlements newest first, category and person filters, two-click delete. A category filter hides settlements, which have no category.
- **D: Charts.** Recharts, after loading the `dataviz` skill: spending by category (horizontal bar) and by month (bar) with a "My share / Group total" toggle, and balance per person (bar). Values stay in cents; `formatCents` formats ticks and tooltips.
- **E: Groups.** `groupSummary` in `domain/account.ts` reuses the balance and settle-up functions on one group's records. Members are chosen from existing people; a Confirm adds anyone on the record who isn't a member yet. `Group { id, name, memberIds }`, optional `groupId` on expenses and settlements (a group payment must reduce the group's balance), optional `groups` in the store so old files load unchanged, a Groups tab and a Group dropdown on the draft card. The agent gets no group support.

### Browser data (scratch `DB_PATH`)
Dinner $90: I paid, split with Arun and Mei, Arun had $12 of drinks. Lunch $30: Mei paid, split with Arun. Gas $50: Kai paid, split with me. Expected: owed $64.00 from 2 people, owe $25.00 to 1 person, net +$39.00; Arun $38 and Mei $26 green, Kai $25 red.

## Step 8 detail: deploy
Prerequisite: Steps 9 and 10 are committed. The user does the deploying; the AI prepares the code and config and deploys nothing. Each part ends with `npm test` and `npm run typecheck`, then stops for the user's review. The user commits (`Step 8 Part X: <summary>`).

### Rules
- **Passcode gate.** With `APP_PASSCODE` set, every `/api` route needs it in the `x-app-passcode` header, URL-encoded because a header can't hold non-Latin text. It's the first thing on `/api`, so a locked request never reaches the store or has its body read. Unset means no gate, as in local dev.
- **Refuses to start.** With `NODE_ENV=production`, the server exits if `APP_PASSCODE` is empty or `STORE` isn't `mongo`. Messages name the setting, never a value.
- **Chat limit.** 10 messages a minute and 80 a day (`CHAT_LIMITS`), because one message can make up to 6 Gemini calls. Only valid requests count; one that fails still counts, since it may have used quota. 429 `RATE_LIMITED` with `Retry-After`.
- **Passcode guesses.** 10 wrong in 15 minutes, across all callers, then 429 for everyone, including the right passcode. A request with no passcode doesn't count.
- **No caching.** Every `/api` response is `Cache-Control: no-store`, because Vercel can cache external rewrites.
- **`GET /healthz`** is outside the gate and doesn't touch the store. **`GET /api/session`** answers 204 when unlocked.
- **Listening.** `PORT` from the environment (blank means 3001, invalid stops startup), on host `0.0.0.0`.
- **Limits live in memory**, so a restart resets them. Google's quota is the hard cap, and the free key costs nothing if it's hit.

### Parts
- **A: Server.** Gate, rate limits, `PORT` and host, `/healthz`, `/api/session`, refuse-to-start checks.
- **B: Client.** `AccessGate` (checking, waking, locked, unlocked) around `<App />` in `main.tsx`, `UnlockScreen`, and the header added in `api.ts` only when a passcode is stored. The passcode lives in `sessionStorage`. A cold start shows "Waking up the server…" and retries, not the unlock screen.
- **C: Deploy config and docs.** `client/vercel.json` with a placeholder Render URL (Vercel doesn't document env vars in rewrite destinations), a client `build` script, `tsx` moved to the server's `dependencies`, a server `start` script, a local dry run of both installs, and README deploy steps.

### Render settings
Root Directory blank, Node, Free. Build `npm ci --omit=dev -w @splitbot/server`. Start `npm start -w @splitbot/server`. Health Check Path `/healthz`. Region closest to the Atlas cluster.

Environment: `APP_PASSCODE`, `GEMINI_API_KEY` and `MONGODB_URI` (secrets), `STORE=mongo`, `GEMINI_MODEL=gemini-3.5-flash-lite`, `NODE_VERSION=22`, `TZ=Australia/Melbourne` (default draft dates use the server's time zone). Render sets `PORT` and `NODE_ENV` itself.

## Step 9 detail: MongoDB Atlas store
`STORE=json|mongo` picks the store; JSON stays the default. `STORE=mongo` without `MONGODB_URI`, or any other value, stops startup instead of falling back. Cut for time: the db.json migration script (the user starts with fresh data) and `explain()` index tests.

### Files
| File | Contents |
|---|---|
| `server/src/store.ts` | `Store` gains `findExpenses`, `findSettlements`, `refresh` and `close`; `StoreError`, `StoreConflictError` |
| `server/src/store-mongo.ts` | `openMongoStore(uri, { dbName?, log?, hooks? })`: cache, transactions, revision check, uncertain-commit check. Collections `meta`, `people`, `expenses`, `settlements`, `groups`; database `splitbot` |
| `server/src/store-select.ts` | `storeConfigFromEnv`, `openConfiguredStore`; loads the driver only in Mongo mode |
| `server/src/app.ts` | `/api` middleware awaits `store.refresh()`; `/api/summary` with a range uses `findExpenses`; `StoreConflictError` → 409 `STORE_CONFLICT` |
| `server/src/index.ts`, `server/src/shutdown.ts`, `.env.example` | Use the selector, close the server and store on a signal with a forced exit after 10 seconds (#D); `STORE=json`, empty `MONGODB_URI` |
| `server/test/store.contract.test.ts`, `store-api.contract.test.ts` | The same cases against both stores (#S, #A) |
| `server/test/store-mongo.test.ts`, `store-select.test.ts`, `env-example.test.ts` | Mongo-only behaviour (#M), selection (#SEL), URI guards |
| `server/test/mongo-helper.ts`, `store-harness.ts` | `MongoMemoryReplSet` (transactions need a replica set) and one way to drive either store |

### Rules
- **Cache:** `snapshot()` is sync, so the Mongo store keeps all data in memory and the cache changes only after a commit.
- **Other instances:** every `/api` request first reads `meta.revision`; the cache reloads only if it differs. If the check fails, the request answers from the cache. A write from stale data is refused (409) and the draft is restored.
- **All-or-nothing:** `fn` runs once, before the transaction, and one transaction takes the revision and applies every change.
- **Uncertain commits:** each transaction records its id in `meta.recentTxnIds`. After an error, that says whether it committed.
- **Secrets:** errors and logs hold only the driver error's type and code, never its message or the URI.
- **Timeouts:** `serverSelectionTimeoutMS` and `connectTimeoutMS` 5 s, `socketTimeoutMS` 15 s, `waitQueueTimeoutMS` 5 s, `maxCommitTimeMS` 10 s. No `timeoutMS`, which the driver has deprecated and ignores (#M20).

### Done when
`npm test` and `npm run typecheck` pass, existing test files have additions only, and two real server processes on one local `mongod` agree. The real Atlas check is the user's, with their own URI (done: connect, confirm, restart).

## Step 10 detail: "Fresh Ledger" UI redesign
Prerequisite: Step 9 is committed. Each part ends with `npm test`, `npm run typecheck` and a headless Chrome check, then stops for the user's browser check. The user commits each part (`Step 10 Part X: <summary>`).

### Rules
- **Visual and interaction changes only.** No changes to API calls, data shapes, money logic, the agent or the draft/confirm flow. `server/`, `shared/`, `client/src/api.ts`, `useAppData.ts` and `draftLogic.ts` stay unchanged against `main`.
- **Existing test files stay byte-identical.** Every new component gets a render test (`renderToStaticMarkup`, no jsdom).
- **Money** stays formatted by `formatCents`, with no maths in components. Tabular numbers are set on the body, so no amount can miss them.
- **Colours live only in `client/src/styles/tokens.css`.** `client/test/tokens.test.ts` checks the contrast of every pairing in both themes and pins the validated category palette.
- **Meaning never relies on colour alone:** every state has an icon or words.
- **Chat is mounted once.** CSS and state move it between panel, drawer and mobile view, so a resize never loses messages or open drafts.
- **Avatars are decorative.** Initials come from `data-initials` through CSS, so they stay out of the text of the sentence beside them.
- **Person rows:** #54 and #55 pin the exact `<li class="person …">`, so the avatar sits in an outer `<li class="person-row">` around `<ul role="none"><li class="person …">…</li></ul>`.
- **Theme:** a saved choice, otherwise `prefers-color-scheme`, following the system until the user toggles. A script in `index.html` sets `data-theme` before first paint.
- **Dependencies:** `lucide-react` only. No `motion`.
- **Checks use a scratch setup:** `STORE=json`, a scratch `DB_PATH`, an empty `GEMINI_API_KEY` and spare ports. Servers are stopped afterwards.

### Parts
- **A: Tokens, theme toggle, app shell, avatars, category icons.**
- **B: Summary card, person rows, expense and settlement cards, empty states, skeletons, toasts.**
- **C: Draft card and chat redesign, motion.**
- **D: Group cards, charts restyle, tablet and mobile layouts (desktop ≥1280, tablet 768–1279, mobile <768), dark theme polish.**

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
  2. Confirm it; the account summary should show Arun owes $38 and Mei owes $26.
  3. Ask "how much does Arun owe me?"; the answer should be $38.
  4. Smart settle up should list 2 transfers; record one and check the balances update.
  5. Charts should show Food & Drink.
  6. Restart the server and check the data is still there (JSON file).
  7. Type "Lunch $40 split with Aroon"; the draft should show the close-name warning, and "Use Arun" should fix it.
