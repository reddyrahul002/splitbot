
❯ /clear

❯ <ide_opened_file>The user opened the file
  /Users/jarvis/Projects/splitbot/docs/ai-sessions/step-2-domain.md in the IDE.
  This may or may not be related to the current task.</ide_opened_file>

❯ ead CLAUDE.md and PLAN.md. Plan Step 3 only (JSON store, drafts, REST API
  without /api/chat). List the test cases grouped by area before writing code.
  Don't write code yet.

  Read 1 file (ctrl+o to expand)

⏺ Bash(git ls-files && cat DECISIONS.md && cat package.json server/package.json)
  ⎿  (No output)

  Searched for 1 pattern (ctrl+o to expand)

⏺ Bash(sed -n 1,60p server/src/domain/summary.ts && sed -n 1,20p
      server/src/domain/guardrails.ts && sed -n 70,120p
      server/src/domain/guardrails.ts && sed -n 1,45p serv…)
  ⎿  (No output)

⏺ I've read both files and the current code. Before I write the plan, a few
  decisions are yours to make, because PLAN.md's route list leaves gaps that
  later steps depend on.

⏺ User answered Claude's questions:
  ⎿  · PLAN.md's REST list has no route to create a draft or change one, and no
     way to list or delete settlements. Later steps need them: the DraftCard
     recomputes shares when a field is edited (Step 5), Settle up's 'Record'
     creates a settlement draft (Step 6), and History deletes settlements (Step
     6). Which of these routes should Step 3 add? → POST /api/drafts
     · The manual fallback POST /api/expenses saves straight away (PLAN.md), but
     CLAUDE.md says every write goes through a draft. Which should it be? →
     Drop it, use drafts (Recommended)
     · Drafts can include people who don't exist yet, and they're only created
     on Confirm. What ids should those people have while the expense is still a
     draft? → Provisional 'new:' ids (Recommended)

⏺ Updated plan
  ⎿  /plan to preview
  ⎿  Error: The user doesn't want to proceed with this tool use. The tool use
     was rejected (eg. if it was a file edit, the new_string was NOT written to
     the file). The user provided the following reason for the rejection:  Two
     changes before I approve:
     1. Add PATCH /api/drafts/:id (apply edits, recompute shares, return the
     updated draft without saving; invalid edits leave the draft unchanged) and
     GET /api/settlements plus DELETE /api/settlements/:id (newest first; delete
     → 204, balances update; unknown id → 404). Reuse applyEdits for both PATCH
     and confirm. Add tests for them in the API section and remove the Step 5/6
     open points.
     2. Don't commit at the end. Stop for my review after npm test, typecheck
     and the manual curl smoke check pass. I'll run /review-step and commit
     myself.
     Everything else is approved.

⏺ Updated plan
  ⎿  /plan to preview

⏺ Updated plan
  ⎿  /plan to preview

⏺ Updated plan
  ⎿  /plan to preview

⏺ Updated plan
  ⎿  /plan to preview

⏺ Updated plan
  ⎿  /plan to preview

⏺ Updated plan
  ⎿  /plan to preview

⏺ User approved Claude's plan
  ⎿  Plan saved to: ~/.claude/plans/ead-claude-md-and-plan-md-spicy-key.md ·
     /plan to edit
     Step 3 plan: JSON store, drafts, REST API (no /api/chat)

     Context

     Steps 1–2 built the pure domain modules (split, balances, settle, summary,
     guardrails). Step 3 adds persistence (data/db.json), the in-memory draft
     store, and the Express REST API. /api/chat and Gemini are not part of this
     step (they come in Step 4). Step 4's create_expense_draft tool will call
     the same draft builder that POST /api/drafts uses here, so Step 3 builds
     the whole write path: draft → (optional edits) → confirm → store.

     Decisions already made (from the questions above):
     - Add POST /api/drafts. It creates an expense or settlement draft from
       name-based input.
     - Remove POST /api/expenses. The manual form (Step 7) and Settle up's
       "Record" (Step 6) use POST /api/drafts followed by confirm, so every
       write goes through a draft (CLAUDE.md principle 3).
     - Provisional new: ids. In a draft, an unknown name such as "Kai" gets the
       id new:kai. Draft.newPeople changes from string[] to Person[]. On
       Confirm, each new: id becomes a real nanoid, or an existing person if one
       with the same name exists by then. The id is swapped everywhere it
       appears.
     - Add PATCH /api/drafts/:id. It applies edits, recomputes the shares and
       returns the updated draft without saving anything. The DraftCard (Step 5)
       uses it. PATCH and confirm both use the same applyEdits.
     - Add GET /api/settlements and DELETE /api/settlements/:id, for the History
       panel (Step 6).
     - No commit in this step. Stop after the tests, the typecheck and the curl
       smoke check pass. The user runs /review-step and commits.

     Files

     File: shared/src/types.ts
     Contents: newPeople: Person[]. New types: ExpenseDraftInput and
     SettlementDraftInput (name-based, cents), DraftEdits, ConfirmResult,
     ApiError
      { error: { code, message } }
     ────────────────────────────────────────
     File: server/src/store.ts
     Contents: openStore(path, { fs? }): in-memory cache, snapshot() (deep
     copy),
     update(fn) (serialized queue; applies fn to a copy, writes tmp, renames,
     and
     updates the cache only after the rename succeeds). Missing file → seed {
     version: 1, people: [{ id: 'me', name: 'Me' }], expenses: [], settlements:
     []
      }. Corrupt or wrong-shaped file → throws (zod) and is never overwritten.
     Default path server/data/db.json, overridable with DB_PATH
     ────────────────────────────────────────
     File: server/src/drafts.ts
     Contents: createDraftStore({ ttlMs = 30 min, now }): put / get / replace /
     take
     / restore / delete. Expiry is checked lazily, with a sweep on put, so there

     are no timers or open handles. Pure builders: buildExpenseDraft(input,
     people, { today, message? }), buildSettlementDraft(...), applyEdits(draft,
     edits, people), finalizeDraft(draft, people, newId) → { record,
     createdPeople
      }
     ────────────────────────────────────────
     File: server/src/app.ts
     Contents: createApp({ store, drafts, today }): routes, zod body validation,

     JSON error handler. Separate from index.ts so supertest doesn't have to
     listen on a port (small change to the PLAN layout)
     ────────────────────────────────────────
     File: server/src/index.ts
     Contents: dotenv, CORS (localhost dev origin), opens the store,
     listen(PORT).
     Doesn't read or log GEMINI_API_KEY
     ────────────────────────────────────────
     File: server/src/domain/guardrails.ts
     Contents: export the existing normalize as normalizeName, so drafts resolve

     names exactly the way the close-name check does (no logic change)
     ────────────────────────────────────────
     File: server/src/domain/summary.ts
     Contents: export the existing date check as isIsoDate / assertDate, reused
     for
     draft dates (no logic change)
     ────────────────────────────────────────
     File: server/test/{store,drafts,api}.test.ts
     Contents: written first; confirmed to fail before the implementation exists
     ────────────────────────────────────────
     File: server/package.json, root package.json
     Contents: deps: express, cors, dotenv, zod, nanoid; dev: supertest,
     @types/express, @types/cors, @types/supertest. dev script: tsx watch
     src/index.ts; root dev → npm run dev -w server until Step 5 adds the client
     ────────────────────────────────────────
     File: PLAN.md, DECISIONS.md
     Contents: add a Step 3 detail section, update the REST API list, and log
     the
     decisions above

     REST API (Step 3)

     All money is integer cents. Errors are { error: { code, message } }, with
     no stack traces.
     - GET /api/people → Person[]
     - POST /api/drafts with { kind: 'expense', ...ExpenseDraftInput } | { kind:
       'settlement', ...SettlementDraftInput } → 201 Draft. Saves nothing.
     - PATCH /api/drafts/:id with DraftEdits → 200 updated Draft (nothing saved;
       invalid edits → 400 and the draft is unchanged)
     - POST /api/drafts/:id/confirm with optional DraftEdits → 200
       ConfirmResult. DELETE /api/drafts/:id → 204.
     - GET /api/expenses (newest first: date desc, then createdAt desc), DELETE
       /api/expenses/:id → 204
     - GET /api/settlements (newest first: date desc, then most recently stored
       first), DELETE /api/settlements/:id → 204
     - GET /api/balances → { balances: Balance[], debts: Transfer[] }
     - GET /api/settlements/suggest → Transfer[]
     - GET /api/summary?from&to → SpendingSummary

     Status codes: zod failure → 400 VALIDATION_ERROR; SplitError → 400 with its
     code; RangeError from summary → 400 INVALID_DATE; SAME_PERSON,
     UNKNOWN_PERSON, INVALID_AMOUNT → 400; missing or expired draft → 404
     DRAFT_NOT_FOUND; missing expense → 404 NOT_FOUND; store write failure → 500
     INTERNAL with a generic message.

     Rules

     - Name resolution: the literal me or me's display name → me. Otherwise the
       name is normalized (normalizeName) and an exact match on an existing
       person uses that person. Any other name → new:<normalized>, with the
       typed (trimmed) name kept in newPeople. Names inside adjustments and the
       exact/percent/shares maps are resolved the same way.
     - Warnings: checkNames always runs. checkAmounts runs only when message is
       given (Step 4 passes it, REST doesn't).
     - Defaults: date defaults to today(), which is injected. category is
       required and must be in CATEGORIES.
     - Edits at confirm (description, category, date, totalCents, paidBy, cents
       for settlements, replace: { from, to }[] for "Use Arun"): applied first.
       Shares are then recomputed with computeShares, using the participants in
       their current order and the stored splitMeta. If anything fails, the
       draft is left unchanged and can still be confirmed.
     - PATCH stores the edited draft in place of the old one (same id) and
       restarts its TTL. Edits stack, so each PATCH applies to the latest
       version. After an edit, CLOSE_NAME warnings are recomputed for the new
       people that remain. AMOUNT_NOT_IN_MESSAGE warnings are cleared once the
       user edits an amount (totalCents or cents), because the user has now
       entered the amount themselves.
     - Confirm is all-or-nothing: take removes the draft before the write. If
       the write fails, restore puts it back. A second confirm of the same draft
       running at the same time gets a 404.
     - People are never deleted. Deleting an expense keeps its people.

     Test cases (written first)

     store
     1. Missing file → opens with only me, writes the seed file, and creates the
        parent directory
     2. Round trip: add a person, an expense and a settlement; reopen the same
        path → deep-equal
     3. snapshot() is a copy: mutating it doesn't change the store
     4. Corrupt JSON → open rejects with a message naming the path, and the file
        is unchanged
     5. Valid JSON with the wrong shape (e.g. no expenses array) → rejects
     6. File without me → me is added on load
     7. Atomic write: an injected rename failure → update rejects, the file on
        disk keeps its old content, the cache is unchanged, and no .tmp file is
        left
     8. After a failed write, the next update succeeds (the queue isn't stuck)
     9. An update fn that throws → rejects, nothing is written, and the queue
        continues
     10. 50 concurrent updates → all 50 are applied in call order, and the
         reopened file has all 50

     draft store
     11. put/get round trip; ids are unique
     12. Fake clock: found at TTL − 1 ms, gone at TTL
     13. take removes the draft; a second take → undefined; restore brings it
     back
     14. Expired drafts are swept on put

     draft builder
     15. Dinner: 9000, me/Arun/Mei (all existing), Arun +1200 → 2600/3800/2600,
     no newPeople, no warnings
     16. " arun ", "ARUN", NFC-different "José" → the existing ids; "me" and
     me's display name → me
     17. Unknown "Kai" → new:kai in paidBy and the shares, and newPeople: [{ id:
     'new:kai', name: 'Kai' }]
     18. "Kai" and "kai" in one expense → DUPLICATE_PARTICIPANT
     19. Name-keyed adjustments and exact/percent/shares maps → id-keyed
     splitMeta
     20. "Aroon" with Arun existing → Aroon in newPeople plus a CLOSE_NAME
     warning suggesting Arun
     21. message "$90" with a $95 total → AMOUNT_NOT_IN_MESSAGE; no message → no
     amount warnings
     22. Date defaults to the injected today; 2026-02-30 → INVALID_DATE
     23. A SplitError (an exact sum mismatch) is passed through with its code
     and dollar message
     24. Settlement "Arun" → "me" 2000 → from arun to me; from = to →
     SAME_PERSON; cents 0, negative or non-integer → INVALID_AMOUNT; a new name
     → newPeople plus a close-name warning
     25. A name like "constructor" is just a new person (no prototype problems)

     edits and finalize
     26. Finalize replaces every new: id (paidBy, shares, adjustments, the
     exact/percent/shares keys) with a real id; no new: ids are left in the
     stored data
     27. A person with the same name created by an earlier confirm → reused, not
     duplicated
     28. A totalCents edit recomputes shares with the same splitMeta;
     description, category and date edits are applied; a paidBy edit moves the
     leftover cent
     29. "Use Arun" (replace new:aroon → arun) → Aroon removed from newPeople,
     not created, and the shares are keyed to arun
     30. Replacing with someone who is already a participant →
     DUPLICATE_PARTICIPANT; a target not in the store → UNKNOWN_PERSON; a from
     not in the draft → UNKNOWN_PERSON
     31. A total edit on an exact split → EXACT_SUM_MISMATCH; the draft is
     unchanged

     API (supertest, temp-dir store)
     32. GET /api/people → [me]
     33. POST /api/drafts (expense) → 201 Draft; GET /api/expenses is still []
     and the db file is unchanged
     34. Bad body (missing totalCents, non-integer cents, unknown category,
     unknown kind), or malformed JSON → 400 VALIDATION_ERROR
     35. A split error → 400 with its code and dollar message
     36. Confirm → 200; the expense appears in GET /api/expenses, the new people
     appear in GET /api/people, and confirming again → 404 DRAFT_NOT_FOUND
     37. Confirm with edits → saved with the recomputed shares
     38. Confirm with invalid edits → 400; the same draft can still be confirmed
     afterwards
     39. Unknown or expired draft (fake clock) → 404
     40. DELETE /api/drafts/:id → 204, then confirm → 404; deleting an unknown
     draft → 404
     41. Two concurrent confirms of one draft → one 200 and one 404; one expense
     stored
     42. Settlement draft + confirm → GET /api/balances reflects it
     43. Dinner confirmed → balances me +6400 / Arun −3800 / Mei −2600; debts
     Arun→me 3800, Mei→me 2600
     44. GET /api/settlements/suggest → the same two transfers
     45. GET /api/summary → Food & Drink; from/to filter; a bad date or from >
     to → 400 INVALID_DATE
     46. GET /api/expenses is newest first
     47. DELETE /api/expenses/:id → 204 and the balances update; an unknown id →
     404
     48. Restart: a new app on the same file still has the data
     49. A store write failure during confirm → 500 INTERNAL, with no stack in
     the body; the draft still exists and a retry succeeds
     50. Unknown /api/* route → 404 JSON

     PATCH /api/drafts/:id
     51. A totalCents edit → 200 with the recomputed shares; nothing is written
     to the store; GET routes are unchanged
     52. "Use Arun" via PATCH → Aroon is gone from newPeople and its CLOSE_NAME
     warning is removed; confirming afterwards saves with arun and creates no
     Aroon
     53. Edits stack: PATCH the description, then PATCH the total → both are
     kept, and confirming with no body saves both
     54. Invalid edits (an exact-split total mismatch, an unknown replace
     target, a bad body) → 400, and a follow-up confirm saves the original draft
     unchanged
     55. PATCH of an unknown or expired draft → 404 DRAFT_NOT_FOUND
     56. PATCH restarts the TTL: with a fake clock, a draft PATCHed at TTL − 1
     min can still be confirmed after the original TTL
     57. An amount edit clears AMOUNT_NOT_IN_MESSAGE warnings (draft built with
     a message; a builder-level test, since REST drafts have no message)

     settlements
     58. GET /api/settlements → confirmed settlements, newest first
     59. DELETE /api/settlements/:id → 204, then GET /api/balances no longer
     counts it
     60. DELETE /api/settlements/:id with an unknown id → 404 NOT_FOUND

     Done when

     1. Tests are written first and confirmed to fail.
     2. The code is implemented.
     3. npm test and npm run typecheck pass.
     4. A manual curl smoke check passes: npm run dev -w server, create a draft,
        PATCH it, confirm it, get balances, list and delete a settlement, then
        restart the server and check the data is still there.
     5. PLAN.md and DECISIONS.md are updated.
     6. No commit. Stop for the user's review. The user runs /review-step and
        commits.

⏺ The plan is approved, so I'm starting on Step 3. Tests come first. To begin
  I'll install the dependencies and update the shared types.

⏺ Bash(npm install -w server express cors dotenv zod nanoid 2>&1 | tail -3 &&
      npm install -w server -D supertest @types/express @types/cors
      @types/supertest 2>&1 | tai…)
  ⎿  (No output)
  ⎿  (timeout 5m)

⏺ Update(shared/src/types.ts)
  ⎿  Added 60 lines, removed 2 lines
       90    suggestion?: { name: string; person: Person };
       91  }
       92  
       93 +/** Prefix of the provisional ids that people who don't exist 
          +yet get inside a draft, e.g. `new:kai`. */                    
       94 +export const NEW_PERSON_PREFIX = 'new:';                      
       95 +                                                              
       96  interface DraftBase {
       97    id: string;
       95 -  /** Names that don't exist yet; created only on Confirm. */ 
       96 -  newPeople: string[];                                        
       98 +  /** People who don't exist yet, with provisional `new:` ids;
          + created only on Confirm. */                                  
       99 +  newPeople: Person[];                                        
      100    warnings: DraftWarning[];
      101  }
      102  
     ...
      104    | (DraftBase & { kind: 'expense'; expense: Expense })
      105    | (DraftBase & { kind: 'settlement'; settlement: Settlement 
           });
      106  
      107 +/** Expense draft request. People are given by name ("me" is t
          +he user); money is integer cents. */                          
      108 +export interface ExpenseDraftInput {                          
      109 +  description: string;                                        
      110 +  category: Category;                                         
      111 +  /** YYYY-MM-DD; defaults to today. */                       
      112 +  date?: string;                                              
      113 +  totalCents: number;                                         
      114 +  paidBy: string;                                             
      115 +  participants: string[];                                     
      116 +  splitType: SplitType;                                       
      117 +  adjustments?: { person: string; cents: number; note?: string
          + }[];                                                         
      118 +  exact?: Record<string, number>;                             
      119 +  percent?: Record<string, number>;                           
      120 +  shares?: Record<string, number>;                            
      121 +}                                                             
      122 +                                                              
      123 +/** Settlement draft request: `from` paid `to`. */            
      124 +export interface SettlementDraftInput {                       
      125 +  from: string;                                               
      126 +  to: string;                                                 
      127 +  cents: number;                                              
      128 +  /** YYYY-MM-DD; defaults to today. */                       
      129 +  date?: string;                                              
      130 +}                                                             
      131 +                                                              
      132 +export type DraftRequest = ({ kind: 'expense' } & ExpenseDraft
          +Input) | ({ kind: 'settlement' } & SettlementDraftInput);     
      133 +                                                              
      134 +/** Edits to a draft. Ids refer to people in the draft (includ
          +ing `new:` ids) or existing people. */                        
      135 +export interface DraftEdits {                                 
      136 +  description?: string;                                       
      137 +  category?: Category;                                        
      138 +  date?: string;                                              
      139 +  /** Expense only. */                                        
      140 +  totalCents?: number;                                        
      141 +  /** Expense only. */                                        
      142 +  paidBy?: PersonId;                                          
      143 +  /** Settlement only. */                                     
      144 +  cents?: number;                                             
      145 +  /** "Use Arun": swap a person in the draft for an existing p
          +erson. */                                                     
      146 +  replace?: { from: PersonId; to: PersonId }[];               
      147 +}                                                             
      148 +                                                              
      149 +export type ConfirmResult =                                   
      150 +  | { kind: 'expense'; expense: Expense; createdPeople: Person
          +[] }                                                          
      151 +  | { kind: 'settlement'; settlement: Settlement; createdPeopl
          +e: Person[] };                                                
      152 +                                                              
      153 +export interface BalancesResponse {                           
      154 +  balances: Balance[];                                        
      155 +  debts: Transfer[];                                          
      156 +}                                                             
      157 +                                                              
      158 +export interface ApiError {                                   
      159 +  error: { code: string; message: string };                   
      160 +}                                                             
      161 +                                                              
      162  /** Net position: positive means the person is owed money, neg
           ative means they owe. */
      163  export interface Balance {
      164    personId: PersonId;
⏺ Bash(cat shared/src/index.ts && grep -n "normalize("
      server/src/domain/guardrails.ts && sed -n 55,90p
      server/src/domain/summary.ts && grep -rn "newPeople" server sha…)
  ⎿  No matches found

⏺ I'm making the code changes with the file edit tool, not shell commands, as
  you asked in Step 2.

  Read 2 files (ctrl+o to expand)

⏺ Update(server/src/domain/guardrails.ts)
  ⎿  Added 2 lines, removed 2 lines
      53  
      54  /** Edit distance on normalized names (trimmed, lowercase, NFC)
          , counted in code points. */
      55  export function levenshtein(a: string, b: string): number {
      56 -  const s = [...normalize(a)];                                 
      57 -  const t = [...normalize(b)];                                 
      56 +  const s = [...normalizeName(a)];                             
      57 +  const t = [...normalizeName(b)];                             
      58    let prev = Array.from({ length: t.length + 1 }, (_, j) => j);
      59    for (let i = 1; i <= s.length; i++) {
      60      const row = [i];

⏺ Update(server/src/domain/guardrails.ts)
  ⎿  Added 2 lines, removed 2 lines
      73   * `me` is never suggested, but typing me's own name counts as 
          an exact match.
      74   */
      75  export function findCloseName(name: string, people: Person[]): 
          Person | null {
      76 -  const n = normalize(name);                                   
      76 +  const n = normalizeName(name);                               
      77    if (n === '' || n === ME_ID) return null;
      78    if (people.some((p) => normalize(p.name) === n)) return null;
      79    const others = people.filter((p) => p.id !== ME_ID);
      80  
      81    let best: { person: Person; distance: number } | null = null;
      82    for (const person of others) {
      83 -    const q = normalize(person.name);                          
      83 +    const q = normalizeName(person.name);                      
      84      const distance = levenshtein(n, q);
      85      const [short, long] = [...n].length <= [...q].length ? [n, 
          q] : [q, n];
      86      const threshold = [...long].length <= 4 ? 1 : 2;

⏺ Update(server/src/domain/guardrails.ts)
  ⎿  Added 1 line, removed 1 line
      75  export function findCloseName(name: string, people: Person[]): 
          Person | null {
      76    const n = normalizeName(name);
      77    if (n === '' || n === ME_ID) return null;
      78 -  if (people.some((p) => normalize(p.name) === n)) return null;
      78 +  if (people.some((p) => normalizeName(p.name) === n)) return n
         +ull;                                                           
      79    const others = people.filter((p) => p.id !== ME_ID);
      80  
      81    let best: { person: Person; distance: number } | null = null;

⏺ Update(server/src/domain/guardrails.ts)
  ⎿  Added 2 lines, removed 2 lines
       96    const warnings: DraftWarning[] = [];
       97    for (const raw of [names.paidBy, ...names.participants]) {
       98      const typed = raw.trim();
       99 -    if (typed === '' || seen.has(normalize(typed))) continue; 
      100 -    seen.add(normalize(typed));                               
       99 +    if (typed === '' || seen.has(normalizeName(typed))) contin
          +ue;                                                           
      100 +    seen.add(normalizeName(typed));                           
      101      const person = findCloseName(typed, people);
      102      if (person) {
      103        warnings.push({

⏺ Update(server/src/domain/guardrails.ts)
  ⎿  Added 2 lines, removed 1 line
      110    return warnings;
      111  }
      112  
      113 -function normalize(name: string): string {                    
      113 +/** How names are compared everywhere: NFC, trimmed, lowercase
          +. */                                                          
      114 +export function normalizeName(name: string): string {         
      115    return name.normalize('NFC').trim().toLowerCase();
      116  }

⏺ Update(server/src/domain/summary.ts)
  ⎿  Added 1 line, removed 1 line
      53  }
      54  
      55  /** Throws unless `date` is a real calendar date written YYYY-M
          M-DD. */
      56 -function assertDate(date: string, what: string): void {        
      56 +export function assertDate(date: string, what: string): void { 
      57    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
      58    const [y, mo, d] = m ? [Number(m[1]), Number(m[2]), Number(m[
          3])] : [0, 0, 0];
      59    const parsed = new Date(Date.UTC(y, mo - 1, d));

⏺ Next I'm writing the tests, starting with the store.

⏺ Bash(cat server/src/domain/money.ts && sed -n 21,52p
      server/src/domain/guardrails.ts && grep -n
      "DUPLICATE_PARTICIPANT\|INVALID_TOTAL'" server/src/domain/split.ts |…)
  ⎿  (No output)

⏺ Update(server/test/helpers.ts)
  ⎿  Added 10 lines, removed 1 line
       1 -// Test builders and a seeded PRNG shared by the domain tests. 
       1 +// Test builders, a seeded PRNG and temp directories shared by 
         +the tests.                                                     
       2 +import { mkdtemp, rm } from 'node:fs/promises';                
       3 +import { tmpdir } from 'node:os';                              
       4 +import { join } from 'node:path';                              
       5  import type { Category, Expense, PersonId, Settlement } from '@
          splitbot/shared';
       6  
       7 +/** A fresh temp directory; call the returned cleanup in afterE
         +ach. */                                                        
       8 +export async function tempDir(): Promise<{ dir: string; cleanup
         +: () => Promise<void> }> {                                     
       9 +  const dir = await mkdtemp(join(tmpdir(), 'splitbot-'));      
      10 +  return { dir, cleanup: () => rm(dir, { recursive: true, force
         +: true }) };                                                   
      11 +}                                                              
      12 +                                                               
      13  let nextId = 1;
      14  
      15  /** An expense with explicit shares; only the fields a test car
          es about need to be given. */

⏺ Write(server/test/store.test.ts)
  ⎿  Wrote 138 lines to server/test/store.test.ts
      1 import { mkdir, readdir, readFile, rename, writeFile } from 'node
        :fs/promises';
      2 import { join } from 'node:path';
      3 import { afterEach, beforeEach, describe, expect, it } from 'vite
        st';
      4 import { openStore, type Db } from '../src/store';
      5 import { expense, settlement, tempDir } from './helpers';
      6
      7 let dir: string;
      8 let cleanup: () => Promise<void>;
     … +130 lines (ctrl+o to expand)

⏺ Update(server/test/store.test.ts)
  ⎿  Added 3 lines, removed 2 lines
      86    });
      87  
      88    it('#8 after a failed write the next update succeeds', async 
          () => {
      89 +    await openStore(dbPath); // seed the file, so opening below
         + doesn't write                                                 
      90      let failRename = true;
      91      const store = await openStore(dbPath, {
      92        fs: {
     ...
       99          },
      100        },
      101      });
      101 -    // The seed write consumed the first failure? No: the seed
          - write must succeed for open to work.                         
      102 -    await store.update((db) => db.people.push({ id: 'arun', na
          -me: 'Arun' })).catch(() => undefined);                        
      102 +    await expect(store.update((db) => db.people.push({ id: 'ar
          +un', name: 'Arun' }))).rejects.toThrow('disk full');          
      103      await store.update((db) => db.people.push({ id: 'mei', nam
           e: 'Mei' }));
      104 +    expect(store.snapshot().people.map((p) => p.id)).toEqual([
          +'me', 'mei']);                                                
      105      expect(store.snapshot().people.map((p) => p.id)).toContain
           ('mei');
      106      expect((await readDb()).people.map((p) => p.id)).toContain
           ('mei');
      107    });

⏺ Update(server/test/store.test.ts)
  ⎿  Added 1 line, removed 2 lines
      102      await expect(store.update((db) => db.people.push({ id: 'ar
           un', name: 'Arun' }))).rejects.toThrow('disk full');
      103      await store.update((db) => db.people.push({ id: 'mei', nam
           e: 'Mei' }));
      104      expect(store.snapshot().people.map((p) => p.id)).toEqual([
           'me', 'mei']);
      105 -    expect(store.snapshot().people.map((p) => p.id)).toContain
          -('mei');                                                      
      106 -    expect((await readDb()).people.map((p) => p.id)).toContain
          -('mei');                                                      
      105 +    expect((await readDb()).people.map((p) => p.id)).toEqual([
          +'me', 'mei']);                                                
      106    });
      107  
      108    it('#9 an update fn that throws → rejects, nothing written, 
           queue continues', async () => {

⏺ Now the drafts tests (#11–#31 and #57):

⏺ Write(server/test/drafts.test.ts)
  ⎿  Wrote 362 lines to server/test/drafts.test.ts
       1 import { describe, expect, it } from 'vitest';
       2 import type { Draft, ExpenseDraftInput, Person } from '@splitbot
         /shared';
       3 import {
       4   applyEdits,
       5   buildExpenseDraft,
       6   buildSettlementDraft,
       7   createDraftStore,
       8   DraftError,
       9   finalizeDraft,
     … +353 lines (ctrl+o to expand)

⏺ Update(server/test/drafts.test.ts)
  ⎿  Added 1 line, removed 1 line
      122  
      123    it('#16 names resolve trimmed, case-insensitive and NFC; "me
           " and me\'s name → me', () => {
      124      const d = buildExpenseDraft(
      125 -      { ...DINNER, adjustments: undefined, paidBy: 'Rahul', pa
          -rticipants: ['me', ' arun ', 'ARUN '.slice(0, 0) + 'MEI', 'Jos
          -é'] },                                                        
      125 +      { ...DINNER, adjustments: undefined, paidBy: 'Rahul', pa
          +rticipants: ['me', ' arun ', 'MEI', 'José'] },                
      126        PEOPLE,
      127        OPTS,
      128      );

⏺ Now the API tests (#32–#56 and #58–#60):

⏺ Write(server/test/api.test.ts)
  ⎿  Wrote 427 lines to server/test/api.test.ts
      1 import { readFile, rename } from 'node:fs/promises';
      2 import { join } from 'node:path';
      3 import request from 'supertest';
      4 import { afterEach, beforeEach, describe, expect, it } from 'vite
        st';
      5 import type { Draft, Expense, ExpenseDraftInput } from '@splitbot
        /shared';
      6 import { createApp } from '../src/app';
      7 import { createDraftStore } from '../src/drafts';
      8 import { openStore } from '../src/store';
     … +419 lines (ctrl+o to expand)

⏺ The tests are written. Next I'll confirm they fail before any implementation
  exists:

⏺ Bash(npm test 2>&1 | grep -E "FAIL|Error:|Test Files|Tests " | head -20)
  ⎿  (No output)

⏺ All three new test files fail because their modules don't exist yet. The
  existing 127 tests still pass after the normalizeName and assertDate exports.
  Next I'm implementing the store:

⏺ Write(server/src/store.ts)  ⎿  Wrote 120 lines to server/src/store.ts
       1 // JSON file store (data/db.json): an in-memory cache, atomic wr
         ites (tmp file + rename) and a serialized write queue.
       2 import * as nodeFs from 'node:fs/promises';
       3 import { dirname } from 'node:path';
       4 import { z } from 'zod';
       5 import { CATEGORIES, ME_ID, SPLIT_TYPES, type Expense, type Pers
         on, type Settlement } from '@splitbot/shared';
       6
       7 export interface Db {
       8   version: 1;
     … +112 lines (ctrl+o to expand)

⏺ Next, drafts.ts:

⏺ Write(server/src/drafts.ts)
  ⎿  Wrote 339 lines to server/src/drafts.ts
       1 // Drafts: every write is built here, shown to the user, and sav
         ed only on Confirm.
       2 // The draft store is in memory with a TTL; the builders are pur
         e so they can be unit tested.
       3 import { nanoid } from 'nanoid';
       4 import {
       5   ME_ID,
       6   NEW_PERSON_PREFIX,
       7   type ConfirmResult,
       8   type Draft,
     … +331 lines (ctrl+o to expand)

⏺ Now app.ts and index.ts:

⏺ Write(server/src/app.ts)
  ⎿  Wrote 228 lines to server/src/app.ts
       1 // Express app and REST routes. Every write goes through a draft
         : POST /api/drafts → (PATCH) → confirm.
       2 import express, { type ErrorRequestHandler, type Request, type R
         esponse } from 'express';
       3 import { z } from 'zod';
       4 import {
       5   CATEGORIES,
       6   SPLIT_TYPES,
       7   type ApiError,
       8   type BalancesResponse,
     … +220 lines (ctrl+o to expand)

⏺ Write(server/src/index.ts)
  ⎿  Wrote 27 lines to server/src/index.ts
      1 // Server entry point: loads .env, opens the JSON store and start
        s the API.
      2 import 'dotenv/config';
      3 import { dirname, resolve } from 'node:path';
      4 import { fileURLToPath } from 'node:url';
      5 import cors from 'cors';
      6 import express from 'express';
      7 import { createApp } from './app';
      8 import { createDraftStore } from './drafts';
      9 import { openStore } from './store';
     … +18 lines (ctrl+o to expand)

⏺ Update(server/package.json)
  ⎿  Added 1 line
       4    "private": true,
       5    "type": "module",
       6    "scripts": {
       7 +    "dev": "tsx watch src/index.ts",                           
       8      "test": "vitest run",
       9      "typecheck": "tsc -p tsconfig.json"
      10    },

⏺ Update(package.json)
  ⎿  Added 1 line
      11      "server"
      12    ],
      13    "scripts": {
      14 +    "dev": "npm run dev -w server",                            
      15      "test": "npm test -w server",
      16      "typecheck": "npm run typecheck --workspaces --if-present"
      17    }

⏺ Bash(npm test 2>&1 | grep -vE "^\s*✓" | tail -60)
  ⎿  (No output)

⏺ All 187 tests pass. Next, the typecheck:

⏺ Bash(npm run typecheck 2>&1 | tail -30)
  ⎿  (No output)

⏺ The typecheck is clean. Next is the manual curl smoke check. I'm pointing the
  server at a scratch database (DB_PATH) so your server/data/ stays untouched.

⏺ Bash(DB_PATH=/private/tmp/claude-501/-Users-jarvis-Projects-splitbot/c9372e3f-
      8f92-4cf9-83a7-d7872f0a3cd2/scratchpad/smoke-db.json PORT=3999 npm run dev
      -w server >…)
  ⎿  (No output)

⏺ Everything works so far. On a fresh database Arun and Mei were created on
  Confirm. Next I'm checking "Use Arun", deleting a settlement, and restarting
  the server to confirm the data persists:

⏺ Bash(SP=/private/tmp/claude-501/-Users-jarvis-Projects-splitbot/c9372e3f-8f92-
      4cf9-83a7-d7872f0a3cd2/scratchpad
      B=localhost:3999/api; J='Content-Type: application/js…)
  ⎿  (No output)

⏺ The smoke check passes: "Use Arun" works, settlement deletes return 204 then
  404 on retry, data survives a restart with no leftover .tmp files or key
  references in the logs, and the "code 143" lines are just npm reporting my
  pkill. Now updating PLAN.md and DECISIONS.md.

⏺ Update(PLAN.md)
  ⎿  Added 2 lines, removed 1 line
      22    package.json            # workspaces: shared, server, client;
           "dev" runs both via concurrently
      23    shared/src/types.ts     # Person, Expense, Settlement, Draft,
           Balance, Transfer, ChatMessage, Category
      24    server/
      25 -    src/index.ts          # Express app, routes, CORS, dotenv  
      25 +    src/index.ts          # entry point: dotenv, CORS, opens th
         +e store, listen                                                
      26 +    src/app.ts            # createApp(deps): Express routes + J
         +SON error handler (testable with supertest)                    
      27      src/store.ts          # JSON file store (data/db.json): in-
          memory cache, atomic write (tmp + rename), serialized write que
          ue
      28      src/domain/split.ts   # computeShares(): equal | exact | pe
          rcent | shares, plus itemized adjustments
      29      src/domain/balances.ts# net balances, pairwise "who owes wh
          om"

⏺ Update(PLAN.md)
  ⎿  Added 1 line, removed 1 line
      46  - `Person { id, name }`. A built-in person with id `me` represe
          nts the user. The agent resolves "I" and "me" to it. New names 
          are created only when an expense is confirmed, and the draft ca
          rd shows them as "new".
      47  - `Expense { id, description, category, date, totalCents, paidB
          y: personId, shares: {personId, cents}[], splitMeta, createdAt 
          }`. Storing the computed shares makes balances simple sums.
      48  - `Settlement { id, from, to, cents, date }`. This records a pa
          yment, e.g. "Arun paid me back $20".
      49 -- `Draft = { kind: 'expense', expense } | { kind: 'settlement',
         - settlement }` plus `id`, `newPeople[]` and `warnings: DraftWar
         -ning[]`, where `DraftWarning = { code, message, suggestion? }` 
         -(structured since Step 2, so the DraftCard can render "Use Arun
         -").                                                            
      49 +- `Draft = { kind: 'expense', expense } | { kind: 'settlement',
         + settlement }` plus `id`, `newPeople: Person[]` (provisional `n
         +ew:<name>` ids until Confirm, since Step 3) and `warnings: Draf
         +tWarning[]`, where `DraftWarning = { code, message, suggestion?
         + }` (structured since Step 2, so the DraftCard can render "Use 
         +Arun").                                                        
      50  - Categories (fixed enum): Food & Drink, Groceries, Transport, 
          Housing & Utilities, Entertainment, Travel, Shopping, Other.
      51  
      52  ## Split engine (server/src/domain/split.ts)

⏺ Update(PLAN.md)
  ⎿  Added 3 lines, removed 2 lines
       95  
       96  ## REST API (server/src/index.ts)
       97  - `POST /api/chat` `{ messages }` → `{ reply, drafts }`
       98 +- `POST /api/drafts` creates an expense or settlement draft fr
          +om name-based input (the same builder the agent's tools use). 
          +The manual form fallback and Settle up's "Record" use it, so e
          +very write goes through a draft and the app still works when G
          +emini is unavailable.                                         
       99 +- `PATCH /api/drafts/:id` applies edits and returns the recomp
          +uted draft without saving.                                    
      100  - `POST /api/drafts/:id/confirm` (optionally with edited field
           s; shares are recomputed on the server) → saved record. `DELET
           E /api/drafts/:id` discards a draft.
       99 -- `GET /api/people`, `GET /api/expenses`, `DELETE /api/expense
          -s/:id`, `GET /api/balances`, `GET /api/settlements/suggest`, `
          -GET /api/summary?from&to`                                     
      100 -- `POST /api/expenses`: manual form fallback, so the app still
          - works when Gemini is unavailable. It goes through the same sp
          -lit engine.                                                   
      101 +- `GET /api/people`, `GET /api/expenses`, `DELETE /api/expense
          +s/:id`, `GET /api/settlements`, `DELETE /api/settlements/:id`,
          + `GET /api/balances`, `GET /api/settlements/suggest`, `GET /ap
          +i/summary?from&to`                                            
      102  
      103  ## Frontend
      104  - **Chat**: message list, input box and example-prompt chips.

⏺ Update(PLAN.md)
  ⎿  Added 1 line, removed 1 line
      102  
      103  ## Frontend
      104  - **Chat**: message list, input box and example-prompt chips.
      105 -- **DraftCard**: editable fields (description, amount, payer, 
          -category, date), a table of each person's share, and "new pers
          -on" badges. Buttons: Confirm / Discard. Editing a field calls 
          -the server to recompute the shares.                           
      105 +- **DraftCard**: editable fields (description, amount, payer, 
          +category, date), a table of each person's share, and "new pers
          +on" badges. Buttons: Confirm / Discard. Editing a field calls 
          +`PATCH /api/drafts/:id` to recompute the shares.              
      106  - **Balances**: a list of "Arun owes you $38.00", with green f
           or money owed to you and red for money you owe.
      107  - **Settle up**: suggested transfers, each with a "Record" but
           ton that creates a settlement draft and confirms it.
      108  - **Insights (Recharts)**: donut chart of spending by category
           , bar chart by month, and a toggle between "my share" and "gro
           up total". I'll load the `dataviz` skill before writing the ch
           art code.

⏺ Update(PLAN.md)
  ⎿  Added 1 line, removed 1 line
      125    - Also in this step: `.gitignore`, root `package.json` with 
           workspaces, and a `npm test` that runs and passes.
      126  - **Step 1: Shared types + split engine** (Day 1 morning). Tes
           ts first. Covers `split.ts`: leftover cents, itemized adjustme
           nts, exact/percent/shares, and validation errors.
      127  - **Step 2: Balances, settle-up, summary, guardrails** (Day 1 
           morning). Tests first. Covers `balances.ts`, `settle.ts`, `sum
           mary.ts` and `guardrails.ts`, including amount and close-name 
           detection.
      128 -- **Step 3: JSON store + drafts + REST API** (Day 1 afternoon)
          -. Tests cover store round-trip and atomic writes, and the draf
          -t confirm/discard flow through the routes (supertest). The `/a
          -pi/chat` route is not included yet.                           
      128 +- **Step 3: JSON store + drafts + REST API** (Day 1 afternoon)
          +. Tests cover store round-trip and atomic writes, and the draf
          +t create/edit/confirm/discard flow through the routes (superte
          +st). The `/api/chat` route is not included yet. See "Step 3 de
          +tail" below.                                                  
      129  - **Step 4: Gemini agent** (Day 1 afternoon). Tools, loop, pro
           mpt and `/api/chat`. Tests use a mocked Gemini client and cove
           r tool dispatch, the 5-call cap, errors going back to the mode
           l, and guardrail warnings appearing on drafts. Then a manual c
           url check against real Gemini, and the eval script.
      130  - **Step 5: Chat UI + DraftCard + confirm flow** (Day 1 evenin
           g). The dinner example works end to end in the browser, and wa
           rnings and "Use Arun" are visible.
      131  - **Step 6: Balances, Settle up, History panels** (Day 2 morni
           ng).

⏺ Update(PLAN.md)
  ⎿  Added 1 line, removed 1 line
      129  - **Step 4: Gemini agent** (Day 1 afternoon). Tools, loop, pro
           mpt and `/api/chat`. Tests use a mocked Gemini client and cove
           r tool dispatch, the 5-call cap, errors going back to the mode
           l, and guardrail warnings appearing on drafts. Then a manual c
           url check against real Gemini, and the eval script.
      130  - **Step 5: Chat UI + DraftCard + confirm flow** (Day 1 evenin
           g). The dinner example works end to end in the browser, and wa
           rnings and "Use Arun" are visible.
      131  - **Step 6: Balances, Settle up, History panels** (Day 2 morni
           ng).
      132 -- **Step 7: Insights charts + polish** (Day 2 morning). Rechar
          -ts donut and bar charts, error and empty states, manual expens
          -e form fallback, README with setup steps and screenshots, and 
          -DECISIONS.md brought up to date.                              
      132 +- **Step 7: Insights charts + polish** (Day 2 morning). Rechar
          +ts donut and bar charts, error and empty states, manual expens
          +e form fallback (via `POST /api/drafts` + confirm), README wit
          +h setup steps and screenshots, and DECISIONS.md brought up to 
          +date.                                                         
      133  - **Step 8 (stretch): Deploy** the server to Render and the cl
           ient to Vercel. Render's free tier has an ephemeral disk, so t
           he JSON file would reset on restart; document this or move to 
           a free hosted database.
      134  
      135  ## Step 1 detail: shared types + split engine

⏺ Now the Step 3 detail section, which goes after Step 2's:

⏺ Update(PLAN.md)
  ⎿  Added 31 lines
      329  ### Done when
      330  `npm test` and `npm run typecheck` pass. Then run `/review-ste
           p`, commit "Step 2: balances, settle-up, summary, guardrails",
            and stop for review.
      331  
      332 +## Step 3 detail: JSON store, drafts, REST API                
      333 +Prerequisite: Step 2 is committed. `/api/chat` and Gemini wait
          + for Step 4. Step 4's `create_expense_draft` tool calls the sa
          +me `buildExpenseDraft` as `POST /api/drafts`.                 
      334 +                                                              
      335 +### Files                                                     
      336 +| File | Contents |                                           
      337 +|---|---|                                                     
      338 +| `shared/src/types.ts` | `newPeople: Person[]`, `NEW_PERSON_P
          +REFIX`, `ExpenseDraftInput`, `SettlementDraftInput`, `DraftReq
          +uest`, `DraftEdits`, `ConfirmResult`, `BalancesResponse`, `Api
          +Error` |                                                      
      339 +| `server/src/store.ts` | `openStore(path, { fs? })`: cache, `
          +snapshot()` (deep copy), `update(fn)` (serialized queue; fn ru
          +ns on a copy, tmp write + rename, cache updated only after the
          + rename). Missing file → seed with `me` ("Me"); corrupt or wro
          +ng-shaped file → throws, never overwritten; a file without `me
          +` gets it added. Path `server/data/db.json`, or `DB_PATH` |   
      340 +| `server/src/drafts.ts` | `createDraftStore({ ttlMs = 30 min,
          + now })` (lazy expiry, sweep on put, no timers), `buildExpense
          +Draft`, `buildSettlementDraft`, `applyEdits`, `finalizeDraft`,
          + `DraftError` |                                               
      341 +| `server/src/app.ts`, `server/src/index.ts` | `createApp({ st
          +ore, drafts, today, now?, log? })` with zod-validated bodies; 
          +index.ts does dotenv, CORS (localhost origins) and `listen` | 
      342 +| `server/src/domain/guardrails.ts`, `summary.ts` | export `no
          +rmalizeName` and `assertDate` (no logic change) |             
      343 +| `server/test/{store,drafts,api}.test.ts` | written first; co
          +nfirmed to fail before the implementation existed |           
      344 +                                                              
      345 +### Rules                                                     
      346 +- **Names:** `me` or me's display name → `me`; a normalized ex
          +act match → that person; anything else → provisional `new:<nor
          +malized name>`, listed in `newPeople` with the typed name. Nam
          +es in adjustments and the exact/percent/shares maps resolve th
          +e same way.                                                   
      347 +- **Warnings:** `checkNames` always; `checkAmounts` only when 
          +a `message` is given (the agent passes it in Step 4).         
      348 +- **Edits** (`description`, `category`, `date`, `totalCents`, 
          +`paidBy`, `cents` for settlements, `replace: { from, to }[]` f
          +or "Use Arun"; edits for the other kind → `INVALID_EDIT`): app
          +lied, then shares are recomputed from the current participants
          + and `splitMeta`. Any error leaves the draft unchanged. PATCH 
          +replaces the draft (same id) and restarts its TTL. `CLOSE_NAME
          +` warnings stay only for new people who remain; an amount edit
          + clears `AMOUNT_NOT_IN_MESSAGE`.                              
      349 +- **Confirm** is all-or-nothing: the draft is taken before the
          + write and restored if the write fails; a concurrent second co
          +nfirm gets 404. Edits and finalizing run inside the store upda
          +te, so a `new:` person matching someone created meanwhile is r
          +eused.                                                        
      350 +- **Errors:** `{ error: { code, message } }`. zod/malformed JS
          +ON → 400 `VALIDATION_ERROR`; `SplitError`/`DraftError` → 400 w
          +ith their code; bad summary dates → 400 `INVALID_DATE`; missin
          +g draft → 404 `DRAFT_NOT_FOUND`; missing record or route → 404
          + `NOT_FOUND`; anything else → 500 `INTERNAL` with a generic me
          +ssage (logged, the request isn't).                            
      351 +- **Ordering:** expenses newest first by `date`, then `created
          +At`; settlements by `date`, then most recently stored. People 
          +are never deleted.                                            
      352 +                                                              
      353 +### Test cases (written first)                                
      354 +**store:** 1 seed + directory · 2 round trip · 3 snapshot is a
          + copy · 4 corrupt JSON rejected, file untouched · 5 wrong shap
          +e rejected · 6 missing `me` added · 7 rename failure: old file
          +, cache unchanged, no `.tmp` · 8 queue recovers after a failed
          + write · 9 throwing fn: nothing written, queue continues · 10 
          +50 concurrent updates in order                                
      355 +**draft store:** 11 round trip, unique ids · 12 TTL boundary ·
          + 13 take/restore · 14 sweep on put                            
      356 +**builder:** 15 dinner · 16 trimmed/case/NFC/me resolution · 1
          +7 `new:kai` · 18 Kai + kai → `DUPLICATE_PARTICIPANT` · 19 name
          +-keyed maps → id-keyed `splitMeta` · 20 Aroon → `CLOSE_NAME` ·
          + 21 amount check only with a message · 22 default date, `INVAL
          +ID_DATE` · 23 `SplitError` passes through · 24 settlement: res
          +olve, `SAME_PERSON`, `INVALID_AMOUNT`, close name · 25 "constr
          +uctor"                                                        
      357 +**edits and finalize:** 26 no `new:` ids left · 27 reuse a per
          +son created meanwhile · 28 total/description/category/date/pay
          +er edits, settlement cents edit · 29 "Use Arun" · 30 bad repla
          +cements, wrong-kind edits · 31 failed edit leaves the draft un
          +changed · 57 amount edit clears amount warnings               
      358 +**API:** 32–50 people, drafts, confirm (with/without edits, in
          +valid, expired, double, concurrent), discard, balances, sugges
          +t, summary, expense order and delete, restart, write failure →
          + 500, unknown route · 51–56 PATCH (recompute without saving, "
          +Use Arun", stacking, invalid edits, 404, TTL restart) · 58–60 
          +settlements list, delete, unknown id                          
      359 +                                                              
      360 +### Done when                                                 
      361 +`npm test`, `npm run typecheck` and a curl smoke check (draft 
          +→ PATCH → confirm → balances → settlement list/delete → restar
          +t, data still there) pass. Then stop for review; the user runs
          + `/review-step` and commits.                                  
      362 +                                                              
      363  ## Verification
      364  - **Unit tests (vitest)**, run with `npm test -w server`:
      365    - split engine: equal splits with leftover cents, itemized a
           djustments, exact/percent/shares, and every validation error
⏺ Update(DECISIONS.md)
  ⎿  Added 5 lines
      13  - **Close-name rules (Step 2).** The short-name threshold (≤1 i
          nstead of ≤2) uses the longer of the two names, so the check is
           symmetric. The prefix rule means one name starts with the othe
          r and the shorter one has at least 3 letters (Rob/Robert).
      14  - **Summary input is strict (Step 2 review).** `from`, `to` and
           every expense date must be a real YYYY-MM-DD date, and every c
          ategory must be in `CATEGORIES`; otherwise a `RangeError` is th
          rown. Month-only bounds like `2026-10` are rejected rather than
           guessed at, so the agent has to send full dates.
      15  - **The user's own name counts as an exact match (Step 2 review
          ).** `me` is never offered as a suggestion, but typing me's dis
          play name (e.g. "Rahul") doesn't produce a warning about someon
          e similar.
      16 +- **One write path: drafts (Step 3).** PLAN.md had `POST /api/e
         +xpenses` saving a manual expense directly. It was dropped. The 
         +manual form and Settle up's "Record" call `POST /api/drafts` an
         +d then confirm, so CLAUDE.md principle 3 holds without exceptio
         +ns. Trade-off: two requests for a manual save.                 
      17 +- **Draft editing and settlement routes (Step 3).** Added `PATC
         +H /api/drafts/:id` (edit + recompute without saving; the DraftC
         +ard needs it) and `GET`/`DELETE /api/settlements` (the History 
         +panel needs them). PATCH and confirm share `applyEdits`. PATCH 
         +restarts the 30-minute TTL, because editing means the user is s
         +till working on it.                                            
      18 +- **Provisional `new:` ids for people who don't exist yet (Step
         + 3).** In a draft, "Kai" is `new:kai` and `newPeople` is `Perso
         +n[]`. On Confirm, each one becomes a real nanoid id, or an exis
         +ting person with the same name if another confirm created them 
         +first; the id is swapped in the payer, shares, adjustments and 
         +split maps. Chosen over slug ids so stored ids don't depend on 
         +spelling. The finalize step runs inside the store's write queue
         +, so two drafts that both add "Kai" end up with one Kai.       
      19 +- **Edits and warnings (Step 3).** After an edit, `CLOSE_NAME` 
         +warnings stay only for new people still in the draft ("Use Arun
         +" removes Aroon's). An amount edit clears `AMOUNT_NOT_IN_MESSAG
         +E` warnings, because the user has now entered the amount themse
         +lves; other edits keep them.                                   
      20 +- **Store details (Step 3).** The cache is updated only after t
         +he rename succeeds, so a failed write changes nothing, and the 
         +queue keeps going after a failure. A corrupt or wrong-shaped db
         +.json makes startup fail rather than being overwritten. The see
         +d name for `me` is "Me". REST money is integer cents (the clien
         +t converts).                                                   
      21  - **Drafts before writes.** The agent can never save directly; 
          the user confirms every expense or settlement. Trade-off: one e
          xtra click per expense, in exchange for safety when the model g
          ets something wrong.
      22  - **5 tool calls per message.** This prevents runaway loops and
           protects the free-tier quota.
      23  - **Guardrails warn, never block.** Amounts that aren't in the 
          message and close-but-different names produce warnings on the d
          raft rather than errors, so the user stays in control.

⏺ Update(DECISIONS.md)
  ⎿  Added 1 line
      40  - Step 2: I asked for a plan and test list only, before any cod
          e. After review I chose: include exact amounts in the amount ch
          eck, the prefix and short-name rules, structured warnings now, 
          and keep greedy settle-up but rename it and log the trade-off.
      41  - Step 2: when the "shorter name" threshold turned out to break
           the Aroon/Arun case, I switched it to the longer name.
      42  - Step 2: I signed off on three rules the AI added (zero values
           not checked, `suggestion: { name, person }`, `extractNumbers` 
          returning raw numbers). I asked for `@types/node` in place of t
          he `structuredClone` workaround, and for `split.test.ts` to use
           the shared PRNG in `helpers.ts` without changing assertions.
      43 +- Step 3: I asked for a plan and test list only. From the AI's 
         +questions I chose `POST /api/drafts`, dropping `POST /api/expen
         +ses` for the draft flow, and provisional `new:` ids. Reviewing 
         +the plan, I also asked for `PATCH /api/drafts/:id` and `GET`/`D
         +ELETE /api/settlements` (with tests) instead of leaving them as
         + open points for Steps 5 and 6, and said not to commit: I run `
         +/review-step` and commit myself.                               
      44  - Step 2: after `/review-step` I asked for all of its fixes, te
          sts first: date validation, ignoring empty names, a clear error
           for an unknown category, an exact match on me's display name, 
          dollar error messages in settle-up, the "7:30pm" amount test, a
          nd these log and plan updates.
      45  
      46  ## Where AI sped me up / got in the way

⏺ Bash(npm test 2>&1 | grep -E "Test Files|Tests " && npm run typecheck 2>&1 |
      grep -iE "error" ; echo "typecheck exit: $?"; git status --short; ls
      server/data 2>&1 |…)
  ⎿  (No output)

⏺ I've built Step 3 and stopped for your review. Nothing is committed. All 187
  tests pass (60 new, 127 existing), the typecheck is clean, and the curl smoke
  check passed. (The "typecheck exit: 1" in the last output is just grep finding
  no errors.)

  What's new
  - store.ts (server/src/store.ts): the JSON file store. Writes are atomic and
    run one at a time, and a failed write changes nothing. A corrupt db.json
    stops startup instead of being overwritten. The default file is
    server/data/db.json, or DB_PATH.
  - drafts.ts (server/src/drafts.ts): the 30-minute draft store, plus the draft
    builders, applyEdits and finalizeDraft. new: ids become real ids on Confirm,
    or the existing person if someone with that name was created meanwhile.
  - app.ts (server/src/app.ts): every route in the plan, including POST
    /api/drafts, PATCH /api/drafts/:id and GET/DELETE /api/settlements. Request
    bodies are checked with zod and every error comes back as { error: { code,
    message } }.
  - index.ts (server/src/index.ts): starts the server. npm run dev now works
    from the root.
  - Small changes to existing code: newPeople is now Person[], and two existing
    helpers are exported (normalizeName, assertDate) with no logic change.

  How I worked
  - Tests first: I wrote the three test files and saw them fail (the modules
    didn't exist yet), then implemented. All 60 new tests passed on the first
    full run, so none of them ever failed against real code.
  - Edits: all code changes went through the file edit tool, as you asked in
    Step 2.
  - Smoke check:
    - It ran against a scratch database, so server/data/ was never created.
    - It covered: draft, PATCH, confirm, balances, settlement list and delete (a
      second delete gives 404), "Use Arun", and a restart with identical data
      afterwards.
    - Bad JSON gave 400, and no API key appeared in the logs.

  Additions beyond the planned test list (not deviations, but you should know):
  1. Test #28 also checks a settlement cents edit. Test #30 also checks that
     edits for the wrong kind of draft return a new error code, INVALID_EDIT
     (for example totalCents on a settlement).
  2. There's another new code, INVALID_NAME, for an empty name or the same name
     twice in a split map such as {Arun, arun}.
  3. Deleting an unknown expense or settlement returns 404 correctly, but still
     rewrites db.json unchanged. It's harmless; say if you want it to skip the
     write.

  PLAN.md now has a "Step 3 detail" section and the updated REST list.
  DECISIONS.md has five Step 3 decisions and a re-prompt entry. You can run
  /review-step next.

❯ Good work. Three things:
  1. Skip the db.json write when deleting an unknown expense or settlement,
  with a test.
  2. Mutation check: temporarily break three key behaviours one at a time (the
  take/restore in confirm, the atomic rename, and new: id replacement in
  finalizeDraft), confirm the related tests fail each time, then restore the
  code. Report which tests caught each one.
  3. Give me the exact curl commands to run the smoke check myself: create a
  dinner draft, PATCH it, confirm it, get balances, then restart and check the
  data is still there. Don't run them, I will.
     Then run npm test and npm run typecheck and stop.

⏺ First the test for item 1, then I'll confirm it fails. The file's content
  would look the same either way, so the test counts store writes (renames)
  instead.

⏺ Update(server/test/api.test.ts)
  ⎿  Added 2 lines
      34  async function setup() {
      35    let now = Date.parse('2026-11-03T12:00:00.000Z');
      36    let failWrites = false;
      37 +  let writes = 0;                                              
      38    const store = await openStore(dbPath, {
      39      fs: {
      40        rename: async (from, to) => {
      41          if (failWrites) throw new Error('disk full at /secret/p
          ath');
      42 +        writes++;                                              
      43          await rename(from, to);
      44        },
      45      },

⏺ Update(server/test/api.test.ts)
  ⎿  Added 2 lines
      58      setFailWrites: (fail: boolean) => {
      59        failWrites = fail;
      60      },
      61 +    /** How many times db.json has been written (successful ren
         +ames). */                                                      
      62 +    writes: () => writes,                                      
      63    };
      64  }
      65  

⏺ Update(server/test/api.test.ts)
  ⎿  Added 9 lines
      428      expect(res.status).toBe(404);
      429      expect(res.body.error.code).toBe('NOT_FOUND');
      430    });
      431 +                                                              
      432 +  it('#61 deleting an unknown expense or settlement doesn\'t w
          +rite db.json', async () => {                                  
      433 +    const { app, writes } = await setup();                    
      434 +    await confirm(app, (await createDraft(app)).id);          
      435 +    const before = writes();                                  
      436 +    expect((await request(app).delete('/api/expenses/nope')).s
          +tatus).toBe(404);                                             
      437 +    expect((await request(app).delete('/api/settlements/nope')
          +).status).toBe(404);                                          
      438 +    expect(writes()).toBe(before);                            
      439 +  });                                                         
      440  });

⏺ Bash(cd /Users/jarvis/Projects/splitbot/server && npx vitest run
      test/api.test.ts -t "#61" 2>&1 | grep -E
      "✓|×|FAIL|AssertionError|Expected|Received|Tests " | head)
  ⎿  (No output)

⏺ The test fails as expected: 2 extra writes. Now the fix:

⏺ Update(server/src/app.ts)
  ⎿  Added 2 lines
      216    app.use(errorHandler);
      217  
      218    async function removeById(list: 'expenses' | 'settlements', 
           id: string): Promise<boolean> {
      219 +    // An unknown id needs no write. The check is repeated ins
          +ide the update in case another request removed it first.      
      220 +    if (!store.snapshot()[list].some((item) => item.id === id)
          +) return false;                                               
      221      return store.update((db) => {
      222        const index = db[list].findIndex((item) => item.id === i
           d);
      223        if (index === -1) return false;

⏺ Bash(npx vitest run 2>&1 | grep -E "×|Test Files|Tests ")
  ⎿  (No output)

⏺ Item 1 is done: all 188 tests pass. Next is the mutation check. I'll make each
  break with the edit tool, run the suite, then undo it. Mutation 1a makes
  confirm get the draft instead of taking it:

⏺ Update(server/src/app.ts)
  ⎿  Added 1 line, removed 1 line
      125    app.post('/api/drafts/:id/confirm', async (req, res) => {
      126      // Parse before taking the draft, so a bad body leaves it 
           in place.
      127      const edits: DraftEdits = DraftEditsSchema.parse(req.body 
           ?? {});
      128 -    const draft = drafts.take(req.params.id);                 
      128 +    const draft = drafts.get(req.params.id); // MUTATION 1a   
      129      if (!draft) throw draftNotFound();
      130      try {
      131        const result = await store.update((db) => {

⏺ Bash(npx vitest run 2>&1 | grep -E "^\s+×|Tests " )
  ⎿  (No output)

⏺ Two tests caught it. Restoring, then mutation 1b: drop the restore after a
  failed confirm.

⏺ Update(server/src/app.ts)
  ⎿  Added 1 line, removed 1 line
      125    app.post('/api/drafts/:id/confirm', async (req, res) => {
      126      // Parse before taking the draft, so a bad body leaves it 
           in place.
      127      const edits: DraftEdits = DraftEditsSchema.parse(req.body 
           ?? {});
      128 -    const draft = drafts.get(req.params.id); // MUTATION 1a   
      128 +    const draft = drafts.take(req.params.id);                 
      129      if (!draft) throw draftNotFound();
      130      try {
      131        const result = await store.update((db) => {

⏺ Update(server/src/app.ts)
  ⎿  Added 1 line, removed 1 line
      138        });
      139        res.json(result);
      140      } catch (err) {
      141 -      drafts.restore(draft);                                  
      141 +      // drafts.restore(draft); // MUTATION 1b                
      142        throw err;
      143      }
      144    });

⏺ Bash(npx vitest run 2>&1 | grep -E "^\s+×|Tests " )
  ⎿  (No output)

⏺ Two more caught. Restoring, then mutation 2: write db.json directly instead of
  a tmp file plus rename.

⏺ Update(server/src/app.ts)
  ⎿  Added 1 line, removed 1 line
      138        });
      139        res.json(result);
      140      } catch (err) {
      141 -      // drafts.restore(draft); // MUTATION 1b                
      141 +      drafts.restore(draft);                                  
      142        throw err;
      143      }
      144    });

⏺ Update(server/src/store.ts)
  ⎿  Added 1 line, removed 2 lines
      61    async function write(db: Db): Promise<void> {
      62      const tmp = `${path}.${process.pid}.${++tmpCounter}.tmp`;
      63      try {
      64 -      await fs.writeFile(tmp, `${JSON.stringify(db, null, 2)}\n
         -`, 'utf8');                                                    
      65 -      await fs.rename(tmp, path);                              
      64 +      await fs.writeFile(path, `${JSON.stringify(db, null, 2)}\
         +n`, 'utf8'); // MUTATION 2                                     
      65      } catch (err) {
      66        await fs.unlink(tmp).catch(() => undefined);
      67        throw err;

⏺ Bash(npx vitest run 2>&1 | grep -E "^\s+×|Tests " )  ⎿  (No output)

⏺ Three caught. Restoring, then mutation 3: finalizeDraft keeps the new: ids.

⏺ Update(server/src/store.ts)
  ⎿  Added 2 lines, removed 1 line
      61    async function write(db: Db): Promise<void> {
      62      const tmp = `${path}.${process.pid}.${++tmpCounter}.tmp`;
      63      try {
      64 -      await fs.writeFile(path, `${JSON.stringify(db, null, 2)}\
         -n`, 'utf8'); // MUTATION 2                                     
      64 +      await fs.writeFile(tmp, `${JSON.stringify(db, null, 2)}\n
         +`, 'utf8');                                                    
      65 +      await fs.rename(tmp, path);                              
      66      } catch (err) {
      67        await fs.unlink(tmp).catch(() => undefined);
      68        throw err;

⏺ Update(server/src/drafts.ts)
  ⎿  Added 1 line, removed 1 line
      330        ids.set(p.id, person.id);
      331      }
      332    }
      333 -  const map = (id: PersonId) => ids.get(id) ?? id;            
      333 +  const map = (id: PersonId) => id; // MUTATION 3             
      334  
      335    if (draft.kind === 'expense') {
      336      return { kind: 'expense', expense: { ...remapExpense(draft
           .expense, map), createdAt: options.now }, createdPeople };

⏺ Bash(npx vitest run 2>&1 | grep -E "^\s+×|Tests " )
  ⎿  (No output)

⏺ Restoring, then the final run. I'm also checking that no MUTATION marker is
  left anywhere:

⏺ Update(server/src/drafts.ts)
  ⎿  Added 1 line, removed 1 line
      330        ids.set(p.id, person.id);
      331      }
      332    }
      333 -  const map = (id: PersonId) => id; // MUTATION 3             
      333 +  const map = (id: PersonId) => ids.get(id) ?? id;            
      334  
      335    if (draft.kind === 'expense') {
      336      return { kind: 'expense', expense: { ...remapExpense(draft
           .expense, map), createdAt: options.now }, createdPeople };

⏺ Bash(cd /Users/jarvis/Projects/splitbot && grep -rn "MUTATION" server/src
      server/test; echo "markers: $?"; npm test 2>&1 | grep -E "×|Test
      Files|Tests "; npm run typ…)
  ⎿  (No output)

⏺ All three items are done. npm test passes (188 tests) and npm run typecheck is
  clean.

  1. No write when deleting an unknown id

  removeById in app.ts (server/src/app.ts) now checks the current data before
  starting a store update, so an unknown id returns 404 without writing db.json.
  It checks again inside the update, in case another request removed the record
  first.

  New test #61: after a confirm, deleting an unknown expense and an unknown
  settlement leaves the write count unchanged. Comparing the file contents
  wouldn't work, because the file looked the same either way. The test failed
  before the fix ("expected 5 to be 3") and passes now.

  2. Mutation check

  I made each break with the edit tool, ran the full suite, then undid it. No
  MUTATION markers are left in server/src or server/test.

  ┌───────────────────────────────┬─────────────────────────────────────────┐
  │           Mutation            │            Tests that failed            │
  ├───────────────────────────────┼─────────────────────────────────────────┤
  │ 1a. Confirm uses get instead  │ #36 (second confirm → 404), #41 (two    │
  │ of take (the draft isn't      │ concurrent confirms → one 200, one 404) │
  │ removed)                      │                                         │
  ├───────────────────────────────┼─────────────────────────────────────────┤
  │ 1b. restore removed after a   │ #38 (the draft can still be confirmed   │
  │ failed confirm                │ after invalid edits), #49 (retry after  │
  │                               │ a write failure)                        │
  ├───────────────────────────────┼─────────────────────────────────────────┤
  │ 2. Write db.json directly,    │ #7 (atomic write), #8 (queue recovers   │
  │ with no tmp file or rename    │ after a failure), #49 (500 on a write   │
  │                               │ failure)                                │
  ├───────────────────────────────┼─────────────────────────────────────────┤
  │ 3. finalizeDraft leaves the   │ #26 (no new: ids left), #27 (reuse a    │
  │ new: ids in place             │ person created meanwhile), #36 (confirm │
  │                               │  through the API)                       │
  └───────────────────────────────┴─────────────────────────────────────────┘

  Mutation 2 was caught only because those tests make the rename fail. No test
  simulates a crash in the middle of a write, which is the case the tmp file
  plus rename actually protects against. That would need killing a process
  mid-write, so I left it untested. Test #61 counts renames, so it didn't notice
  mutation 2.

  3. Smoke check commands

  Terminal 1, from the repo root. Prefix the command with
  DB_PATH=/some/other.json if you want to keep your real data out of it:
  npm run dev

  Terminal 2. On a fresh database, Arun and Mei show up as new people with new:
  ids until you confirm.
  B=http://localhost:3001/api
  J='Content-Type: application/json'

  # 1. Create the dinner draft → shares 2600 / 3800 / 2600
  D=$(curl -s -X POST $B/drafts -H "$J" -d
  '{"kind":"expense","description":"Dinner","category":"Food & Drink","totalCent
  s":9000,"paidBy":"me","participants":["me","Arun","Mei"],"splitType":"equal","
  adjustments":[{"person":"Arun","cents":1200,"note":"drinks"}]}')
  echo "$D"
  ID=$(echo "$D" | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')

  # 2. PATCH the total to $93 → shares 2700 / 3900 / 2700, nothing saved yet
  curl -s -X PATCH $B/drafts/$ID -H "$J" -d '{"totalCents":9300}'; echo
  curl -s $B/expenses; echo        # still []

  # 3. Confirm → saved; createdPeople lists Arun and Mei with real ids
  curl -s -X POST $B/drafts/$ID/confirm; echo

  # 4. Balances → me +6600, Arun −3900, Mei −2700
  curl -s $B/balances; echo

  Restart: press Ctrl+C in terminal 1 and run npm run dev again. Then in
  terminal 2:
  curl -s $B/balances; echo        # same numbers as step 4
  curl -s $B/expenses; echo        # the dinner, total 9300

  I haven't run the review or committed anything.