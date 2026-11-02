# SplitBot: decisions log

## Decisions & trade-offs
- **Store data in a JSON file, not SQLite or Postgres.** For one user, the simplest storage is enough: no native modules and nothing to set up. Trade-off: no SQL queries, so summaries are computed in memory, and free hosts with ephemeral disks would lose the data. Writes are atomic (write a temp file, then rename) and go through a queue so concurrent writes can't corrupt the file.
- **Single user, no login.** People are just names, and the user is the built-in person `me`. This keeps 1.5 days focused on the agent and the money logic.
- **The LLM extracts; code calculates.** Gemini returns structured tool arguments, and `computeShares` and the balance and settle-up code do every calculation. Trade-off: the tool schemas are more detailed, but money totals can't be hallucinated and the logic is unit testable.
- **Integer cents with a deterministic leftover-cent rule.** This avoids floating-point drift. Shares always add up exactly to the total, and leftover cents go to whoever is listed first.
- **Drafts before writes.** The agent can never save directly; the user confirms every expense or settlement. Trade-off: one extra click per expense, in exchange for safety when the model gets something wrong.
- **5 tool calls per message.** This prevents runaway loops and protects the free-tier quota.
- **Guardrails warn, never block.** Amounts that aren't in the message and close-but-different names produce warnings on the draft rather than errors, so the user stays in control.
- **Chat history kept on the client.** The server is stateless apart from short-lived drafts, which keeps it simpler.
- **Local only.** Deploying to Render + Vercel is a stretch goal (Step 8).

## Where AI got it wrong
_(Log mistakes as they happen: what it did, how it was caught, and the fix.)_

## Re-prompts
- Planning: I asked for the timeline as numbered steps that each end in tests + a commit, a Step 0 for docs and workflow, an amount guardrail, and a close-name guardrail.
- Planning: I asked for Step 1 to be planned on its own, with its test list, before any code was written.

## Where AI sped me up / got in the way
- Sped me up: scaffolding, the plan structure, and enumerating split-engine edge cases.
- Got in the way: _(log as it happens)_

## How I checked quality
- Tests first for all domain logic (split, balances, settle-up, summary, guardrails).
- A seeded random check that shares always add up to the total.
- A mocked-Gemini test for the agent loop, plus an eval script against real Gemini.
- `/review-step` before each commit.
- A manual end-to-end check (see Verification in PLAN.md).

## What I'd do differently
_(Fill in at the end.)_
