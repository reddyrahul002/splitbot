# SplitBot: decisions log

## Decisions & trade-offs
- **Store data in a JSON file, not SQLite or Postgres.** For one user, the simplest storage is enough: no native modules and nothing to set up. Trade-off: no SQL queries, so summaries are computed in memory, and free hosts with ephemeral disks would lose the data. Writes are atomic (write a temp file, then rename) and go through a queue so concurrent writes can't corrupt the file.
- **Single user, no login.** People are just names, and the user is the built-in person `me`. This keeps 1.5 days focused on the agent and the money logic.
- **The LLM extracts; code calculates.** Gemini returns structured tool arguments, and `computeShares` and the balance and settle-up code do every calculation. Trade-off: the tool schemas are more detailed, but money totals can't be hallucinated and the logic is unit testable.
- **Integer cents with a deterministic leftover-cent rule.** This avoids floating-point drift. Shares always add up exactly to the total, and leftover cents go to whoever is listed first.
- **Leftover cents go to the payer first (Step 1).** Ties in the largest-remainder split go to the payer if they're a participant, then in listed order. The participant order comes from the AI and can vary between phrasings, so listed-order alone gave different results for the same expense; the payer is stable. Trade-off: the engine now needs `paidBy`. 0% and exact 0 are allowed.
- **Split engine strictness (Step 1 review).** Percent tolerance (±0.01) is checked on the raw percentages, then allocation uses integer weights in millionths of a percent. Values for a different split type (e.g. `percent` on an `equal` split) are rejected with `SPLIT_VALUES_TYPE_MISMATCH` so the agent gets feedback instead of a silent 50/50; an empty map is treated as absent. Share counts allow at most 3 decimals. Every money error message is in dollars, including invalid inputs like `$1.005`.
- **Greedy settle-up, not true minimum (Step 2).** Settle-up matches the largest creditor with the largest debtor. It always clears every balance in at most n−1 transfers, but finding the true minimum number of transfers is NP-hard, and greedy can miss it in rare cases. For a small group the difference is at most a transfer or two, so the simple, predictable method wins. PLAN.md now calls it "greedy settle-up (at most n−1 transfers)" instead of "minimum-transfers".
- **Structured draft warnings (Step 2).** `Draft.warnings` changed from `string[]` to `{ code, message, suggestion? }[]`, so the DraftCard can show a "Use Arun" button without parsing text. `suggestion` is `{ name, person }`: the name that was typed and the existing person to use instead.
- **Amount check covers exact splits; zeros are skipped (Step 2).** Exact amounts are checked like the total, percentages and share counts. Values of 0 (exact 0, 0%) aren't checked, because "Mei owes nothing" usually has no number in it.
- **Close-name rules (Step 2).** The short-name threshold (≤1 instead of ≤2) uses the longer of the two names, so the check is symmetric. The prefix rule means one name starts with the other and the shorter one has at least 3 letters (Rob/Robert).
- **Summary input is strict (Step 2 review).** `from`, `to` and every expense date must be a real YYYY-MM-DD date, and every category must be in `CATEGORIES`; otherwise a `RangeError` is thrown. Month-only bounds like `2026-10` are rejected rather than guessed at, so the agent has to send full dates.
- **The user's own name counts as an exact match (Step 2 review).** `me` is never offered as a suggestion, but typing me's display name (e.g. "Rahul") doesn't produce a warning about someone similar.
- **One write path: drafts (Step 3).** PLAN.md had `POST /api/expenses` saving a manual expense directly. It was dropped. The manual form and Settle up's "Record" call `POST /api/drafts` and then confirm, so CLAUDE.md principle 3 holds without exceptions. Trade-off: two requests for a manual save.
- **Draft editing and settlement routes (Step 3).** Added `PATCH /api/drafts/:id` (edit + recompute without saving; the DraftCard needs it) and `GET`/`DELETE /api/settlements` (the History panel needs them). PATCH and confirm share `applyEdits`. PATCH restarts the 30-minute TTL, because editing means the user is still working on it.
- **Provisional `new:` ids for people who don't exist yet (Step 3).** In a draft, "Kai" is `new:kai` and `newPeople` is `Person[]`. On Confirm, each one becomes a real nanoid id, or an existing person with the same name if another confirm created them first; the id is swapped in the payer, shares, adjustments and split maps. Chosen over slug ids so stored ids don't depend on spelling. The finalize step runs inside the store's write queue, so two drafts that both add "Kai" end up with one Kai.
- **Edits and warnings (Step 3).** After an edit, `CLOSE_NAME` warnings stay only for new people still in the draft ("Use Arun" removes Aroon's). An amount edit clears `AMOUNT_NOT_IN_MESSAGE` warnings, because the user has now entered the amount themselves; other edits keep them.
- **Store details (Step 3).** The cache is updated only after the rename succeeds, so a failed write changes nothing, and the queue keeps going after a failure. A corrupt or wrong-shaped db.json makes startup fail rather than being overwritten. The seed name for `me` is "Me". REST money is integer cents (the client converts).
- **Drafts before writes.** The agent can never save directly; the user confirms every expense or settlement. Trade-off: one extra click per expense, in exchange for safety when the model gets something wrong.
- **5 tool calls per message.** This prevents runaway loops and protects the free-tier quota.
- **Guardrails warn, never block.** Amounts that aren't in the message and close-but-different names produce warnings on the draft rather than errors, so the user stays in control.
- **Chat history kept on the client.** The server is stateless apart from short-lived drafts, which keeps it simpler.
- **Local only.** Deploying to Render + Vercel is a stretch goal (Step 8).

## Where AI got it wrong
_(Log mistakes as they happen: what it did, how it was caught, and the fix.)_
- Step 3: the dotenv setup (`import 'dotenv/config'`) read `.env` from the folder the server started in. `npm run dev` starts it in `server/`, so it read `server/.env` and `PORT` and `DB_PATH` from the root `.env` were silently ignored (the Gemini key would have been too, in Step 4). Found when I asked where `.env` is loaded from. Fix: `server/src/config.ts` loads `<repo root>/.env` with `quiet: true`, whatever the start folder, and a relative `DB_PATH` now resolves from the repo root. A startup line says whether the file was found and whether `GEMINI_API_KEY` is set, without printing values. `test/config.test.ts` covers the path, loading, and a missing file.
- Step 2 planning: the AI recommended that the shorter of the two names sets the short-name threshold, and I approved it. While writing the tests, the AI noticed this breaks the plan's own headline case: "Aroon" vs "Arun" (distance 2, shorter name 4 letters → ≤1) would give no warning. Fix: the longer name sets the threshold. The recommendation should have been checked against the plan's examples before it was offered.
- Step 2: typecheck failed on `structuredClone` in a new settle test, and the AI swapped it for a hand-written copy instead of asking why it failed. The real cause was that the server had no Node types (`@types/node`), which Step 3 needs anyway for `fs`. Caught by me. Fix: added `@types/node` and `"types": ["node"]` to the server tsconfig, and restored `structuredClone`.
- Step 2: I asked for every code change to go through the file edit tool, but the AI wrote the throwaway "not implemented" stubs with a shell heredoc. It owned up to this in its summary. The stubs were replaced with Write, but the instruction was still broken.
- Step 2 `/review-step`: all 120 tests passed, but the review's probe showed that `spendingSummary` looped forever on a malformed expense date (`2026-1-05`), and that month-only bounds (`to: '2026-10'`) silently dropped data. The tests had only used valid dates. Fix: dates are validated as real YYYY-MM-DD dates (tests #67, #68).
- Step 1 `/review-step`: the review listed "INVALID_TOTAL message is in cents" as an edge case but still gave the verdict "nothing breaks a CLAUDE.md rule or a planned test" and "Ready to commit". That contradicts the plan's rule that error messages are in dollars. Caught by me reading the review. Fix: the message is now in dollars (test #36), and reviews must call any plan or CLAUDE.md deviation a violation with a **Fix first** verdict.

## Re-prompts
- Planning: I asked for the timeline as numbered steps that each end in tests + a commit, a Step 0 for docs and workflow, an amount guardrail, and a close-name guardrail.
- Planning: I asked for Step 1 to be planned on its own, with its test list, before any code was written.
- Step 1: after reviewing the test list I changed the leftover-cent rule to payer-first (tests #4, #7, #19, #22 updated, #32 added) and settled the open points (allow 0% and exact 0).
- Step 1: after `/review-step` I asked for all its follow-ups before committing (hasOwn, -0, formatCents input check, dollar messages, raw percent tolerance, type-mismatch error, 3-decimal shares, the missing tests), tests first, and for stricter reviews.
- Step 2: I asked for a plan and test list only, before any code. After review I chose: include exact amounts in the amount check, the prefix and short-name rules, structured warnings now, and keep greedy settle-up but rename it and log the trade-off.
- Step 2: when the "shorter name" threshold turned out to break the Aroon/Arun case, I switched it to the longer name.
- Step 2: I signed off on three rules the AI added (zero values not checked, `suggestion: { name, person }`, `extractNumbers` returning raw numbers). I asked for `@types/node` in place of the `structuredClone` workaround, and for `split.test.ts` to use the shared PRNG in `helpers.ts` without changing assertions.
- Step 3: I asked for a plan and test list only. From the AI's questions I chose `POST /api/drafts`, dropping `POST /api/expenses` for the draft flow, and provisional `new:` ids. Reviewing the plan, I also asked for `PATCH /api/drafts/:id` and `GET`/`DELETE /api/settlements` (with tests) instead of leaving them as open points for Steps 5 and 6, and said not to commit: I run `/review-step` and commit myself.
- Step 2: after `/review-step` I asked for all of its fixes, tests first: date validation, ignoring empty names, a clear error for an unknown category, an exact match on me's display name, dollar error messages in settle-up, the "7:30pm" amount test, and these log and plan updates.

## Where AI sped me up / got in the way
- Sped me up: scaffolding, the plan structure, and enumerating split-engine edge cases.
- Got in the way: _(log as it happens)_

## How I checked quality
- Tests first for all domain logic (split, balances, settle-up, summary, guardrails).
- A seeded random check that shares always add up to the total.
- A mocked-Gemini test for the agent loop, plus an eval script against real Gemini.
- `/review-step` before each commit.
- A manual end-to-end check (see Verification in PLAN.md).
- The /review-step probe found an infinite loop on malformed dates even though all 120 tests passed. I added date validation and a regression test.
- Mutation testing in Step 3 confirmed the tests catch broken confirm/restore, atomic writes and new-person id replacement. Known gap: a crash mid-write isn't tested because it needs killing the process mid-write; accepted for this build.


## What I'd do differently
_(Fill in at the end.)_
