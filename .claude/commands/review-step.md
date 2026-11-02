---
description: Review the current step's changes against CLAUDE.md (read-only, changes no code)
---

Review the changes for the current step of PLAN.md. **Do not edit, create or delete any files.** This is read-only.

1. Find the changes. Look at `git log --oneline -5`, then review `git diff HEAD` plus untracked files (`git status --porcelain`). If the working tree is clean, review the last step commit with `git show HEAD`.
2. Read CLAUDE.md and the matching step in PLAN.md.
3. Report under these headings:
   - **Scope**: does the change stay inside the current step? Point out anything that belongs to a later step.
   - **CLAUDE.md compliance**: check each rule and name any violation with `file:line`.
     - the LLM never does arithmetic
     - money is integer cents
     - writes go through drafts
     - the agent is bounded (5 tool calls)
     - tests were written first for domain logic
     - no tests were weakened to make them pass
     - no API key is printed or committed (also check for hard-coded keys and `.env` in git)
   - **Edge cases**: concrete inputs the code may get wrong, e.g. leftover cents, zero or negative amounts, empty lists, duplicate or unknown names, floating-point drift, very large amounts, ambiguous dates.
   - **Missing tests**: specific test cases to add, each with input → expected output.
   - **Other risks**: correctness or type-safety issues, if any.
4. End with a verdict: **Ready to commit** or **Fix first**, with a short list of what to fix.

$ARGUMENTS
