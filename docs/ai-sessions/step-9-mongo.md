
❯ /clear

❯ <ide_opened_file>The user opened the file
  /Users/jarvis/Projects/splitbot/docs/ai-sessions/step-6-dashboard.md in the
  IDE. This may or may not be related to the current task.</ide_opened_file>

❯ Groups are merged into main. Step 7 lite only, no new features:
  1. Write README.md: what SplitBot is and the problem it solves, setup (copy
  .env.example to .env, add a free Gemini key), how to run the app, tests and
  eval, architecture in 5 bullets, key decisions linking to DECISIONS.md, and
  known limitations.
  2. Add a short summary at the top of DECISIONS.md: the 5 most important
  decisions with their trade-offs, and the 5 clearest times the AI got
  something wrong, how each was caught (test, eval, review, browser check,
  GitHub) and what was done.
  3. Run npm test and stop. Don't commit.

⏺ Bash(git status --short; ls -a; ls docs docs/ai-sessions eval server/eval
      2>/dev/null; cat package.json; cat .env.example; wc -l DECISIONS.md
      PLAN.md; ls README* 2>/…)
  ⎿  (No output)

  Read 1 file (ctrl+o to expand)

⏺ Bash(cat server/package.json client/package.json; cat .gitignore; find
      server/src server/test server/eval* client/src shared/src -maxdepth 2
      -type f | grep -v node_m…)
  ⎿  (No output)

⏺ Bash(grep -n "DB_PATH\|listen(" -r server/src | head; grep -c "id:"
      server/scripts/eval-cases.ts; sed -n 1,25p server/scripts/eval-cases.ts;
      grep -n "EVAL_DELAY_MS\|…)
  ⎿  (No output)

⏺ Bash(grep -n -E "[0-9]+/[0-9]+ passed|consistent|[0-9]/3\b"
      docs/ai-sessions/step-4-agent.md | tail -20; grep -n "id: "
      server/scripts/eval-cases.ts | wc -l; sed -n…)
  ⎿  (No output)

⏺ Bash(sed -n 3910,3925p docs/ai-sessions/step-4-agent.md | cut -c1-200; grep -n
      -E "cases passed|runs passed|passed every|re-?run"
      docs/ai-sessions/step-4-agent.md |…)
  ⎿  (No output)

⏺ Checking the last recorded eval result so the README doesn't overstate it,
  then I'll write both docs.

⏺ Bash(sed -n 4170,4202p docs/ai-sessions/step-5-chat-ui.md | cut -c1-170; sed
      -n 1540,1546p docs/ai-sessions/step-6-dashboard.md | cut -c1-170; sed -n
      6044,6050p docs…)
  ⎿  (No output)

⏺ Write(README.md)
  ⎿  Wrote 69 lines to README.md
      1 # SplitBot
      2
      3 SplitBot is a Splitwise-style web app that you drive with plain E
        nglish. Type "Dinner $90, I paid, split with Arun and Mei, Arun h
        ad $12 of drinks", and a Gemini agent turns it into a draft expen
        se for you to check and confirm. The app tracks who owes whom, su
        ggests how to settle up, and charts spending by category.
      4
      5 ## The problem it solves
      6 Entering shared expenses by hand is slow, especially when a bill
     … +64 lines (~5 KB) (ctrl+o to expand)

⏺ Update(DECISIONS.md)
  ⎿  Added 16 lines
       1  # SplitBot: decisions log
       2  
       3 +## Summary                                                     
       4 +                                                               
       5 +### The 5 most important decisions                             
       6 +1. **The LLM extracts; code calculates.** Gemini returns struct
         +ured tool arguments, and tested TypeScript computes every share
         +, balance and transfer. Trade-off: the tool schemas are more de
         +tailed, but a total can't be hallucinated and the logic can be 
         +unit tested.                                                   
       7 +2. **Every expense and payment goes through a draft.** Nothing 
         +the model produces is saved until I click Confirm. Trade-off: o
         +ne extra click per expense, in exchange for catching model mist
         +akes before they're saved. Deletes, creating a group and adding
         + a member write directly, as approved exceptions, because they 
         +have nothing to preview or move no money.                      
       8 +3. **Guardrails warn, but block guesses about who took part.** 
         +Suspicious amounts and names become warnings on the draft, so I
         + stay in control. `UNNAMED_PERSON` and `SPLIT_COUNT_MISMATCH` r
         +eject the tool call in the agent path, because prompt rules and
         + warnings didn't stop the model guessing. Trade-off: "split wit
         +h everyone" is rejected and the model has to ask.              
       9 +4. **Integer cents, with leftover cents going to the payer firs
         +t.** This avoids floating-point drift, and shares always add up
         + exactly to the total. Listed order alone gave different result
         +s for the same expense, because the AI picks the order. Trade-o
         +ff: the split engine now needs `paidBy`.                       
      10 +5. **A JSON file, single user, no login.** There are no native 
         +modules and nothing to set up, which kept the time on the agent
         + and the money logic. Trade-off: no SQL, so summaries are compu
         +ted in memory, and a host with an ephemeral disk would lose the
         + data.                                                         
      11 +                                                               
      12 +### The 5 clearest times the AI got it wrong                   
      13 +1. **Caught by writing a test: a name rule that broke the plan'
         +s own example (Step 2).** The AI recommended that the shorter n
         +ame set the close-name threshold, and I approved it. Writing th
         +e tests showed that "Aroon" vs "Arun" would then get no warning
         +. Done: the longer name now sets the threshold.                
      14 +2. **Caught by the eval: the model guessed a participant (Step 
         +4).** "Uber $24 Mei paid split 3 ways" should have produced a q
         +uestion, but the model filled in the third person from the know
         +n-people list. Two rounds of evidence showed that the prompt fi
         +x didn't hold and that the named-people rule couldn't catch a w
         +rong count. Done: `UNNAMED_PERSON` and `SPLIT_COUNT_MISMATCH` n
         +ow enforce this in code.                                       
      15 +3. **Caught by `/review-step`: an infinite loop behind passing 
         +tests (Step 2).** All 120 tests passed, but a probe showed that
         + `spendingSummary` looped forever on a malformed date (`2026-1-
         +05`) and that month-only bounds silently dropped data. The test
         +s had only used valid dates. Done: dates must be real YYYY-MM-D
         +D dates, with regression tests.                                
      16 +4. **Caught by my browser check: invented dates (Step 5).** Dra
         +fts showed 27/10 and 26/10 on 4/11, though I never mentioned a 
         +date and the prompt said to leave it out. Neither the tests nor
         + the eval checked dates. Done: code drops the model's date unle
         +ss a user message contains a date phrase, and the draft then us
         +es today.                                                      
      17 +5. **Caught by GitHub: a real Gemini key in `.env.example`.** T
         +he file is committed, so the key ended up in a local commit, an
         +d none of the tests or reviews caught it. GitHub push protectio
         +n blocked the push, so it never reached GitHub. Done: I removed
         + the key, amended the commit and rotated the key. `server/test/
         +env-example.test.ts` now fails if the file contains a key.     
      18 +                                                               
      19  ## Decisions & trade-offs
      20  - **Store data in a JSON file, not SQLite or Postgres.** For on
          e user, the simplest storage is enough: no native modules and n
          othing to set up. Trade-off: no SQL queries, so summaries are c
          omputed in memory, and free hosts with ephemeral disks would lo
          se the data. Writes are atomic (write a temp file, then rename)
           and go through a queue so concurrent writes can't corrupt the 
          file.
      21  - **Single user, no login.** People are just names, and the use
          r is the built-in person `me`. This keeps 1.5 days focused on t
          he agent and the money logic.

⏺ Update(DECISIONS.md)
  ⎿  Added 1 line
      101  - **One groups route, not one per group (Step 6 Part E).** My 
           plan listed `GET /api/groups/:id/account`. `GET /api/groups` r
           eturns every group with its summary instead, so groups refetch
            with the other panels in one load and need no per-group loadi
           ng state.
      102  - **Known limitation: a payment can be counted twice (Step 6 P
           art E).** This is a real money error, and it is only warned ab
           out, not prevented. A payment recorded with no group (from the
            overall Smart settle up tab, or a chat draft left on "No grou
           p") lowers the overall balance but not the group's. The group 
           keeps suggesting the same payment, and following that suggesti
           on records it twice. With the $90 dinner in a group, recording
            Arun's $38 both ways takes my overall net from +$64 to -$12, 
           so the app says I owe Arun, while the group looks correct. Tes
           t #154 documents this. Notes on both tabs warn about it, and d
           eleting the extra payment in Expenses undoes it, but nothing d
           etects or prompts for it. Preventing it would mean matching pa
           yments across views, which isn't built.
      103  - **Other known limitations (Step 6 Part E).** The dropdown ca
           n move a payment to another group or to none. Groups and membe
           rs can't be renamed or removed. An open payment card closes on
            a tab switch, like the overall tab's. If the person chosen un
           der Add a person joins through a Confirm first, Add member sta
           ys enabled while the dropdown shows "Choose a person"; clickin
           g it changes nothing. There is no test for a 60 or 61 characte
           r group name or for adding a member with no request body. The 
           clicks on the Groups form and on the draft card's dropdown hav
           e no automated test, because the client tests render static ma
           rkup.
      104 +- **Step 7 lite: docs only (Step 7).** This step is the README
          + and this summary, with no new features. The manual expense fo
          +rm and the README screenshots that PLAN.md lists for Step 7 ar
          +e left out. Trade-off: without a working Gemini key or quota, 
          +the UI can't add an expense.                                  
      105  
      106  ## Where AI got it wrong
      107  _(Log mistakes as they happen: what it did, how it was caught,
            and the fix.)_

⏺ Update(DECISIONS.md)
  ⎿  Added 1 line, removed 1 line
      11  
      12  ### The 5 clearest times the AI got it wrong
      13  1. **Caught by writing a test: a name rule that broke the plan'
          s own example (Step 2).** The AI recommended that the shorter n
          ame set the close-name threshold, and I approved it. Writing th
          e tests showed that "Aroon" vs "Arun" would then get no warning
          . Done: the longer name now sets the threshold.
      14 -2. **Caught by the eval: the model guessed a participant (Step 
         -4).** "Uber $24 Mei paid split 3 ways" should have produced a q
         -uestion, but the model filled in the third person from the know
         -n-people list. Two rounds of evidence showed that the prompt fi
         -x didn't hold and that the named-people rule couldn't catch a w
         -rong count. Done: `UNNAMED_PERSON` and `SPLIT_COUNT_MISMATCH` n
         -ow enforce this in code.                                       
      14 +2. **Caught by the eval: the model guessed a participant (Step 
         +4).** "Uber $24 Mei paid split 3 ways" should have produced a q
         +uestion, but the model filled in the third person from the know
         +n-people list. Reruns showed that a prompt fix didn't hold and 
         +that the first code guard couldn't catch a wrong count. Done: `
         +UNNAMED_PERSON` and `SPLIT_COUNT_MISMATCH` now enforce this in 
         +code.                                                          
      15  3. **Caught by `/review-step`: an infinite loop behind passing 
          tests (Step 2).** All 120 tests passed, but a probe showed that
           `spendingSummary` looped forever on a malformed date (`2026-1-
          05`) and that month-only bounds silently dropped data. The test
          s had only used valid dates. Done: dates must be real YYYY-MM-D
          D dates, with regression tests.
      16  4. **Caught by my browser check: invented dates (Step 5).** Dra
          fts showed 27/10 and 26/10 on 4/11, though I never mentioned a 
          date and the prompt said to leave it out. Neither the tests nor
           the eval checked dates. Done: code drops the model's date unle
          ss a user message contains a date phrase, and the draft then us
          es today.
      17  5. **Caught by GitHub: a real Gemini key in `.env.example`.** T
          he file is committed, so the key ended up in a local commit, an
          d none of the tests or reviews caught it. GitHub push protectio
          n blocked the push, so it never reached GitHub. Done: I removed
           the key, amended the commit and rotated the key. `server/test/
          env-example.test.ts` now fails if the file contains a key.

⏺ Update(README.md)
  ⎿  Added 1 line, removed 1 line
      42  - **Agent (`server/src/agent/`):** a Gemini function-calling lo
          op, capped at 5 tool calls per message. It asks a question when
           something is unclear, and guardrails check the model's output 
          before a draft reaches you.
      43  - **Money logic (`server/src/domain/`):** pure functions comput
          e every share, balance and transfer in integer cents. The model
           never does this arithmetic.
      44  - **Writes:** tools create in-memory drafts with a 30-minute ex
          piry, and an expense or payment is saved only when you click Co
          nfirm. Data is stored in one JSON file, using atomic writes thr
          ough a queue.
      45 -- **Client (`client/src/`):** three columns: account summary, t
         -abs (Smart settle up, Expenses, Charts, Groups) and chat. The V
         -ite proxy forwards `/api` to the server, so the Gemini key neve
         -r reaches the browser.                                         
      45 +- **Client (`client/src/`):** three columns: account summary, t
         +abs (Smart settle up, Expenses, Charts, Groups) and chat. The V
         +ite proxy forwards `/api` to the server, and the Gemini key sta
         +ys on the server.                                              
      46  
      47  ## Key decisions
      48  [DECISIONS.md](DECISIONS.md) starts with a [summary](DECISIONS.
          md#summary) of the main decisions and of where the AI got thing
          s wrong, followed by the full log. The main decisions are:

⏺ Bash(npm test 2>&1 | tail -25; echo "exit: ${PIPESTATUS[0]}"; git status
      --short)
  ⎿  (No output)

⏺ Written for: developers or reviewers reading the repo for the first time.

  I've written README.md and added the summary to the top of DECISIONS.md. npm
  test passes: 424 server tests and 161 client tests. Nothing is committed.

  The five AI mistakes: there's one for each way of catching them:

  ┌──────────────┬──────────────────────────────────────────────────────────┐
  │  Caught by   │                         Mistake                          │
  ├──────────────┼──────────────────────────────────────────────────────────┤
  │ Test         │ The close-name threshold broke the Aroon/Arun example    │
  ├──────────────┼──────────────────────────────────────────────────────────┤
  │ Eval         │ The model guessed the third person in "split 3 ways"     │
  ├──────────────┼──────────────────────────────────────────────────────────┤
  │ Review       │ An infinite loop on a malformed date, with all 120 tests │
  │              │  passing                                                 │
  ├──────────────┼──────────────────────────────────────────────────────────┤
  │ Browser      │ The model invented dates                                 │
  │ check        │                                                          │
  ├──────────────┼──────────────────────────────────────────────────────────┤
  │ GitHub       │ A real key in .env.example                               │
  └──────────────┴──────────────────────────────────────────────────────────┘

  Please check these:
  1. Key incident: the log doesn't say who put the key in .env.example, so I
     didn't blame the AI for that. The summary only says the tests and reviews
     missed it. Reword it if the AI did add the key.
  2. Test-caught mistake: the threshold problem came up while the tests were
     being written, not from a failing test run. The summary says "caught by
     writing a test" for that reason.
  3. Eval result: the last full run on record is 14/15, from Step 4, and only
     some cases have been rerun since. The README says this rather than claiming
     a pass, and I didn't run the eval.
  4. One addition you didn't list: I added a "Step 7 lite" entry to
     DECISIONS.md, because CLAUDE.md asks for notable decisions to be logged. It
     records leaving out the manual form and screenshots, which is my reading
     of "no new features" and your README list.

  Left unchanged, but /review-step may flag them:
  - PLAN.md line 145 still lists the manual form and screenshots under Step 7.
  - CLAUDE.md gives the data path as data/db.json and says the routes are in
    index.ts. The real locations are server/data/db.json and server/src/app.ts,
    and the README uses the real path.
  - DECISIONS.md still has unfilled placeholders under "What I'd do differently"
    and "Got in the way".

❯ Thanks. Updates:
  1. Key incident: [say who added it, e.g. "I pasted the key into .env.example
  myself while updating the model"]. Reword the entry to match.
  2. Fill "Got in the way" and "What I'd do differently" with these, in my
  words: [paste the ones you chose].
  3. Fix the stale docs: the PLAN.md Step 7 line (mark the manual form and
  screenshots as cut for time), and the CLAUDE.md data path and routes
  location.
     Then stop. I'll run the full eval and update the README result myself.

⏺ Items 1 and 2 still contain the template placeholders, so I'll do item 3 now
  and come back to those.

  Read 2 files (ctrl+o to expand)

⏺ Update(PLAN.md)
  ⎿  Added 1 line, removed 1 line
      142  - **Step 4: Gemini agent** (Day 1 afternoon). Tools, loop, pro
           mpt and `/api/chat`. Tests use a mocked Gemini client and cove
           r tool dispatch, the 5-call cap, errors going back to the mode
           l, and guardrail warnings appearing on drafts. Then a manual c
           url check against real Gemini, and the eval script.
      143  - **Step 5: Chat UI + DraftCard + confirm flow** (Day 1 evenin
           g). The dinner example works end to end in the browser, and wa
           rnings and "Use Arun" are visible.
      144  - **Step 6: Three-column layout, account summary, Smart settle
            up, Expenses, Charts, optional Groups** (Day 2 morning). Merg
           es the essentials of the old Steps 6 and 7; built in parts A–E
           . See "Step 6 detail" below.
      145 -- **Step 7: Polish** (Day 2 morning). Manual expense form fall
          -back (via `POST /api/drafts` + confirm), README with setup ste
          -ps and screenshots, and DECISIONS.md brought up to date.      
      145 +- **Step 7: Polish** (Day 2 morning). README with setup steps,
          + and DECISIONS.md brought up to date. Cut for time: the manual
          + expense form fallback (via `POST /api/drafts` + confirm) and 
          +the README screenshots.                                       
      146  - **Step 8 (stretch): Deploy** the server to Render and the cl
           ient to Vercel. Render's free tier has an ephemeral disk, so t
           he JSON file would reset on restart; document this or move to 
           a free hosted database.
      147  
      148  ## Step 1 detail: shared types + split engine

⏺ Update(CLAUDE.md)
  ⎿  Added 3 lines, removed 2 lines
      16  ```
      17  shared/src/types.ts       # types shared by server and client
      18  shared/src/money.ts       # toCents, formatCents (server/src/do
          main/money.ts re-exports them)
      19 -server/src/index.ts       # Express app + routes               
      20 -server/src/store.ts       # JSON file store (data/db.json), ato
         -mic writes                                                     
      19 +server/src/index.ts       # entry point: loads config, opens th
         +e store, listens                                               
      20 +server/src/app.ts         # Express app + routes               
      21 +server/src/store.ts       # JSON file store (server/data/db.jso
         +n), atomic writes                                              
      22  server/src/drafts.ts      # in-memory drafts with TTL
      23  server/src/domain/        # split, balances, settle, summary, a
          ccount, guardrails (pure functions)
      24  server/src/agent/         # Gemini tools, loop, system prompt
⏺ Bash(git status --short; grep -n "data/db.json" PLAN.md CLAUDE.md README.md)
  ⎿  (No output)

⏺ Item 3 is done, but I haven't touched items 1 and 2 because your message still
  has the template placeholders in them. Nothing is committed, and I didn't
  rerun the tests since only docs changed.

  Done (item 3)
  - PLAN.md: the Step 7 line now marks the manual form and screenshots as cut
    for time.
  - CLAUDE.md: the data path is now server/data/db.json. Routes now point to
    server/src/app.ts, and I also updated the server/src/index.ts line to
    describe it as the entry point.

  What I need from you
  1. Key incident: who added the key? Your message still says [say who added it,
     e.g. "I pasted the key into .env.example myself while updating the
     model"]. I didn't want to record the example as fact, so if it's what
     happened, just say so.
  2. "Got in the way" and "What I'd do differently": please send the text. Your
     message has [paste the ones you chose] where it should be, and these
     sections need to be in your words, so I haven't drafted anything.

  Still stale: PLAN.md line 29 still says data/db.json. You only asked for the
  Step 7 line in that file, so I left it, but I can change it along with items 1
  and 2.

❯ 1. Key incident: I'm not certain how it got there, but most likely I pasted
  the key into .env.example myself when updating the model name, instead of
  .env. Record it that way.
  2. Got in the way (my words):
  - The agent broke my "use the edit tool" rule twice, so I made the rule
  stricter in CLAUDE.md.
  - Leftover background servers caused a confusing "missing API key" error that
  took time to debug.
  - Gemini 2.5 was retired mid-build, and the free 3.8 Flash tier only allowed
  about 20 requests a day, so I switched to Flash-Lite.
  - Flash-Lite wasn't consistent between runs, so prompt fixes alone didn't
  hold.

  What I'd do differently:
  - Put important rules in code from the start, not in the prompt.
  - Build the eval earlier, before the UI.
  - Add component tests for clicks, not just logic.
  - Add a pre-commit secret check instead of relying on GitHub.
  - Build the UI in Angular to match Sitemate's stack.

  3. Also fix PLAN.md line 29 to server/data/db.json. Then stop.

⏺ Update(DECISIONS.md)
  ⎿  Added 1 line, removed 1 line
      14  2. **Caught by the eval: the model guessed a participant (Step 
          4).** "Uber $24 Mei paid split 3 ways" should have produced a q
          uestion, but the model filled in the third person from the know
          n-people list. Reruns showed that a prompt fix didn't hold and 
          that the first code guard couldn't catch a wrong count. Done: `
          UNNAMED_PERSON` and `SPLIT_COUNT_MISMATCH` now enforce this in 
          code.
      15  3. **Caught by `/review-step`: an infinite loop behind passing 
          tests (Step 2).** All 120 tests passed, but a probe showed that
           `spendingSummary` looped forever on a malformed date (`2026-1-
          05`) and that month-only bounds silently dropped data. The test
          s had only used valid dates. Done: dates must be real YYYY-MM-D
          D dates, with regression tests.
      16  4. **Caught by my browser check: invented dates (Step 5).** Dra
          fts showed 27/10 and 26/10 on 4/11, though I never mentioned a 
          date and the prompt said to leave it out. Neither the tests nor
           the eval checked dates. Done: code drops the model's date unle
          ss a user message contains a date phrase, and the draft then us
          es today.
      17 -5. **Caught by GitHub: a real Gemini key in `.env.example`.** T
         -he file is committed, so the key ended up in a local commit, an
         -d none of the tests or reviews caught it. GitHub push protectio
         -n blocked the push, so it never reached GitHub. Done: I removed
         - the key, amended the commit and rotated the key. `server/test/
         -env-example.test.ts` now fails if the file contains a key.     
      17 +5. **Caught by GitHub: a real Gemini key in `.env.example`.** I
         +'m not certain how it got there, but most likely I pasted the k
         +ey in myself when updating the model name, instead of into `.en
         +v`. The AI's part was missing it: the file is committed, so the
         + key ended up in a local commit, and none of the tests or revie
         +ws caught it. GitHub push protection blocked the push, so it ne
         +ver reached GitHub. Done: I removed the key, amended the commit
         + and rotated the key. `server/test/env-example.test.ts` now fai
         +ls if the file contains a key.                                 
      18  
      19  ## Decisions & trade-offs
      20  - **Store data in a JSON file, not SQLite or Postgres.** For on
          e user, the simplest storage is enough: no native modules and n
          othing to set up. Trade-off: no SQL queries, so summaries are c
          omputed in memory, and free hosts with ephemeral disks would lo
          se the data. Writes are atomic (write a temp file, then rename)
           and go through a queue so concurrent writes can't corrupt the 
          file.

⏺ Update(DECISIONS.md)
  ⎿  Added 1 line, removed 1 line
      166  - Step 4 manual curl against real Gemini (scratch DB): dinner 
           → draft 2600/3800/2600 with nothing saved → confirm → balances
            −3800/−2600 → "how much does Arun owe me?" → "Arun owes you $
           38.00." With an empty key: 503 `GEMINI_NOT_CONFIGURED`, `/api/
           people` still 200.
      167  - Mutation testing in Step 3 confirmed the tests catch broken 
           confirm/restore, atomic writes and new-person id replacement. 
           Known gap: a crash mid-write isn't tested because it needs kil
           ling the process mid-write; accepted for this build.
      168  - Step 5: tests first (3 server tests failed on assertions, an
           d both client test files failed because their modules didn't e
           xist yet). Curl through the Vite proxy on a scratch database: 
           people, chat with no key → 503, draft → PATCH → confirm → bala
           nces, second confirm → 404, and a 502 with an empty plain-text
            body once the server was stopped.
      169 -- **Incident: a real Gemini key in `.env.example`.** The file 
          -is committed, so a real key ended up in a local commit. GitHub
          - push protection detected the secret and blocked the push, so 
          -it never reached GitHub. None of my tests or reviews had caugh
          -t it. Fix: I removed the key from the file, amended the commit
          - and rotated the key, because a key that has been in a commit 
          -should count as exposed. New test: `server/test/env-example.te
          -st.ts` fails if `.env.example` has any value for `GEMINI_API_K
          -EY` (including a quoted or commented-out one) or any string co
          -ntaining `AIza`. Its assertions compare booleans, so a failure
          - can't print the key, and it also runs its checks on fake valu
          -es to prove they catch a leak. `npm test` runs locally and isn
          -'t a commit hook yet, so it only helps if it's run before push
          -ing.                                                          
      169 +- **Incident: a real Gemini key in `.env.example`.** I'm not c
          +ertain how it got there, but most likely I pasted the key in m
          +yself when updating the model name, instead of into `.env`. Th
          +e file is committed, so a real key ended up in a local commit.
          + GitHub push protection detected the secret and blocked the pu
          +sh, so it never reached GitHub. None of my tests or reviews ha
          +d caught it. Fix: I removed the key from the file, amended the
          + commit and rotated the key, because a key that has been in a 
          +commit should count as exposed. New test: `server/test/env-exa
          +mple.test.ts` fails if `.env.example` has any value for `GEMIN
          +I_API_KEY` (including a quoted or commented-out one) or any st
          +ring containing `AIza`. Its assertions compare booleans, so a 
          +failure can't print the key, and it also runs its checks on fa
          +ke values to prove they catch a leak. `npm test` runs locally 
          +and isn't a commit hook yet, so it only helps if it's run befo
          +re pushing.                                                   
      170  
      171  - Step 6 Part A: tests first (9 server tests failed, plus the 
           new account test file; 2 client tests failed, plus the 2 new c
           lient test files), then 383 server and 65 client tests passed 
           with the typecheck clean. Curl through the Vite proxy on a scr
           atch database: three expenses gave owed $64 from 2, owe $25 to
            1, net +$39, and recording the three suggested payments took 
           the account to all zeros while raw `pairwiseDebts` still liste
           d debts. Chat with no key → 503. Layout, colours and real Gemi
           ni chat are left for the browser check.
      172  - Step 6 Part B: tests first (9 server and 3 client tests fail
           ed, plus the new `settleUp` test file), then 392 server and 84
            client tests passed with the typecheck clean. Curl through th
           e Vite proxy on a scratch database: "Me" gave no warning or ne
           w person, an unconfirmed or discarded draft changed nothing, a
            $10 partial left the right remainder, and recording down the 
           list reached all zeros. Clicks in the tab (Record, Discard, Cl
           ose on an expired draft) have no automated test because the cl
           ient tests render static markup, so they're left for the brows
           er check.

⏺ Update(DECISIONS.md)
  ⎿  Added 5 lines, removed 1 line
      153  
      154  ## Where AI sped me up / got in the way
      155  - Sped me up: scaffolding, the plan structure, and enumerating
            split-engine edge cases.
      156 -- Got in the way: _(log as it happens)_                       
      156 +- Got in the way:                                             
      157 +  - The agent broke my "use the edit tool" rule twice, so I ma
          +de the rule stricter in CLAUDE.md.                            
      158 +  - Leftover background servers caused a confusing "missing AP
          +I key" error that took time to debug.                         
      159 +  - Gemini 2.5 was retired mid-build, and the free 3.8 Flash t
          +ier only allowed about 20 requests a day, so I switched to Fla
          +sh-Lite.                                                      
      160 +  - Flash-Lite wasn't consistent between runs, so prompt fixes
          + alone didn't hold.                                           
      161  
      162  ## How I checked quality
      163  - Tests first for all domain logic (split, balances, settle-up
           , summary, guardrails).

⏺ Update(DECISIONS.md)
  ⎿  Added 5 lines, removed 1 line
      179  - Step 6 Part E: tests first (24 server and 5 client tests fai
           led, plus the new client `groups` test file; the rest of the n
           ew tests pinned behaviour that already held), then 419 server 
           and 157 client tests passed with the typecheck clean. Headless
            Chrome on a scratch database drove the real UI: empty state, 
           create, duplicate name, add member, an API-added expense that 
           brought Mei in on Confirm, Record payment with the group prese
           lected, the group clearing after Confirm with `groupId` saved,
            and no console errors. Chat was off, so the dropdown on an ex
           pense card was checked only by static render and API tests.
      180  
      181  ## What I'd do differently
      182 -_(Fill in at the end.)_                                       
      182 +- Put important rules in code from the start, not in the promp
          +t.                                                            
      183 +- Build the eval earlier, before the UI.                      
      184 +- Add component tests for clicks, not just logic.             
      185 +- Add a pre-commit secret check instead of relying on GitHub. 
      186 +- Build the UI in Angular to match Sitemate's stack.          

⏺ Update(PLAN.md)
  ⎿  Added 1 line, removed 1 line
      26      src/index.ts          # entry point: loads config, CORS, op
          ens the store, listen
      27      src/config.ts         # loads the repo-root .env (whatever 
          the start folder); startup line without values
      28      src/app.ts            # createApp(deps): Express routes + J
          SON error handler (testable with supertest)
      29 -    src/store.ts          # JSON file store (data/db.json): in-
         -memory cache, atomic write (tmp + rename), serialized write que
         -ue                                                             
      29 +    src/store.ts          # JSON file store (server/data/db.jso
         +n): in-memory cache, atomic write (tmp + rename), serialized wr
         +ite queue                                                      
      30      src/domain/split.ts   # computeShares(): equal | exact | pe
          rcent | shares, plus itemized adjustments
      31      src/domain/balances.ts# net balances, pairwise "who owes wh
          om"
      32      src/domain/settle.ts  # greedy settle-up (at most n−1 trans
          fers): largest creditor vs largest debtor

⏺ All three updates are in, and I'm stopping here. Nothing is committed, and I
  didn't rerun the tests since only docs changed.

  - Key incident: both the summary and the full incident entry in DECISIONS.md
    now give your account, including that you're not certain how the key got
    there.
  - "Got in the way" and "What I'd do differently": both are filled in with your
    wording unchanged.
  - PLAN.md line 29: the path is now server/data/db.json.

  Two wording points to check
  1. Key incident in the AI list: the likely cause is now your own paste, but
     the entry still sits under "times the AI got it wrong". I added "The AI's
     part was missing it" so it still fits, and you may want to check you're
     happy with that sentence.
  2. Gemini 2.5: your "Got in the way" note says it was "retired mid-build",
     while the Step 4 entry and .env.example say it's closed to new users. I
     kept your wording, but "closed to new users" is the more accurate term if
     you want the two to match.

❯ 1 is fine as written. For 2, change my wording to "closed to new users" so it
  matches. Then stop.

⏺ Update(DECISIONS.md)
  ⎿  Added 1 line, removed 1 line
      156  - Got in the way:
      157    - The agent broke my "use the edit tool" rule twice, so I ma
           de the rule stricter in CLAUDE.md.
      158    - Leftover background servers caused a confusing "missing AP
           I key" error that took time to debug.
      159 -  - Gemini 2.5 was retired mid-build, and the free 3.8 Flash t
          -ier only allowed about 20 requests a day, so I switched to Fla
          -sh-Lite.                                                      
      159 +  - Gemini 2.5 was closed to new users mid-build, and the free
          + 3.8 Flash tier only allowed about 20 requests a day, so I swi
          +tched to Flash-Lite.                                          
      160    - Flash-Lite wasn't consistent between runs, so prompt fixes
            alone didn't hold.
      161  
      162  ## How I checked quality

⏺ I changed that line in DECISIONS.md; it now reads "Gemini 2.5 was closed to
  new users mid-build". Nothing is committed.

❯ npm run eval -w server'

⏺ Running the full eval against real Gemini, ignoring the stray quote at the
  end. It uses a temporary database and some of your free quota.

⏺ Bash(npm run eval -w server 2>&1 | tail -120)
  ⎿  Running in the background (↓ to manage)
  ⎿  (timeout 10m)

⏺ The eval is now running in the background, since you backgrounded it. I'll
  report the results when it finishes.

⏺ Background command "Run the full Gemini eval" completed (exit code 0)

  Read 1 file (ctrl+o to expand)

⏺ The full eval passed 15/15 against gemini-3.5-flash-lite, in a single run.
  This replaces the 14/15 from Step 4, including #2 ("split 3 ways"), which now
  asks who the third person is. I haven't changed any files, and the README
  still says 14/15 for you to update.

  Passes where the model's first attempt failed (no bad draft came out of any of
  them):
  - #7 and #14: the first create_expense_draft call failed validation, and the
    retry worked. #7 left out description and category, and #14 left out
    description. These retries use up some of the 5 tool calls and your free
    quota.
  - #7 schema guess: DECISIONS.md says clearer schema descriptions were a guess
    at fixing #7's failed first call. This run suggests they didn't fix it.
  - #9: the model tried a $0 draft for "Dinner with Arun and Mei". The server
    rejected it, and the model then asked for the amount and payer, which is
    what the case expects.

  What to keep in mind when you update the README:
  - One run only: Flash-Lite varies between runs, so --repeat 3 would show how
    consistent this is, at about three times the quota.
  - The "Eval gaps" bullet: it needs more than the new score, because it also
    says only some cases were rerun since Step 4. "It doesn't check dates" is
    still true, so that part should stay.

❯ Update the README eval line: 15/15 on the final full run (single run,
  gemini-3.5-flash-lite); #7, #9 and #14 pass after the model self-corrects
  from a rejected first call. Keep "doesn't check dates". Then stop.

⏺ Update(README.md)
  ⎿  Added 1 line, removed 1 line
      64  - **Groups are basic.** Groups and members can't be renamed or 
          removed, and the agent can't assign a group; you choose it on t
          he draft card.
      65  - **Tab switches lose state.** Filters reset and an open Record
           payment card closes. Nothing is saved by accident.
      66  - **Test gaps.** Client tests cover pure logic, fetch wrappers 
          and static rendering, so clicks and layout were only checked by
           hand. A crash in the middle of a write isn't tested.
      67 -- **Eval gaps.** The last full eval on record scored 14/15, at 
         -Step 4. The agent has changed since then, including guards adde
         -d for that failure, and only some cases were rerun, so run it a
         -gain for a current result. It doesn't check dates.             
      67 +- **Eval gaps.** The final full run scored 15/15 (single run, `
         +gemini-3.5-flash-lite`). #7, #9 and #14 pass after the model se
         +lf-corrects from a rejected first call. The eval doesn't check 
         +dates.                                                         
      68  
      69  The full list is in [DECISIONS.md](DECISIONS.md).

⏺ I've updated the eval line in README.md with the 15/15 result, the three
  self-correcting cases and "doesn't check dates". Nothing is committed.

❯ Read CLAUDE.md and PLAN.md. Plan a storage enhancement with no regressions:
  - Add a MongoDB Atlas store (official mongodb driver) behind the SAME store
  interface as the JSON store, chosen by an env var (STORE=json|mongo,
  MONGODB_URI). JSON stays the default so local dev and all existing tests keep
  working.
  - Run the existing store contract tests against BOTH stores (use
  mongodb-memory-server for tests, no real DB in tests).
  - Keep confirm all-or-nothing, and keep "a failed write changes nothing"
  semantics.
  - Add indexes for common queries (expenses by date, by groupId) and avoid
  loading everything where a query can filter.
  - Add a one-off migration script from db.json to Mongo.
  - Never print or commit MONGODB_URI; add it to .env.example as empty, and
  extend the env-example guard test.
    List files, tests and checks. Don't write code yet.

⏺ I'll start with the current store interface and how the code uses it, because
  the plan depends on both.

⏺ Bash(git status --short; git log --oneline | head -3; cat server/src/store.ts;
      cat server/src/index.ts; ls server/test server/scripts; wc -l
      server/test/*; cat serve…)
  ⎿  (No output)

⏺ Bash(cat server/test/store.test.ts; cat server/src/app.ts; grep -n "interface
      Expense\|interface Settlement\|interface Group\b\|interface
      Person\|interface Database\…)
  ⎿  (No output)

⏺ The store's snapshot() is synchronous, which conflicts with your
  same-interface and avoid-loading-everything requirements. I'm checking the
  callers, what can be filtered, and the package constraints next.

⏺ Bash(echo "--- store uses (src/scripts)"; grep -rnE
      "store\.(snapshot|update|path)|openStore|: Store\b" server/src
      server/scripts | grep -v "^server/src/store.ts" |…)
  ⎿  Error: Exit code 1
     --- store uses (src/scripts)
     server/src/app.ts:31:  store: Store;
     server/src/app.ts:141:    res.json(store.snapshot().people);
     server/src/app.ts:155:    const { people, groups } = store.snapshot();
     server/src/app.ts:169:    const { people, groups } = store.snapshot();
     server/src/app.ts:182:      const result = await store.update((db) => {
     server/src/app.ts:205:    const expenses: Expense[] =
     newestFirst(store.snapshot().expenses, (e) => e.createdAt);
     server/src/app.ts:217:    const stored =
     store.snapshot().settlements.map((s, index) => ({ s, index, date: s.date
     }));
     server/src/app.ts:223:    const { people, expenses, settlements } =
     store.snapshot();
     … +184 lines (ctrl+o to expand)
⏺ Bash(cut -c1-130 server/src/domain/summary.ts | sed -n 1,70p; grep -n
      "groupSummary" -A18 server/src/domain/account.ts | cut -c1-130 | sed -n
      1,30p; sed -n 208,216p…)
  ⎿  (No output)

  Searched for 1 pattern (ctrl+o to expand)

⏺ Plan: MongoDB Atlas store (nothing written yet)

  One requirement needs your decision. snapshot() is synchronous and returns the
  whole database, so a Mongo store can only implement it from an in-memory
  cache. That means "same interface" and "avoid loading everything" can't both
  fully hold.

  Decision 1: how to handle the conflict

  ┌────────────┬───────────────────────────┬───────────────────────────────┐
  │            │   A: cache + filtered     │ B: make the store async, no   │
  │            │   queries (recommended)   │             cache             │
  ├────────────┼───────────────────────────┼───────────────────────────────┤
  │            │ snapshot() and update()   │                               │
  │ Interface  │ unchanged, two read       │ Every read becomes await      │
  │            │ methods added             │                               │
  ├────────────┼───────────────────────────┼───────────────────────────────┤
  │ Files      │ app.ts summary route only │ 14 read sites in app.ts, 7 in │
  │ touched    │                           │  agent/, sync runTool         │
  ├────────────┼───────────────────────────┼───────────────────────────────┤
  │ Existing   │ Untouched                 │ About 35 snapshot() lines     │
  │ tests      │                           │ edited                        │
  ├────────────┼───────────────────────────┼───────────────────────────────┤
  │            │ Everything once at        │ Every request; each dashboard │
  │ Loading    │ startup                   │  refresh makes 7 calls, and   │
  │            │                           │ most need all records         │
  └────────────┴───────────────────────────┴───────────────────────────────┘

  I recommend A, but it has limits:
  - Little gain from filtering today: balances, settle-up and the account
    summary need every record anyway. The UI also calls /api/summary with no
    range.
  - Only one filtered read: GET /api/summary?from&to would use the date index.
    The agent's summary tool stays on snapshot() because runTool is sync.
  - groupId index has no caller: it would be built and tested, but /api/groups
    already works from the cached data. A query per group would be slower.
  - One server process only: a second process would read stale data. In-memory
    drafts already have this limit.

  Design (option A)

  - Selection: STORE=json is the default. STORE=mongo without a URI, or an
    unknown value, stops startup with a clear error and never falls back to
    JSON. The mongodb driver is only loaded in Mongo mode.
  - Added to Store: findExpenses({ from, to, groupId }), findSettlements({
    groupId }) and close(). path becomes a safe label, mongodb:splitbot, and the
    database name is a constant, so there's no new env var.
  - Data shape: collections are people, expenses, settlements, groups and meta.
    - Order: each document stores its list position (seq), because settlement
      order is the "recorded later" tie-break and has no createdAt.
    - Optional fields: ignoreUndefined stops a missing groupId being saved as
      null.
  - Keeping confirm all-or-nothing:
    a. update(fn) runs fn once on a copy, before the transaction starts.
    b. It works out the changes and applies them in one transaction.
    c. The cache only changes after the commit.
  - Uncertain commits: each transaction writes its ID to meta. If a commit fails
    with an unknown result, the store reads that ID back to see if it applied.
    Otherwise a retry could save a duplicate expense.
  - Other writers: a revision number in meta detects them. The write is rejected
    and the cache reloaded, rather than overwriting their data.
  - Atlas down: reads keep serving cached data and writes return a 500 with the
    draft restored. Each operation is limited to about 15 seconds.

  Files

  ┌─────────────────────────────────────┬───────────────────────────────────┐
  │                File                 │              Change               │
  ├─────────────────────────────────────┼───────────────────────────────────┤
  │ server/src/store-mongo.ts           │ New: openMongoStore, with test    │
  │                                     │ hooks like StoreFs                │
  ├─────────────────────────────────────┼───────────────────────────────────┤
  │                                     │ Add the interface methods and     │
  │ server/src/store.ts                 │ JSON versions, and extract        │
  │                                     │ parseDb so the migration can      │
  │                                     │ validate without writing          │
  ├─────────────────────────────────────┼───────────────────────────────────┤
  │ server/src/store-select.ts          │ New: reads the env vars and picks │
  │                                     │  the store                        │
  ├─────────────────────────────────────┼───────────────────────────────────┤
  │                                     │ Use the selector, close the store │
  │ server/src/index.ts, config.ts      │  on shutdown, and log whether the │
  │                                     │  URI is set without showing it    │
  ├─────────────────────────────────────┼───────────────────────────────────┤
  │                                     │ The summary route uses            │
  │ server/src/app.ts                   │ findExpenses when a range is      │
  │                                     │ given                             │
  ├─────────────────────────────────────┼───────────────────────────────────┤
  │                                     │ New: the migration, run with npm  │
  │ server/scripts/migrate-to-mongo.ts  │ run migrate:mongo -w server --    │
  │                                     │ [--dry-run]                       │
  ├─────────────────────────────────────┼───────────────────────────────────┤
  │ .env.example, package.jsons,        │ STORE=json, empty MONGODB_URI,    │
  │ lockfile                            │ the new packages, and Node        │
  │                                     │ >=20.19 (required by mongodb 7.8) │
  ├─────────────────────────────────────┼───────────────────────────────────┤
  │ README.md, PLAN.md, CLAUDE.md,      │ Setup, the new step, the stack    │
  │ DECISIONS.md                        │ line, decisions and limitations   │
  └─────────────────────────────────────┴───────────────────────────────────┘

  Migration safety:
  - It's read-only on db.json, and a missing file is an error rather than a new
    empty database.
  - It refuses a target that holds anything beyond the seeded me, and there's no
    --force.
  - It writes in one transaction, then reads everything back and compares it,
    including cent totals.
  - It prints counts only.

  Tests (written first, confirmed failing)

  store.test.ts has file-specific assertions, so it isn't really a contract
  suite yet. I'd leave it unedited and port its behaviours into a new suite,
  which duplicates a few cases but means no existing test changes.

  store.contract.test.ts, run against both stores:
  - Seeding, and adding me if missing (from #1, #6)
  - Round trip after reopening, with data intact (#2, #129)
  - snapshot() returns a copy (#3)
  - Wrong-shaped data is rejected and left alone (#5, #130)
  - A failed write changes nothing, and the next write succeeds (#7, #8)
  - A throwing fn keeps its original error (#9)
  - 50 concurrent updates apply in order (#10)
  - No groups field appears on older data (#128)
  - find* filters match in-memory filtering, including inclusive date bounds
  - Reads immediately see a committed write

  store-mongo.test.ts, on MongoMemoryReplSet (a plain memory server can't run
  transactions):
  - A failure after the writes but before commit rolls back across collections.
  - Uncertain commits resolve correctly both ways.
  - An outside writer is detected.
  - Awkward values survive: a person named constructor as a split-map key, and a
    missing groupId.
  - explain() shows index scans for the date and groupId queries.
  - Indexes are created on expenses (date, groupId + date) and settlements
    (date, groupId).
  - A database with bad documents fails on open.
  - A fake password never appears in errors or logs.

  Other new or extended tests:
  - store-api.contract.test.ts, both stores: draft → confirm → balances → delete
    → reopen. Also a confirm that adds a new person and joins a group, made to
    fail, leaving nothing saved and the draft restored.
  - store-select.test.ts: default, invalid values and a missing URI.
  - migrate.test.ts: success, dry run, non-empty target, bad or missing file,
    and a mid-way failure leaving nothing behind.
  - env-example.test.ts, additions only: MONGODB_URI must be empty, and no
    mongodb:// or mongodb+srv:// may appear anywhere. Fake URIs are built by
    joining strings, so GitHub's secret scanning doesn't flag them.

  Checks

  1. npm test and npm run typecheck pass, with the existing 424 server and 161
     client tests still passing.
  2. git diff shows no changes to existing test files except additions to
     env-example.test.ts.
  3. Mutation checks each fail a test: drop the session from one write, update
     the cache before commit, and remove ignoreUndefined.
  4. JSON mode behaves as before with no STORE set, and mongodb isn't loaded.
  5. A secrets scan of tracked files and the diff finds no URI, and test runs
     leave no mongod process behind.
  6. Atlas check, which you'd do with your own URI: migrate, compare balances to
     JSON mode, restart, and confirm a real expense. This is also what confirms
     transactions work on the free tier, which I haven't verified.

  Behaviour changes to accept

  - First test run needs network: mongodb-memory-server downloads a MongoDB
    binary during install, so the README's "no network" line changes. Offline,
    the Mongo tests would fail rather than skip, because a silent skip could
    hide a regression.
  - Slower tests: the server suite takes under a second today and will take
    several seconds.
  - Summary validation narrows: with a date range, only in-range expenses get
    validated, so a bad date outside the range no longer causes a 400. That can
    only come from a hand-edited database, and it applies to both stores.

  Questions before I start

  1. Which option, A or B? I recommend A. B only makes sense if you plan to run
     several server processes, and that would also need shared drafts.
  2. Are you OK with the first-run download and Mongo tests failing offline? I
     recommend yes, since you asked for both stores to be tested.
  3. Can this be Step 9, leaving the Step 8 deploy as is? That keeps the
     numbering stable, though it would be built before the deploy.
  4. Will you commit the Step 7 docs first? README.md, DECISIONS.md, PLAN.md and
     CLAUDE.md are still uncommitted, and this step shouldn't get mixed in with
     them.

❯ <ide_opened_file>The user opened the file
  /Users/jarvis/Projects/splitbot/.env in the IDE. This may or may not be
  related to the current task.</ide_opened_file>

❯ Option A, with one change for Vercel: add an Express middleware that, before
  each /api request, awaits a cheap revision check against meta and reloads the
  cache only if another instance has written. This keeps snapshot() sync and
  works across serverless instances. Add a test with two store instances on the
  same database: a write through one is seen by the other on the next request.

  Answers:
  - Yes to the first-run download and Mongo tests failing offline.
  - Call it Step 9 and keep Step 8 for deploy.
  - Step 7 docs are committed; we're on a fresh mongo branch.
    Cut for time: skip the migration script (I'll start with fresh data) and
  the explain() index tests. Keep the indexes, transactions, uncertain-commit
  check and the env-example guard additions.
    Tests first, file edit tool only, stop servers after checks, then stop for
  my review.

⏺ Starting with Option A plus the revision check. First I'll check the branch
  and the docs that changed on disk. I won't open .env.

⏺ Bash(git branch --show-current; git status --short; git log --oneline | head
      -5; grep -n "index.ts\|store.ts" CLAUDE.md; git log -3 --format='%h %s' --
      CLAUDE.md; gi…)
  ⎿  (No output)

  Read 1 file (ctrl+o to expand)

⏺ README.md isn't on this branch, and HEAD is still the Step 6 export, which
  doesn't match "Step 7 docs are committed". I'm checking where the docs went
  before building on this base.

⏺ Bash(git branch -avv | cut -c1-120; echo ---all; git log --all --format='%h %d
      %s (%cr)' | head -8; echo ---stash; git stash list; echo ---reflog; git
      reflog -12 --f…)
  ⎿  (No output)

⏺ mongo was cut before your Step 7 commit reached main, so I'll fast-forward it
  locally, with no push, and then read the test conventions.

⏺ Bash(git merge --ff-only main 2>&1 | tail -2; git log --oneline | head -2; git
      status --short; grep -n "index.ts\|store.ts" CLAUDE.md; sed -n 1,45p
      server/test/api.t…)
  ⎿  Updated CLAUDE.md (+3 -2)
  ⎿  Updated DECISIONS.md (+28 -3)
  ⎿  Updated PLAN.md (+2 -2)
  ⎿  Created README.md (+69 -0)
  ⎿  (a git step in this command can move the working tree, so these may be
     its changes, not edits) (ctrl+o to expand)

  Read 2 files (ctrl+o to expand)

⏺ The branch is now on the Step 7 commit. Next I'll add the packages, which also
  downloads the MongoDB test binary, and then write the tests before any
  implementation.

⏺ Update(server/package.json)
  ⎿  Added 1 line
      15      "cors": "^2.8.6",
      16      "dotenv": "^18.0.9",
      17      "express": "^5.3.0",
      18 +    "mongodb": "^7.8.0",                                       
      19      "nanoid": "^5.1.16",
      20      "zod": "^4.6.7"
      21    },

⏺ Update(server/package.json)
  ⎿  Added 1 line
      24      "@types/express": "^5.0.6",
      25      "@types/node": "^26.6.6",
      26      "@types/supertest": "^7.2.1",
      27 +    "mongodb-memory-server": "^11.3.0",                        
      28      "supertest": "^7.3.1",
      29      "tsx": "^4.23.15",
      30      "typescript": "^7.0.2",

⏺ Update(package.json)
  ⎿  Added 1 line, removed 1 line
       4    "private": true,
       5    "description": "Splitwise-style expense splitting driven by p
          lain-English chat and a Gemini agent",
       6    "engines": {
       7 -    "node": ">=20"                                             
       7 +    "node": ">=20.19"                                          
       8    },
       9    "workspaces": [
      10      "shared",

⏺ Write(server/test/mongo-helper.ts)
  ⎿  Wrote 51 lines to server/test/mongo-helper.ts
      1 // A real mongod for the tests (a replica set, because transactio
        ns need one), and raw access that skips the store.
      2 import { MongoClient, type Document } from 'mongodb';
      3 import { MongoMemoryReplSet } from 'mongodb-memory-server';
      4
      5 /** Long enough for the first run's binary check and for mongod t
        o start. */
      6 export const MONGO_START_TIMEOUT_MS = 120_000;
      7 export const MONGO_TEST_TIMEOUT_MS = 30_000;
      8
     … +43 lines (ctrl+o to expand)

⏺ Bash(npm install 2>&1 | tail -8; git status --short; ls
      ~/.cache/mongodb-binaries node_modules/.cache/mongodb-memory-server
      2>/dev/null | head; npm ls mongodb mongod…)
  ⎿  1 file changed (binary, mode only or too large to show)
  ⎿  (timeout 6m 40s)

⏺ The binary is installed. Now the test files.

⏺ Write(server/test/mongo-helper.ts)
  ⎿  Added 4 lines, removed 2 lines
      1  // A real mongod for the tests (a replica set, because transacti
         ons need one), and raw access that skips the store.
      2 -import { MongoClient, type Document } from 'mongodb';           
      2 +import { MongoClient, type Db as MongoDb, type Document } from '
        +mongodb';                                                       
      3  import { MongoMemoryReplSet } from 'mongodb-memory-server';
      4  
      5  /** Long enough for the first run's binary check and for mongod 
         to start. */
     ...
      14    uri: string;
      15    /** A database name no other test uses. */
      16    freshDbName(): string;
      17 +  /** Direct access, for changing data the way another writer w
         +ould. */                                                       
      18 +  db(dbName: string): MongoDb;                                 
      19    /** Inserts records as stored documents: `id` → `_id`, list p
          osition → `seq`. */
      20    seed(dbName: string, data: Record<string, Document[]>): Promi
          se<void>;
      21    /** Every collection's documents in stored order, for compari
          ng before and after. */
      22    read(dbName: string): Promise<Record<string, Document[]>>;
      21 -  /** Changes a stored person and bumps the revision, as anothe
         -r writer would. */                                             
      23    stop(): Promise<void>;
      24  }
      25  
     ...
      30    return {
      31      uri,
      32      freshDbName: () => `splitbot_test_${process.pid}_${++dbCoun
          ter}`,
      33 +    db: (dbName) => client.db(dbName),                         
      34      async seed(dbName, data) {
      35        for (const [name, records] of Object.entries(data)) {
      36          if (records.length === 0) continue;

⏺ Write(server/test/store-harness.ts)
  ⎿  Wrote 80 lines to server/test/store-harness.ts
       1 // One way to drive either store, so the contract tests can run
         the same cases against both.
       2 import { mkdir, readFile, rename, writeFile } from 'node:fs/prom
         ises';
       3 import { join } from 'node:path';
       4 import type { Document } from 'mongodb';
       5 import { openStore, type Store } from '../src/store';
       6 import { openMongoStore } from '../src/store-mongo';
       7 import { tempDir } from './helpers';
       8 import type { TestMongo } from './mongo-helper';
     … +72 lines (ctrl+o to expand)

⏺ Write(server/test/store.contract.test.ts)
  ⎿  Wrote 229 lines to server/test/store.contract.test.ts
       1 // The behaviour every store must have. store.test.ts keeps the
         JSON file's own details (paths, .tmp files, corrupt JSON).
       2 import { afterAll, afterEach, beforeAll, beforeEach, describe, e
         xpect, it } from 'vitest';
       3 import { expense, settlement } from './helpers';
       4 import { MONGO_START_TIMEOUT_MS, MONGO_TEST_TIMEOUT_MS, startMon
         go, type TestMongo } from './mongo-helper';
       5 import { jsonHarness, mongoHarness, type StoreHarness } from './
         store-harness';
       6
     … +223 lines (ctrl+o to expand)

⏺ Write(server/test/store-api.contract.test.ts)
  ⎿  Wrote 124 lines to server/test/store-api.contract.test.ts
       1 // The REST flows that depend on the store, against both stores.
       2 import request from 'supertest';
       3 import { afterAll, afterEach, beforeAll, beforeEach, describe, e
         xpect, it } from 'vitest';
       4 import type { Store } from '../src/store';
       5 import { createApp } from '../src/app';
       6 import { createDraftStore } from '../src/drafts';
       7 import { MONGO_START_TIMEOUT_MS, MONGO_TEST_TIMEOUT_MS, startMon
         go, type TestMongo } from './mongo-helper';
       8 import { jsonHarness, mongoHarness, type StoreHarness } from './
     … +117 lines (~5 KB) (ctrl+o to expand)

⏺ Write(server/test/store-mongo.test.ts)
  ⎿  Wrote 311 lines to server/test/store-mongo.test.ts
       1 // What only the Mongo store has: transactions, uncertain commit
         s, several instances on one database, and URI secrecy.
       2 import request from 'supertest';
       3 import { afterAll, afterEach, beforeAll, describe, expect, it, v
         i } from 'vitest';
       4 import type { Store } from '../src/store';
       5 import { createApp } from '../src/app';
       6 import { createDraftStore } from '../src/drafts';
       7 import { StoreConflictError, StoreError } from '../src/store';
       8 import { openMongoStore, type MongoStoreOptions } from '../src/s
     … +304 lines (~13 KB) (ctrl+o to expand)

⏺ Write(server/test/store-select.test.ts)  ⎿  Wrote 45 lines to server/test/store-select.test.ts
       1 import { join } from 'node:path';
       2 import { afterEach, beforeEach, describe, expect, it } from 'vit
         est';
       3 import { openConfiguredStore, storeConfigFromEnv } from '../src/
         store-select';
       4 import { tempDir } from './helpers';
       5
       6 const JSON_PATH = '/data/db.json';
       7
       8 describe('storeConfigFromEnv', () => {
     … +37 lines (ctrl+o to expand)

⏺ Update(server/test/env-example.test.ts)
  ⎿  Added 13 lines
      16  
      17  const hasGoogleKeyPrefix = (text: string) => text.includes('AIz
          a');
      18  
      19 +/** Any MONGODB_URI line with a value, including a commented-ou
         +t or quoted one. An inline comment isn't a value. */           
      20 +function hasUriValue(text: string): boolean {                  
      21 +  return text.split('\n').some((line) => {                     
      22 +    const match = line.match(/^\s*(?:#\s*)?(?:export\s+)?MONGOD
         +B_URI\s*=(.*)$/);                                              
      23 +    if (!match) return false;                                  
      24 +    const value = match[1]!.replace(/(^|\s)#.*$/, '').trim();  
      25 +    return value.replace(/^(['"])(.*)\1$/, '$2').trim() !== '';
      26 +  });                                                          
      27 +}                                                              
      28 +                                                               
      29 +/** A connection string anywhere in the file, even in a comment
         +. */                                                           
      30 +const hasMongoScheme = (text: string) => /mongodb(\+srv)?:\/\//
         +i.test(text);                                                  
      31 +                                                               
      32  describe('.env.example', () => {
      33    it('has an empty GEMINI_API_KEY', async () => {
      34      const text = await readFile(resolve(REPO_ROOT, '.env.exampl
          e'), 'utf8');

⏺ Update(server/test/env-example.test.ts)
  ⎿  Added 11 lines
      40      const text = await readFile(resolve(REPO_ROOT, '.env.exampl
          e'), 'utf8');
      41      expect(hasGoogleKeyPrefix(text), '.env.example contains a s
          tring starting with "AIza"; remove it and rotate the key').toBe
          (false);
      42    });
      43 +                                                               
      44 +  it('has an empty MONGODB_URI', async () => {                 
      45 +    const text = await readFile(resolve(REPO_ROOT, '.env.exampl
         +e'), 'utf8');                                                  
      46 +    expect(/^MONGODB_URI=/m.test(text), '.env.example should st
         +ill document MONGODB_URI').toBe(true);                         
      47 +    expect(hasUriValue(text), '.env.example has a value for MON
         +GODB_URI; it must stay empty').toBe(false);                    
      48 +  });                                                          
      49 +                                                               
      50 +  it('has no MongoDB connection string', async () => {         
      51 +    const text = await readFile(resolve(REPO_ROOT, '.env.exampl
         +e'), 'utf8');                                                  
      52 +    expect(hasMongoScheme(text), '.env.example contains a Mongo
         +DB connection string; remove it and change the password').toBe(
         +false);                                                        
      53 +  });                                                          
      54  });
      55  
      56  describe('the checks catch a leak (fake values)', () => {

⏺ Update(server/test/env-example.test.ts)
  ⎿  Added 24 lines
       74      }
       75      expect(hasGoogleKeyPrefix('GEMINI_MODEL=gemini-3.5-flash-l
           ite')).toBe(false);
       76    });
       77 +                                                              
       78 +  it.each(['MONGODB_URI=abc', 'MONGODB_URI = abc', ' export MO
          +NGODB_URI=abc', 'MONGODB_URI="abc"', "MONGODB_URI='abc'", '# M
          +ONGODB_URI=abc', 'A=1\nMONGODB_URI=abc\nB=2'])(               
       79 +    'a URI value is caught: %s',                              
       80 +    (text) => {                                               
       81 +      expect(hasUriValue(text)).toBe(true);                   
       82 +    },                                                        
       83 +  );                                                          
       84 +                                                              
       85 +  it.each(['MONGODB_URI=', 'MONGODB_URI= ', 'MONGODB_URI=""', 
          +"MONGODB_URI=''", 'MONGODB_URI= # paste yours in .env', '# Cop
          +y MONGODB_URI to .env', 'STORE=mongo', ''])(                  
       86 +    'no URI value is fine: %j',                               
       87 +    (text) => {                                               
       88 +      expect(hasUriValue(text)).toBe(false);                  
       89 +    },                                                        
       90 +  );                                                          
       91 +                                                              
       92 +  it('a connection string is caught anywhere in the file', () 
          +=> {                                                          
       93 +    // Joined at runtime so these can't look like real connect
          +ion strings in the repo.                                      
       94 +    for (const scheme of ['mongodb', 'mongodb+srv', 'MONGODB']
          +) {                                                           
       95 +      for (const text of [`${scheme}://x`, `OTHER=${scheme}://
          +x`, `# old: ${scheme}://x`]) {                                
       96 +        expect(hasMongoScheme(text), text).toBe(true);        
       97 +      }                                                       
       98 +    }                                                         
       99 +    expect(hasMongoScheme('# MongoDB Atlas connection string; 
          +only used when STORE=mongo')).toBe(false);                    
      100 +  });                                                         
      101  });

⏺ Bash(npm install 2>&1 | grep -A6 EBADENGINE | head -12; npm test -w server
      2>&1 | grep -vE "^\s*$|❯|→" | grep -E "FAIL|Test Files|Tests |Error:" |
      cut -c1-130 | sort…)
  ⎿  (No output)

⏺ The new tests fail for the right reasons and the 441 others still pass. Now
  the implementation.

⏺ Update(server/src/store.ts)
  ⎿  Added 2 lines, removed 1 line
      1 -// JSON file store (data/db.json): an in-memory cache, atomic wr
        -ites (tmp file + rename) and a serialized write queue.          
      1 +// JSON file store (server/data/db.json): an in-memory cache, at
        +omic writes (tmp file + rename) and a serialized write queue.   
      2 +// Also the Store interface that the Mongo store (store-mongo.ts
        +) implements too.                                               
      3  import * as nodeFs from 'node:fs/promises';
      4  import { dirname } from 'node:path';
      5  import { z } from 'zod';

⏺ Update(server/src/store.ts)
  ⎿  Added 29 lines
      14    groups?: Group[];
      15  }
      16  
      17 +/** Inclusive YYYY-MM-DD bounds and a group; a field left out d
         +oesn't filter. */                                              
      18 +export interface ExpenseFilter {                               
      19 +  from?: string;                                               
      20 +  to?: string;                                                 
      21 +  groupId?: string;                                            
      22 +}                                                              
      23 +                                                               
      24 +export interface SettlementFilter {                            
      25 +  groupId?: string;                                            
      26 +}                                                              
      27 +                                                               
      28  export interface Store {
      29 +  /** Where the data lives, safe to log. */                    
      30    readonly path: string;
      31    /** A deep copy of the current data. */
      32    snapshot(): Db;
     ...
      35     * The cache changes only after the write succeeds; if `fn` o
          r the write throws, nothing changes.
      36     */
      37    update<T>(fn: (db: Db) => T): Promise<T>;
      38 +  /** Matching expenses, in stored order. */                   
      39 +  findExpenses(filter: ExpenseFilter): Promise<Expense[]>;     
      40 +  /** Matching settlements, in stored order. */                
      41 +  findSettlements(filter: SettlementFilter): Promise<Settlement
         +[]>;                                                           
      42 +  /** Picks up writes made by another instance. Never rejects: 
         +on failure the last known data stays in use. */                
      43 +  refresh(): Promise<void>;                                    
      44 +  close(): Promise<void>;                                      
      45  }
      46  
      47 +/** A storage failure. The message is safe to log: it never hol
         +ds a connection string. */                                     
      48 +export class StoreError extends Error {                        
      49 +  override readonly name: string = 'StoreError';               
      50 +}                                                              
      51 +                                                               
      52 +/** Another instance wrote first, so this write was refused. Re
         +trying works on the fresh data. */                             
      53 +export class StoreConflictError extends StoreError {           
      54 +  override readonly name = 'StoreConflictError';               
      55 +}                                                              
      56 +                                                               
      57  /** The file operations the store uses; tests replace some of t
          hem to simulate failures. */
      58  export interface StoreFs {
      59    readFile(path: string, encoding: 'utf8'): Promise<string>;

⏺ Update(server/src/store.ts)
  ⎿  Added 1 line, removed 1 line
      63    mkdir(path: string, options: { recursive: true }): Promise<un
          known>;
      64  }
      65  
      66 -const ME: Person = { id: ME_ID, name: 'Me' };                  
      66 +export const ME: Person = { id: ME_ID, name: 'Me' };           
      67  
      68  const PersonSchema = z.object({ id: z.string(), name: z.string(
          ) });
      69  const ExpenseSchema = z.object({

⏺ Update(server/src/store.ts)
  ⎿  Added 1 line, removed 1 line
      87    groupId: z.string().optional(),
      88  });
      89  const GroupSchema = z.object({ id: z.string(), name: z.string()
          , memberIds: z.array(z.string()) });
      90 -const DbSchema = z.object({                                    
      90 +export const DbSchema = z.object({                             
      91    version: z.literal(1),
      92    people: z.array(PersonSchema),
      93    expenses: z.array(ExpenseSchema),

⏺ Update(server/src/store.ts)
  ⎿  Added 10 lines
      158        queue = run.catch(() => undefined);
      159        return run;
      160      },
      161 +    findExpenses: async ({ from, to, groupId }) =>            
      162 +      structuredClone(                                        
      163 +        cache.expenses.filter(                                
      164 +          (e) => (from === undefined || e.date >= from) && (to
          + === undefined || e.date <= to) && (groupId === undefined || e
          +.groupId === groupId),                                        
      165 +        ),                                                    
      166 +      ),                                                      
      167 +    findSettlements: async ({ groupId }) => structuredClone(ca
          +che.settlements.filter((s) => groupId === undefined || s.group
          +Id === groupId)),                                             
      168 +    // Only this process writes the file.                     
      169 +    refresh: async () => undefined,                           
      170 +    close: async () => undefined,                             
      171    };
      172  }

⏺ Write(server/src/store-mongo.ts)
  ⎿  Wrote 270 lines to server/src/store-mongo.ts
      1 // MongoDB store: the same Store as the JSON file. snapshot() is
        sync, so it reads an in-memory cache of everything.
      2 // A revision number in `meta` tells instances apart: refresh() r
        eloads when another instance has written,
      3 // and a write from stale data is refused. Each update is one tra
        nsaction; the cache changes only after it commits.
      4 import { randomUUID } from 'node:crypto';
      5 import { isDeepStrictEqual } from 'node:util';
      6 import { MongoClient, type AnyBulkWriteOperation, type ClientSess
        ion, type Collection, type Filter } from 'mongodb';
     … +264 lines (ctrl+o to expand)

⏺ Write(server/src/store-select.ts)
  ⎿  Wrote 22 lines to server/src/store-select.ts
       1 // Picks the store from the environment. JSON is the default; a
         bad setting stops startup instead of falling back,
       2 // because falling back would quietly save to the wrong place.
       3 import { openStore, type Store } from './store';
       4
       5 export type StoreConfig = { kind: 'json'; path: string } | { kin
         d: 'mongo'; uri: string };
       6
       7 export function storeConfigFromEnv(env: Record<string, string |
         undefined>, jsonPath: string): StoreConfig {
     … +15 lines (ctrl+o to expand)

⏺ Update(server/src/app.ts)
  ⎿  Added 5 lines
      133  export function createApp(deps: AppDeps): express.Express {
      134    const { store, drafts, today, now = Date.now, log = (m) => c
           onsole.error(m), agent } = deps;
      135    const app = express();
      136 +  // Routes read the store's cache synchronously, so another i
          +nstance's writes are picked up before they run.               
      137 +  app.use('/api', async (_req, _res, next) => {               
      138 +    await store.refresh();                                    
      139 +    next();                                                   
      140 +  });                                                         
      141    app.use(express.json());
      142  
      143    const send = (res: Response, status: number, body?: unknown)
            => (body === undefined ? res.status(status).end() : res.statu
           s(status).json(body));

⏺ Update(server/src/app.ts)
  ⎿  Added 3 lines, removed 2 lines
      293      res.json(group);
      294    });
      295  
      296 -  app.get('/api/summary', (req: Request, res) => {            
      296 +  app.get('/api/summary', async (req: Request, res) => {      
      297      const { from, to } = SummaryQuerySchema.parse(req.query);
      298      try {
      299 -      res.json(spendingSummary(store.snapshot().expenses, { fr
          -om, to }));                                                   
      299 +      const expenses = from === undefined && to === undefined 
          +? store.snapshot().expenses : await store.findExpenses({ from,
          + to });                                                       
      300 +      res.json(spendingSummary(expenses, { from, to }));      
      301      } catch (err) {
      302        if (err instanceof RangeError) throw new HttpError(400, 
           'INVALID_DATE', err.message);
      303        throw err;

⏺ Update(server/src/app.ts)
  ⎿  Added 1 line
      314        res.status(status).json(body);
      315      };
      316      if (err instanceof HttpError) return fail(err.status, err.
           code, err.message);
      317 +    if (err instanceof StoreConflictError) return fail(409, 'S
          +TORE_CONFLICT', err.message);                                 
      318      if (err instanceof GeminiRequestError) {
      319        // The detail (status and Google's message) is for the l
           og; the response says what to fix.
      320        log(err.message);

⏺ Update(server/src/app.ts)
  ⎿  Added 1 line, removed 1 line
      25  import { SplitError } from './domain/split';
      26  import { spendingSummary } from './domain/summary';
      27  import { applyEdits, buildExpenseDraft, buildSettlementDraft, D
          raftError, finalizeDraft, joinGroup, type DraftStore } from './
          drafts';
      28 -import type { Store } from './store';                          
      28 +import { StoreConflictError, type Store } from './store';      
      29  
      30  export interface AppDeps {
      31    store: Store;

⏺ Update(server/src/index.ts)
  ⎿  Added 1 line, removed 1 line
      1 -// Server entry point: loads .env, opens the JSON store and star
        -ts the API.                                                     
      1 +// Server entry point: loads .env, opens the store (JSON or Mong
        +o) and starts the API.                                          
      2  import { resolve } from 'node:path';
      3  import cors from 'cors';
      4  import express from 'express';

⏺ Update(server/src/index.ts)
  ⎿  Added 1 line, removed 1 line
       8  import { createApp } from './app';
       9  import { describeEnv, loadEnv, localToday, REPO_ROOT } from './
          config';
      10  import { createDraftStore } from './drafts';
      11 -import { openStore } from './store';                           
      11 +import { openConfiguredStore, storeConfigFromEnv } from './stor
         +e-select';                                                     
      12  
      13  // Load config before reading any env var.
      14  console.log(describeEnv(loadEnv()));

⏺ Update(server/src/index.ts)
  ⎿  Added 1 line, removed 1 line
      18  const port = Number(process.env.PORT ?? 3001);
      19  const today = localToday;
      20  
      21 -const store = await openStore(dbPath);                         
      21 +const store = await openConfiguredStore(storeConfigFromEnv(proc
         +ess.env, dbPath));                                             
      22  const drafts = createDraftStore();
      23  
      24  // Without a key the rest of the API still works; /api/chat ans
          wers 503.

⏺ Update(server/src/index.ts)
  ⎿  Added 8 lines, removed 2 lines
      31  const server = express();
      32  server.use(cors({ origin: [/^http:\/\/localhost:\d+$/, /^http:\
          /\/127\.0\.0\.1:\d+$/] }));
      33  server.use(createApp({ store, drafts, today, agent }));
      34 -server.listen(port, () => {                                    
      35 -  console.log(`SplitBot API on http://localhost:${port} (data: 
         -${dbPath})`);                                                  
      34 +const listener = server.listen(port, () => {                   
      35 +  console.log(`SplitBot API on http://localhost:${port} (data: 
         +${store.path})`);                                              
      36  });
      37 +                                                               
      38 +for (const signal of ['SIGINT', 'SIGTERM'] as const) {         
      39 +  process.once(signal, () => {                                 
      40 +    listener.close(() => void store.close().finally(() => proce
         +ss.exit(0)));                                                  
      41 +  });                                                          
      42 +}                                                              
⏺ Update(.env.example)
  ⎿  Added 4 lines
       4  # Free tier: gemini-3.5-flash-lite allows ~500 requests/day (ge
          mini-2.5-flash is closed to new users).
       5  GEMINI_MODEL=gemini-3.5-flash-lite
       6  PORT=3001
       7 +# Where data is saved: json (default, a local file) or mongo (M
         +ongoDB Atlas).                                                 
       8 +STORE=json                                                     
       9 +# Atlas connection string, only used when STORE=mongo. Put it i
         +n .env only, never here.                                       
      10 +MONGODB_URI=                                                   

⏺ Bash(npm run typecheck 2>&1 | tail -25 | cut -c1-170; npm test -w server 2>&1
      | grep -E "FAIL|Test Files|Tests
      |AssertionError|^\s*Error:|StoreError|TypeError|Mongo…)
  ⎿  (No output)
  ⎿  (timeout 5m)

⏺ All 516 server tests pass and the typecheck is clean, but that's a first run,
  so I'll break key behaviours on purpose to confirm the tests catch failures,
  and check whether a leftover mongod process is running.

⏺ Update(server/src/store-mongo.ts)
  ⎿  Added 1 line, removed 1 line
      212              session.withTransaction(
      213                async () => {
      214                  await bumpRevision(session, txnId);
      215 -                for (const { name, ops } of writes) await list
          -(name).bulkWrite(ops, { session });                           
      215 +                for (const { name, ops } of writes) await list
          +(name).bulkWrite(ops);                                        
      216                  await hooks.afterWrites?.();
      217                },
      218                { readConcern: { level: 'snapshot' }, writeConce
           rn: { w: 'majority' } },

⏺ Bash(cd /Users/jarvis/Projects/splitbot/server && pgrep -fl mongod | cut
      -c1-60; echo "--- mutant 1: writes outside the transaction"; npx vitest
      run test/store-mongo…)
  ⎿  (No output)
  ⎿  (timeout 3m 20s)

⏺ The first mutant was caught by 4 tests. I'll revert it and try the next one,
  and look at that persistent process, which survived a full test run.

⏺ Update(server/src/store-mongo.ts)
  ⎿  Added 1 line, removed 1 line
      212              session.withTransaction(
      213                async () => {
      214                  await bumpRevision(session, txnId);
      215 -                for (const { name, ops } of writes) await list
          -(name).bulkWrite(ops);                                        
      215 +                for (const { name, ops } of writes) await list
          +(name).bulkWrite(ops, { session });                           
      216                  await hooks.afterWrites?.();
      217                },
      218                { readConcern: { level: 'snapshot' }, writeConce
           rn: { w: 'majority' } },

⏺ Update(server/src/store-mongo.ts)
  ⎿  Added 1 line, removed 1 line
      224              await reload().catch((reloadErr: unknown) => log(`
           MongoDB: reload failed (${describeError(reloadErr)}).`));
      225              throw err;
      226            }
      227 -          if (!(await didCommit(txnId))) throw toStoreError('w
          -rite', err);                                                  
      227 +          throw toStoreError('write', err);                   
      228          }
      229          cache = next;
      230          revision += 1;

⏺ Bash(ps -o pid,ppid,etime,command -p 76314 | cut -c1-230; lsof -p 76314
      2>/dev/null | grep -E "LISTEN|cwd" | cut -c1-120; echo "--- mutant 2: no
      commit check"; npx v…)
  ⎿  (No output)
  ⎿  (timeout 3m 20s)

⏺ That process is a VS Code extension helper, not mine, so no mongod was left
  behind. Mutant 2 was caught too. Next I'll drop the stale-write check and the
  request middleware.

⏺ Update(server/src/store-mongo.ts)
  ⎿  Added 1 line, removed 1 line
      224              await reload().catch((reloadErr: unknown) => log(`
           MongoDB: reload failed (${describeError(reloadErr)}).`));
      225              throw err;
      226            }
      227 -          throw toStoreError('write', err);                   
      227 +          if (!(await didCommit(txnId))) throw toStoreError('w
          +rite', err);                                                  
      228          }
      229          cache = next;
      230          revision += 1;

⏺ Update(server/src/store-mongo.ts)
  ⎿  Added 1 line, removed 1 line
      172    /** Taking the revision first means any instance that also w
           rote conflicts here, before the other writes. */
      173    async function bumpRevision(session: ClientSession, txnId: s
           tring): Promise<void> {
      174      const taken = await metaCollection.findOneAndUpdate(
      175 -      { _id: META_ID, revision },                             
      175 +      { _id: META_ID },                                       
      176        { $inc: { revision: 1 }, $push: { recentTxnIds: { $each:
            [txnId], $slice: -RECENT_TXN_IDS } } },
      177        { session },
      178      );

⏺ Bash(echo "--- mutant 3: no stale-write check"; npx vitest run
      test/store-mongo.test.ts 2>&1 | grep -E "^ *(FAIL)|Tests  " | cut -c1-120
      | head -6)
  ⎿  (No output)
  ⎿  (timeout 3m 20s)

⏺ Update(server/src/store-mongo.ts)
  ⎿  Added 1 line, removed 1 line
      172    /** Taking the revision first means any instance that also w
           rote conflicts here, before the other writes. */
      173    async function bumpRevision(session: ClientSession, txnId: s
           tring): Promise<void> {
      174      const taken = await metaCollection.findOneAndUpdate(
      175 -      { _id: META_ID },                                       
      175 +      { _id: META_ID, revision },                             
      176        { $inc: { revision: 1 }, $push: { recentTxnIds: { $each:
            [txnId], $slice: -RECENT_TXN_IDS } } },
      177        { session },
      178      );

⏺ Update(server/src/app.ts)
  ⎿  Removed 1 line
      135    const app = express();
      136    // Routes read the store's cache synchronously, so another i
           nstance's writes are picked up before they run.
      137    app.use('/api', async (_req, _res, next) => {
      138 -    await store.refresh();                                    
      138      next();
      139    });
      140    app.use(express.json());

⏺ Bash(echo "--- mutant 4: no revision middleware"; npx vitest run
      test/store-mongo.test.ts test/store-api.contract.test.ts 2>&1 | grep -E "^
      *(FAIL)|Tests  " | cut -c…)
  ⎿  (No output)
  ⎿  (timeout 3m 20s)

⏺ Update(server/src/app.ts)
  ⎿  Added 1 line
      135    const app = express();
      136    // Routes read the store's cache synchronously, so another i
           nstance's writes are picked up before they run.
      137    app.use('/api', async (_req, _res, next) => {
      138 +    await store.refresh();                                    
      139      next();
      140    });
      141    app.use(express.json());

⏺ Update(server/src/store-mongo.ts)
  ⎿  Added 1 line, removed 1 line
      101        // A stuck Atlas call fails the request instead of holdi
           ng up the write queue.
      102        timeoutMS: 15_000,
      103        // Keeps a missing groupId missing, not null.
      104 -      ignoreUndefined: true,                                  
      104 +      ignoreUndefined: false,                                 
      105        // Revision checks must see the latest commit, whatever 
           the URI says.
      106        readPreference: 'primary',
      107        // Serverless instances each hold a pool, and the free t
           ier limits connections.

⏺ Bash(echo "--- mutant 5: undefined saved as null"; npx vitest run
      test/store-mongo.test.ts test/store.contract.test.ts
      test/store-api.contract.test.ts 2>&1 | grep -E…)
  ⎿  (No output)
  ⎿  (timeout 3m 20s)

⏺ A surviving mutant exposed a real test gap around saving records with an
  explicit undefined groupId. I'm adding a test for that case now and will
  confirm it fails while the mutant is still in place.

⏺ Update(server/test/store-mongo.test.ts)
  ⎿  Added 8 lines
      47      expect(doc).not.toHaveProperty('groupId');
      48    });
      49  
      50 +  it('#M19 a field set to undefined is left out, not saved as n
         +ull, so the database still opens', async () => {               
      51 +    const dbName = mongo.freshDbName();                        
      52 +    const store = await open(dbName);                          
      53 +    await store.update((db) => db.expenses.push({ ...expense('m
         +e', { me: 100 }), groupId: undefined }));                      
      54 +    expect((await mongo.read(dbName)).expenses![0]).not.toHaveP
         +roperty('groupId');                                            
      55 +    expect((await open(dbName)).snapshot().expenses).toHaveLeng
         +th(1);                                                         
      56 +  });                                                          
      57 +                                                               
      58    it('#M2 an update that changes nothing writes nothing', async
           () => {
      59      const dbName = mongo.freshDbName();
      60      const store = await open(dbName);

⏺ Bash(echo "--- mutant 5 again"; npx vitest run test/store-mongo.test.ts 2>&1 |
      grep -E "^ *(FAIL)|Tests  " | cut -c1-120 | head -5)
  ⎿  (No output)
  ⎿  (timeout 3m 20s)
⏺ I'm restoring the caught change and running the real server end to end,
  covering JSON mode by default, a missing URI, and two server processes sharing
  a local mongod, with Gemini off and a throwaway local URI.

⏺ Update(server/src/store-mongo.ts)
  ⎿  Added 1 line, removed 1 line
      101        // A stuck Atlas call fails the request instead of holdi
           ng up the write queue.
      102        timeoutMS: 15_000,
      103        // Keeps a missing groupId missing, not null.
      104 -      ignoreUndefined: false,                                 
      104 +      ignoreUndefined: true,                                  
      105        // Revision checks must see the latest commit, whatever 
           the URI says.
      106        readPreference: 'primary',
      107        // Serverless instances each hold a pool, and the free t
           ier limits connections.

  Made 1 scratchpad edit +58 (ctrl+o to expand)

⏺ Bash(zsh /private/tmp/claude-501/-Users-jarvis-Projects-splitbot/754fc146-e3b0
      -4347-a779-245424d21f88/scratchpad/e2e.sh 2>&1 | cut -c1-170; echo "---
      leftovers"; pgr…)
  ⎿  (No output)
  ⎿  (timeout 3m)

⏺ The real-process check passes, and it also confirms the draft problem across
  instances. Now the docs, then the full test run.

  Read 3 files (ctrl+o to expand)

⏺ Bash(cd /Users/jarvis/Projects/splitbot && grep -n "^## \|^### \|Store data in
      a JSON\|Step 7 lite" DECISIONS.md | cut -c1-90; grep -n "Tab-switch\|Step
      6 Part E: te…)
  ⎿  (No output)

  Read 1 file (ctrl+o to expand)

⏺ Bash(npm test 2>&1 | grep -E "Test Files|Tests  |Duration|FAIL" | cut -c1-110;
      npm run typecheck 2>&1 | grep -E "error|TS[0-9]" | head; git diff --stat
      -- server/tes…)
  ⎿  (No output)
  ⎿  (timeout 5m)

⏺ All passing: 517 server and 161 client tests, up from 424 and 161. Existing
  test files only gained lines, and the secrets scan found nothing. Now the
  docs.

⏺ Update(PLAN.md)
  ⎿  Added 1 line
      144  - **Step 6: Three-column layout, account summary, Smart settle
            up, Expenses, Charts, optional Groups** (Day 2 morning). Merg
           es the essentials of the old Steps 6 and 7; built in parts A–E
           . See "Step 6 detail" below.
      145  - **Step 7: Polish** (Day 2 morning). README with setup steps,
            and DECISIONS.md brought up to date. Cut for time: the manual
            expense form fallback (via `POST /api/drafts` + confirm) and 
           the README screenshots.
      146  - **Step 8 (stretch): Deploy** the server to Render and the cl
           ient to Vercel. Render's free tier has an ephemeral disk, so t
           he JSON file would reset on restart; document this or move to 
           a free hosted database.
      147 +- **Step 9: MongoDB Atlas store.** Built before the Step 8 dep
          +loy; the number keeps Step 8 stable. See "Step 9 detail" below
          +.                                                             
      148  
      149  ## Step 1 detail: shared types + split engine
      150  Prerequisite: Step 0 is committed. Step 1 also adds the `works
           paces` field to the root `package.json` and replaces the place
           holder `npm test` with the real vitest run. (npm fails if a li
           sted workspace folder doesn't exist, so Step 0 can't declare t
           hem yet.)

⏺ Update(PLAN.md)
  ⎿  Added 25 lines
      487  ### Browser data (scratch `DB_PATH`)
      488  Dinner $90: I paid, split with Arun and Mei, Arun had $12 of d
           rinks. Lunch $30: Mei paid, split with Arun. Gas $50: Kai paid
           , split with me. Expected: owed $64.00 from 2 people, owe $25.
           00 to 1 person, net +$39.00; Arun $38 and Mei $26 green, Kai $
           25 red.
      489  
      490 +## Step 9 detail: MongoDB Atlas store                         
      491 +`STORE=json|mongo` picks the store; JSON stays the default. `S
          +TORE=mongo` without `MONGODB_URI`, or any other value, stops s
          +tartup instead of falling back. Cut for time: the db.json migr
          +ation script (the user starts with fresh data) and `explain()`
          + index tests.                                                 
      492 +                                                              
      493 +### Files                                                     
      494 +| File | Contents |                                           
      495 +|---|---|                                                     
      496 +| `server/src/store.ts` | `Store` gains `findExpenses`, `findS
          +ettlements`, `refresh` and `close`; `StoreError`, `StoreConfli
          +ctError` |                                                    
      497 +| `server/src/store-mongo.ts` | `openMongoStore(uri, { dbName?
          +, log?, hooks? })`: cache, transactions, revision check, uncer
          +tain-commit check. Collections `meta`, `people`, `expenses`, `
          +settlements`, `groups`; database `splitbot` |                 
      498 +| `server/src/store-select.ts` | `storeConfigFromEnv`, `openCo
          +nfiguredStore`; loads the driver only in Mongo mode |         
      499 +| `server/src/app.ts` | `/api` middleware awaits `store.refres
          +h()`; `/api/summary` with a range uses `findExpenses`; `StoreC
          +onflictError` → 409 `STORE_CONFLICT` |                        
      500 +| `server/src/index.ts`, `.env.example` | Use the selector, cl
          +ose the store on shutdown; `STORE=json`, empty `MONGODB_URI` |
      501 +| `server/test/store.contract.test.ts`, `store-api.contract.te
          +st.ts` | The same cases against both stores (#S, #A) |        
      502 +| `server/test/store-mongo.test.ts`, `store-select.test.ts`, `
          +env-example.test.ts` | Mongo-only behaviour (#M), selection (#
          +SEL), URI guards |                                            
      503 +| `server/test/mongo-helper.ts`, `store-harness.ts` | `MongoMe
          +moryReplSet` (transactions need a replica set) and one way to 
          +drive either store |                                          
      504 +                                                              
      505 +### Rules                                                     
      506 +- **Cache:** `snapshot()` is sync, so the Mongo store keeps al
          +l data in memory and the cache changes only after a commit.   
      507 +- **Other instances:** every `/api` request first reads `meta.
          +revision`; the cache reloads only if it differs. If the check 
          +fails, the request answers from the cache. A write from stale 
          +data is refused (409) and the draft is restored.              
      508 +- **All-or-nothing:** `fn` runs once, before the transaction, 
          +and one transaction takes the revision and applies every chang
          +e.                                                            
      509 +- **Uncertain commits:** each transaction records its id in `m
          +eta.recentTxnIds`. After an error, that says whether it commit
          +ted.                                                          
      510 +- **Secrets:** errors and logs hold only the driver error's ty
          +pe and code, never its message or the URI.                    
      511 +                                                              
      512 +### Done when                                                 
      513 +`npm test` and `npm run typecheck` pass, existing test files h
          +ave additions only, and two real server processes on one local
          + `mongod` agree. The real Atlas check is the user's, with thei
          +r own URI.                                                    
      514 +                                                              
      515  ## Verification
      516  - **Unit tests (vitest)**, run with `npm test -w server`:
      517    - split engine: equal splits with leftover cents, itemized a
           djustments, exact/percent/shares, and every validation error

⏺ Update(CLAUDE.md)
  ⎿  Added 1 line, removed 1 line
      3  SplitBot is a Splitwise-style web app. You type expenses in plai
         n English, and a Gemini function-calling agent turns them into d
         raft expenses. It tracks who owes whom, suggests how to settle u
         p, and charts spending by category.
      4  
      5  - Stack: TypeScript everywhere. Node + Express backend, React (V
         ite) frontend, npm workspaces.
      6 -- Gemini free tier only ($0). Single user, no login. Data is sto
        -red in a JSON file. Runs locally.                               
      6 +- Gemini free tier only ($0). Single user, no login. Data is sto
        +red in a JSON file by default, or MongoDB Atlas with `STORE=mong
        +o`. Runs locally.                                               
      7  - PLAN.md has the full plan and the numbered steps. DECISIONS.md
          is the decision log.
      8  
      9  ## Core principles

⏺ Update(CLAUDE.md)
  ⎿  Added 3 lines, removed 1 line
      18  shared/src/money.ts       # toCents, formatCents (server/src/do
          main/money.ts re-exports them)
      19  server/src/index.ts       # entry point: loads config, opens th
          e store, listens
      20  server/src/app.ts         # Express app + routes
      21 -server/src/store.ts       # JSON file store (server/data/db.jso
         -n), atomic writes                                              
      21 +server/src/store.ts       # Store interface; JSON file store (s
         +erver/data/db.json), atomic writes                             
      22 +server/src/store-mongo.ts # MongoDB store: cache, transactions,
         + revision check                                                
      23 +server/src/store-select.ts # picks the store from STORE and MON
         +GODB_URI                                                       
      24  server/src/drafts.ts      # in-memory drafts with TTL
      25  server/src/domain/        # split, balances, settle, summary, a
          ccount, guardrails (pure functions)
      26  server/src/agent/         # Gemini tools, loop, system prompt

⏺ Update(CLAUDE.md)
  ⎿  Added 1 line, removed 1 line
      35  - **Tests first for domain logic.** Write the tests, confirm th
          ey fail, then implement.
      36  - **Never edit tests just to make them pass.** If a test looks 
          wrong, stop and explain why instead of changing it.
      37  - **Never modify source or test files with shell commands (sed,
           python, heredocs).** Always use the Edit/Write tools so every 
          change shows as a reviewable diff.
      38 -- **Never print or commit the API key.** `GEMINI_API_KEY` lives
         - only in `.env`, which is gitignored. Commit only `.env.example
         -`. Don't echo env vars or log request headers.                 
      38 +- **Never print or commit the API key or database URI.** `GEMIN
         +I_API_KEY` and `MONGODB_URI` live only in `.env`, which is giti
         +gnored. Commit only `.env.example`. Don't echo env vars or log 
         +request headers.                                               
      39  - Log notable decisions, AI mistakes and re-prompts in DECISION
          S.md as they happen.
      40  - Use `/review-step` to review the current step before committi
          ng.
      41  

⏺ Update(README.md)
  ⎿  Added 1 line, removed 1 line
       6  Entering shared expenses by hand is slow, especially when a bil
          l isn't an even split. A chatbot is faster, but an LLM can't be
           trusted with money: it can miscalculate a share or invent an a
          mount. SplitBot keeps the speed of chat and removes that risk. 
          Gemini only extracts the structure of what you typed, tested Ty
          peScript calculates every amount, and nothing is saved until yo
          u click Confirm.
       7  
       8  ## Setup
       9 -You need Node 20 or later and a free Gemini API key. It costs n
         -othing to run on the free tier.                                
       9 +You need Node 20.19 or later and a free Gemini API key. It cost
         +s nothing to run on the free tier. `npm install` also downloads
         + a MongoDB binary, which the tests use.                        
      10  
      11  ```sh
      12  npm install

⏺ Update(README.md)
  ⎿  Added 10 lines
      24  
      25  Without a key, the chat answers with a "not configured" message
           and the rest of the app still works.
      26  
      27 +### Use MongoDB Atlas instead of the JSON file                 
      28 +Set these in `.env`, never in `.env.example`:                  
      29 +                                                               
      30 +```sh                                                          
      31 +STORE=mongo                                                    
      32 +MONGODB_URI=<your Atlas connection string>                     
      33 +```                                                            
      34 +                                                               
      35 +The free Atlas tier is enough. Data goes in a database named `s
         +plitbot`, which starts empty; there is no import from `db.json`
         +. If `STORE=mongo` has no URI, the server won't start, rather t
         +han saving to the JSON file by mistake.                        
      36 +                                                               
      37  ## Tests and eval
      38  ```sh
      39  npm test            # all server and client tests; no key or ne
          twork needed

⏺ Update(README.md)
  ⎿  Added 3 lines, removed 1 line
      36  
      37  ## Tests and eval
      38  ```sh
      39 -npm test            # all server and client tests; no key or ne
         -twork needed                                                   
      39 +npm test            # all server and client tests; no key or re
         +al database needed                                             
      40  npm run typecheck   # type-check every workspace
      41  ```
      42  
      43 +The store tests run against both stores, using a real local Mon
         +goDB from `mongodb-memory-server`. If that binary is missing an
         +d there's no network to download it, those tests fail rather th
         +an skip.                                                       
      44 +                                                               
      45  The eval sends 15 example sentences to real Gemini and compares
           the tool calls and resulting drafts with the expected values. 
          It uses a temporary database, but it does use your free quota.
      46  
      47  ```sh

⏺ Update(README.md)
  ⎿  Added 1 line, removed 1 line
      53  - **Monorepo:** TypeScript npm workspaces. `shared` holds types
           and money helpers, `server` is Node + Express, and `client` is
           React + Vite.
      54  - **Agent (`server/src/agent/`):** a Gemini function-calling lo
          op, capped at 5 tool calls per message. It asks a question when
           something is unclear, and guardrails check the model's output 
          before a draft reaches you.
      55  - **Money logic (`server/src/domain/`):** pure functions comput
          e every share, balance and transfer in integer cents. The model
           never does this arithmetic.
      56 -- **Writes:** tools create in-memory drafts with a 30-minute ex
         -piry, and an expense or payment is saved only when you click Co
         -nfirm. Data is stored in one JSON file, using atomic writes thr
         -ough a queue.                                                  
      56 +- **Writes:** tools create in-memory drafts with a 30-minute ex
         +piry, and an expense or payment is saved only when you click Co
         +nfirm. Data is stored in one JSON file with atomic writes throu
         +gh a queue, or in MongoDB with one transaction per save. Either
         + way, routes read an in-memory cache that changes only after a 
         +write succeeds.                                                
      57  - **Client (`client/src/`):** three columns: account summary, t
          abs (Smart settle up, Expenses, Charts, Groups) and chat. The V
          ite proxy forwards `/api` to the server, and the Gemini key sta
          ys on the server.
      58  
      59  ## Key decisions

⏺ Update(README.md)
  ⎿  Added 1 line, removed 1 line
      63  - All money is integer cents, with a fixed rule for leftover ce
          nts.
      64  - Every expense and payment goes through a draft.
      65  - Guardrails warn on drafts, and block only when the model gues
          ses who took part.
      66 -- A JSON file instead of a database.                           
      66 +- A JSON file by default, with MongoDB Atlas behind the same st
         +ore interface.                                                 
      67  
      68  The full build history is in [docs/ai-sessions/](docs/ai-sessio
          ns/).
      69  

⏺ Update(README.md)
  ⎿  Added 3 lines
      71  - **A payment can be counted twice.** A payment recorded outsid
          e a group lowers the overall balance but not the group's, so th
          e group keeps suggesting it. Following that suggestion records 
          it twice. The app warns about this but doesn't prevent it; dele
          ting the extra payment in Expenses undoes it.
      72  - **Adding an expense needs Gemini.** There is no manual expens
          e form, so the UI can't add an expense without a working key an
          d available quota.
      73  - **Local, single user.** There is no login or deployment, and 
          a host with an ephemeral disk would lose the JSON file.
      74 +- **Several server instances aren't fully supported yet.** With
         + MongoDB, instances see each other's saved data on their next r
         +equest, but drafts live in one instance's memory. If Confirm re
         +aches a different instance from the one that made the draft, it
         + answers "draft not found", so serverless hosting such as Verce
         +l needs shared drafts first.                                   
      75 +- **MongoDB keeps everything in memory.** `snapshot()` is synch
         +ronous, so each instance loads all data when it starts or sees 
         +a change. The date and `groupId` indexes are only used by date-
         +filtered summaries from the API, and the UI and the agent don't
         + send those yet.                                               
      76 +- **A lost commit reply can still duplicate an expense.** If a 
         +save fails and the app also can't read back whether it committe
         +d, it reports a failure. Retrying could then save a second copy
         +, which you can delete in Expenses.                            
      77  - **Settle-up isn't always minimal.** The greedy method clears 
          all balances in at most n−1 transfers, but it can use a transfe
          r or two more than the true minimum.
      78  - **Guardrails can be fooled.** "Sam" passes the named-person c
          heck because of the word "same", and a number or name from an e
          arlier expense in the chat can hide a wrong one. Wording like "
          split 1/2" counts as a date phrase, so an invented date can get
           through. The date stays visible and editable on the card.
      79  - **Groups are basic.** Groups and members can't be renamed or 
          removed, and the agent can't assign a group; you choose it on t
          he draft card.

⏺ Update(DECISIONS.md)
  ⎿  Added 8 lines
      102  - **Known limitation: a payment can be counted twice (Step 6 P
           art E).** This is a real money error, and it is only warned ab
           out, not prevented. A payment recorded with no group (from the
            overall Smart settle up tab, or a chat draft left on "No grou
           p") lowers the overall balance but not the group's. The group 
           keeps suggesting the same payment, and following that suggesti
           on records it twice. With the $90 dinner in a group, recording
            Arun's $38 both ways takes my overall net from +$64 to -$12, 
           so the app says I owe Arun, while the group looks correct. Tes
           t #154 documents this. Notes on both tabs warn about it, and d
           eleting the extra payment in Expenses undoes it, but nothing d
           etects or prompts for it. Preventing it would mean matching pa
           yments across views, which isn't built.
      103  - **Other known limitations (Step 6 Part E).** The dropdown ca
           n move a payment to another group or to none. Groups and membe
           rs can't be renamed or removed. An open payment card closes on
            a tab switch, like the overall tab's. If the person chosen un
           der Add a person joins through a Confirm first, Add member sta
           ys enabled while the dropdown shows "Choose a person"; clickin
           g it changes nothing. There is no test for a 60 or 61 characte
           r group name or for adding a member with no request body. The 
           clicks on the Groups form and on the draft card's dropdown hav
           e no automated test, because the client tests render static ma
           rkup.
      104  - **Step 7 lite: docs only (Step 7).** This step is the README
            and this summary, with no new features. The manual expense fo
           rm and the README screenshots that PLAN.md lists for Step 7 ar
           e left out. Trade-off: without a working Gemini key or quota, 
           the UI can't add an expense.
      105 +- **MongoDB behind the same interface, with a cache (Step 9).*
          +* `snapshot()` is sync, so a Mongo store has to serve it from 
          +memory. I chose this over making the store async, which would 
          +have changed about 20 read sites, sync `runTool` and about 35 
          +test lines. Trade-off: all data is in memory, and the indexes 
          +do little today. Only `/api/summary` with a date range queries
          + Mongo, and the UI and agent don't send one. The `groupId` ind
          +ex has no caller yet.                                         
      106 +- **Revision check before each request (Step 9).** I added thi
          +s for Vercel: `/api` middleware reads `meta.revision` and relo
          +ads only if another instance has written, which keeps `snapsho
          +t()` sync. It adds one small read per request, so seven per da
          +shboard refresh. If the check fails, the request answers from 
          +the cache, so a read can be stale during an outage. A write fr
          +om stale data still gets a 409 `STORE_CONFLICT`, and the draft
          + is restored.                                                 
      107 +- **Drafts don't work across instances (Step 9).** The revisio
          +n check covers saved data only. Drafts are in memory, so a Con
          +firm that reaches another instance gets 404 `DRAFT_NOT_FOUND`.
          + Test #M15 documents this, and the two-process check showed it
          + too. Serverless hosting needs shared drafts before it can wor
          +k.                                                            
      108 +- **Uncertain commits (Step 9).** Each transaction records its
          + id in `meta.recentTxnIds`, the last 20. After an error, that 
          +id says whether the commit applied, so a lost reply doesn't ca
          +use a retry that saves a duplicate. Known gap: if the read-bac
          +k fails too, the save is reported as failed even if it applied
          +, and a retry can duplicate it. The next check does load the c
          +ommitted data.                                                
      109 +- **No fallback and no secrets in errors (Step 9).** A bad `ST
          +ORE` or a missing URI stops startup, because falling back woul
          +d save to the wrong place. Mongo errors keep only the driver e
          +rror's type and code, because its messages can hold hosts or t
          +he URI. The database is always named `splitbot`, so an Atlas U
          +RI with no database name doesn't write to the driver's default
          + `test`.                                                      
      110 +- **Filtered summaries validate less (Step 9).** With a date r
          +ange, `/api/summary` validates only expenses in that range, so
          + a bad date outside it no longer gives a 400. Only a hand-edit
          +ed database can contain one. This applies to both stores.     
      111 +- **Cut for time (Step 9).** I cut the db.json migration scrip
          +t, because I'm starting with fresh data, and the `explain()` i
          +ndex tests. So `#M3` checks that the indexes exist, not that q
          +ueries use them.                                              
      112 +- **Known limitations (Step 9).** Uncertain commits are tested
          + through injected failures, not real driver error labels. The 
          +real Atlas path hasn't been run; the checks used a local `mong
          +od`, so transactions on the free tier are still to confirm. A 
          +fresh offline clone can't pass `npm test`, because the Mongo t
          +ests need the downloaded binary, and I chose that over skippin
          +g them. `concurrently` asks for Node 22 and warns on Node 20; 
          +this was already the case and it still runs.                  
      113  
      114  ## Where AI got it wrong
      115  _(Log mistakes as they happen: what it did, how it was caught,
            and the fix.)_

⏺ Update(DECISIONS.md)
  ⎿  Added 2 lines
      136  - Step 6 Part D: the first balance chart clipped a long name (
           "Featherstonehaugh") and, at 1110px, let a negative amount ove
           rlap the person's name. The tests couldn't see either problem,
            because static rendering draws no bars; a screenshot with har
           der data found them.
      137  - Step 6 Part D: a `/review-step` found that the AI had missed
            rules it should have kept: it didn't log the "stop servers" r
           e-prompt or these layout bugs as they happened, and it left fo
           ur new client files out of the PLAN.md list.
      138  - Step 6 Part E: a `/review-step` found that the AI had added 
           a direct write for adding members, beyond the exceptions I'd a
           pproved, had left PLAN.md's type list, data model and Frontend
            sections stale, had titled test #143 "survives a restart" wit
           hout reopening the store, had described the double-payment lim
           itation too mildly, and had listed an older database as driven
            through the UI when that run started from an empty one.
      139 +- Step 9: all the new tests passed on the first implementation
          +, so the AI broke the code on purpose to check them. Removing 
          +`ignoreUndefined` broke no test, though saving `groupId: undef
          +ined` as `null` would have stopped the database reopening. Fix
          +: test #M19, which fails with that change.                    
      140 +- Step 9 planning: the AI's first plan had no way for a second
          + instance to see writes, only a refusal when it wrote from sta
          +le data. I asked for the revision check before each request, w
          +ith a two-instance test.                                      
      141  
      142  ## Re-prompts
      143  - Planning: I asked for the timeline as numbered steps that ea
           ch end in tests + a commit, a Step 0 for docs and workflow, an
            amount guardrail, and a close-name guardrail.
⏺ Update(DECISIONS.md)
  ⎿  Added 1 line
      160  - Step 6 Part A: I told the AI to stop any servers it had star
           ted, including the no-key one from its curl check, and not to 
           leave servers running after checks. The no-key server had alre
           ady stopped. The AI did find a leftover process tree (`npm run
            dev`, four processes, running since 13:16) whose database was
            in an earlier Claude session's scratchpad, so it came from a 
           previous check. It had no listening port by then, and the AI s
           topped it.
      161  - Step 6 Part D: after `/review-step` I asked for the missing 
           log entries, the PLAN.md file list, the reworded maths rule, t
           he `balanceDomain` and `shortName` tests, a renamed test input
           , the label clipping fixed only if it was a one-line change, a
           nd the other edge cases logged as known limitations.
      162  - Step 6 Part E: after `/review-step` I gave a time-boxed fix 
           list: approve the member exception, update the stale PLAN.md s
           ections, make test #143 reopen the store, add a note on the ov
           erall tab with a test documenting the double payment and an ho
           nest limitation, say "Nothing to settle yet" for a group with 
           no records, collapse inner spaces in group names, and add the 
           "Use Arun" and failed-write tests. The rest went in as known l
           imitations.
      163 +- Step 9: I asked for a plan only. I chose the cached option, 
          +with a revision check per request for Vercel and a two-instanc
          +e test, called it Step 9, accepted the first-run download and 
          +Mongo tests failing offline, and cut the migration script and 
          +`explain()` tests.                                            
      164  
      165  ## Where AI sped me up / got in the way
      166  - Sped me up: scaffolding, the plan structure, and enumerating
            split-engine edge cases.

⏺ Update(DECISIONS.md)
  ⎿  Added 1 line
      188  - Step 6 Part C: tests first (3 client tests failed, plus the 
           new `expenses` test file). Server test #127 passed from the st
           art, because the delete routes already existed, so it only gua
           rds against regressions. Then 393 server and 105 client tests 
           passed with the typecheck clean. Curl through the Vite proxy o
           n a scratch database: deleting a payment and an expense update
           d the account and plan, a second delete gave 404 `NOT_FOUND`, 
           and the data survived a server restart. The two-click sequence
            is covered only as rendered states, so the clicks are left fo
           r the browser check.
      189  - Step 6 Part D: tests first (the new `charts` test file could
           n't load and the `getSummary` test failed), then 393 server an
           d 130 client tests passed with the typecheck clean. Headless C
           hrome screenshots on a scratch database showed the right value
           s in both toggle modes, a working hover tooltip and no console
            errors. They also caught what the tests couldn't: a long name
            was clipped on the balance chart, and at 1110px a negative am
           ount overlapped the name. Both were fixed (test #126 first for
            the shortening, plus a wider balance scale). At that width a 
           very long name still wraps to two lines and sits close to its 
           amount, but nothing is clipped or overlapping.
      190  - Step 6 Part E: tests first (24 server and 5 client tests fai
           led, plus the new client `groups` test file; the rest of the n
           ew tests pinned behaviour that already held), then 419 server 
           and 157 client tests passed with the typecheck clean. Headless
            Chrome on a scratch database drove the real UI: empty state, 
           create, duplicate name, add member, an API-added expense that 
           brought Mei in on Confirm, Record payment with the group prese
           lected, the group clearing after Confirm with `groupId` saved,
            and no console errors. Chat was off, so the dropdown on an ex
           pense card was checked only by static render and API tests.
      191 +- Step 9: tests first (four new test files couldn't load and t
          +he `.env.example` URI test failed, while 441 others still pass
          +ed), then 517 server and 161 client tests passed with the type
          +check clean. Existing test files only gained lines, in `env-ex
          +ample.test.ts`. Five deliberate breaks: writes outside the tra
          +nsaction, no commit check, no stale-write check and no middlew
          +are each failed tests; the fifth, `ignoreUndefined`, needed ne
          +w test #M19. Two real server processes on a local `mongod`: a 
          +confirm on A showed on B's next request as balances +6400/−380
          +0/−2600, the data survived a restart of B, a draft from A got 
          +404 on B, no server log contained the URI, and nothing was lef
          +t running. Not run against real Atlas.                        
      192  
      193  ## What I'd do differently
      194  - Put important rules in code from the start, not in the promp
           t.

⏺ Step 9 is built and ready for your review, but it won't fully work on Vercel
  yet because of drafts. Nothing is committed, and it hasn't been run against
  real Atlas, only a local mongod.

  The Vercel problem

  The revision check does what you asked: a write through one instance shows up
  on the other's next request. But drafts live in each instance's memory, so a
  Confirm that lands on a different instance gets 404 DRAFT_NOT_FOUND. Two real
  server processes showed this, and test #M15 documents it.

  index.ts also calls listen, so Vercel would need a handler wrapper as well.

  Decision for you

  Do you want to deploy the server to a single always-on instance, or to Vercel?
  - Single instance (my recommendation): Render is what Step 8 already plans. It
    needs no draft changes, and Atlas solves the disk problem.
  - Vercel: drafts would have to move into Mongo, and the handler wrapper is
    needed too. That's a follow-up for you to approve, so I haven't started it.

  Branch fix

  mongo had been cut just before your Step 7 commit, so it had no README. It had
  no commits of its own, so I fast-forwarded it to main locally and pushed
  nothing. That's why CLAUDE.md and PLAN.md looked reverted on disk.

  What was checked

  - Tests: 517 server tests (up from 424) and 161 client tests pass, and the
    typecheck is clean. The only existing test file changed is
    env-example.test.ts, which only gained lines.
  - Tests first: the four new test files that needed the new code couldn't load,
    and the .env.example URI test failed, before I implemented anything.
  - Breaking the code on purpose: four of five deliberate breaks failed tests
    straight away. Removing ignoreUndefined broke nothing, even though it would
    have stopped the database reopening, so I added test #M19, which catches it.
  - Real processes: a confirm on server A showed up on server B's next request,
    with balances +6400/−3800/−2600. Data survived a restart of B.
  - Secrets and cleanup: no URI appeared in any server log, the diff scan found
    no secrets, and nothing was left running.

  Choices I made that you may want to review

  - Failed revision check: the request answers from the cache rather than
    failing, so reads can be stale during an outage. A write from stale data
    still gets a new 409 STORE_CONFLICT, and the draft is restored.
  - Database name: it's always splitbot, so an Atlas URI with no database name
    doesn't write to the driver's default test.
  - Node version: the minimum is now 20.19, which the mongodb driver requires.
  - Extra test file: besides the contract and Mongo tests, I added a small
    store-select.test.ts for choosing the store.

  Known gaps (logged in DECISIONS.md)

  - Indexes barely used today: only /api/summary with a date range queries
    Mongo, and neither the UI nor the agent sends one. The groupId index has no
    caller, and with explain() cut, tests only show the indexes exist.
  - Extra reads: the revision check adds one small read per request, so seven
    per dashboard refresh.
  - Uncertain commits: these are tested with injected failures, not real driver
    errors. If the commit reply and the read-back both fail, the save reports as
    failed even if it applied, so a retry could duplicate it.
  - Filtered summaries: with a date range, a bad date outside that range no
    longer gives a 400. Only a hand-edited database can contain one.

  Your Atlas check

  Set STORE=mongo and MONGODB_URI in .env, which I haven't opened. Then run npm
  run dev, confirm a real expense and restart. This also confirms transactions
  work on the free tier, and your Atlas network access list needs to allow your
  IP.

  When you're happy, run /review-step and commit as Step 9: <summary>. I didn't
  rerun the Gemini eval.

❯ <ide_opened_file>The user opened the file
  /Users/jarvis/Projects/splitbot/.env in the IDE. This may or may not be
  related to the current task.</ide_opened_file>

❯ Atlas works: connected, confirmed an expense, and it survived a restart.
  Remove the deprecated timeoutMS option and use supported timeouts instead,
  keeping all tests passing. Log the successful Atlas check in DECISIONS.md.
  Also record the deploy decision: frontend on Vercel, API on Render (single
  instance), Vercel rewrites /api/* to Render; update Step 8 in PLAN.md. Then
  run /review-step and stop.

⏺ I'll check what the installed driver says about timeoutMS and which
  replacements it supports.

⏺ Bash(git status --short | cut -c1-70; git log --oneline | head -2;
      D=node_modules/mongodb; grep -n '"version"' $D/package.json; grep -n -B8
      -E "^\s+timeoutMS\?: numb…)
  ⎿  (No output)

⏺ Bash(D=server/node_modules/mongodb; ls -d $D node_modules/mongodb*
      2>/dev/null; grep -m1 '"version"' $D/package.json; grep -n -B10 -E
      "^\s+timeoutMS\?: number" $D/mo…)
  ⎿  (No output)

⏺ The driver says timeoutMS has no effect, so my earlier claim of a roughly
  15-second limit per operation was wrong, and so is the code comment. I'm
  writing a failing test for the deprecation warning, then measuring how long a
  stalled connection really blocks.

⏺ Update(server/test/store-mongo.test.ts)
  ⎿  Added 4 lines
      10  import { expense } from './helpers';
      11  import { MONGO_START_TIMEOUT_MS, MONGO_TEST_TIMEOUT_MS, startMo
          ngo, type TestMongo } from './mongo-helper';
      12  
      13 +// The driver warns once per process, so this listens from befo
         +re the first store opens.                                      
      14 +const driverWarnings: string[] = [];                           
      15 +process.on('warning', (warning) => driverWarnings.push(warning.
         +message));                                                     
      16 +                                                               
      17  let mongo: TestMongo;
      18  beforeAll(async () => {
      19    mongo = await startMongo();

⏺ Update(server/test/store-mongo.test.ts)
  ⎿  Added 6 lines
      51      expect(doc).not.toHaveProperty('groupId');
      52    });
      53  
      54 +  it('#M20 opening uses no deprecated driver option', async () 
         +=> {                                                           
      55 +    await open(mongo.freshDbName());                           
      56 +    await new Promise((resolve) => setImmediate(resolve));     
      57 +    expect(driverWarnings.filter((message) => message.includes(
         +'deprecated'))).toEqual([]);                                   
      58 +  });                                                          
      59 +                                                               
      60    it('#M19 a field set to undefined is left out, not saved as n
          ull, so the database still opens', async () => {
      61      const dbName = mongo.freshDbName();
      62      const store = await open(dbName);

⏺ Bash(npx vitest run test/store-mongo.test.ts -t "#M20" 2>&1 | grep -E
      "FAIL|Tests  |deprecated" | cut -c1-130 | head -6)
  ⎿  (No output)

⏺ The failing test confirms the bug, so I'm swapping in the supported options
  and probing a real mongod behind a silent TCP proxy to time how long reads and
  writes take to fail.

⏺ Update(server/src/store-mongo.ts)
  ⎿  Added 4 lines, removed 2 lines
       98    try {
       99      client = new MongoClient(uri, {
      100        serverSelectionTimeoutMS,
      101 -      // A stuck Atlas call fails the request instead of holdi
          -ng up the write queue.                                        
      102 -      timeoutMS: 15_000,                                      
      101 +      // A stuck Atlas call fails instead of holding up reques
          +ts and the write queue.                                       
      102 +      connectTimeoutMS: 5000,                                 
      103 +      socketTimeoutMS: 15_000,                                
      104 +      waitQueueTimeoutMS: 5000,                               
      105        // Keeps a missing groupId missing, not null.
      106        ignoreUndefined: true,
      107        // Revision checks must see the latest commit, whatever 
           the URI says.

⏺ Update(server/src/store-mongo.ts)
  ⎿  Added 1 line, removed 1 line
      217                  for (const { name, ops } of writes) await list
           (name).bulkWrite(ops, { session });
      218                  await hooks.afterWrites?.();
      219                },
      220 -              { readConcern: { level: 'snapshot' }, writeConce
          -rn: { w: 'majority' } },                                      
      220 +              { readConcern: { level: 'snapshot' }, writeConce
          +rn: { w: 'majority' }, maxCommitTimeMS: 10_000 },             
      221              ),
      222            );
      223            await hooks.afterCommit?.();

  Made 1 scratchpad edit +57 (ctrl+o to expand)

⏺ Bash(perl -e 'alarm 280; exec @ARGV' npx tsx
      /private/tmp/claude-501/-Users-jarvis-Projects-splitbot/754fc146-e3b0-4347
      -a779-245424d21f88/scratchpad/stall-probe.ts 2…)
  ⎿  (No output)

⏺ The scratch script needs to be an ES module, so I'll rename it. It isn't a
  repo file.

⏺ Bash(SP=/private/tmp/claude-501/-Users-jarvis-Projects-splitbot/754fc146-e3b0-
      4347-a779-245424d21f88/scratchpad; mv $SP/stall-probe.ts
      $SP/stall-probe.mts; perl -e '…)
  ⎿  (No output)
  ⎿  (timeout 5m)

⏺ A write fails after about 10 seconds on a silent connection, and requests take
  roughly 20 seconds at first, then about 5, before falling back to the cache;
  I'm logging that as a limitation and checking the docs next.

⏺ Update(PLAN.md)
  ⎿  Added 1 line, removed 1 line
      143  - **Step 5: Chat UI + DraftCard + confirm flow** (Day 1 evenin
           g). The dinner example works end to end in the browser, and wa
           rnings and "Use Arun" are visible.
      144  - **Step 6: Three-column layout, account summary, Smart settle
            up, Expenses, Charts, optional Groups** (Day 2 morning). Merg
           es the essentials of the old Steps 6 and 7; built in parts A–E
           . See "Step 6 detail" below.
      145  - **Step 7: Polish** (Day 2 morning). README with setup steps,
            and DECISIONS.md brought up to date. Cut for time: the manual
            expense form fallback (via `POST /api/drafts` + confirm) and 
           the README screenshots.
      146 -- **Step 8 (stretch): Deploy** the server to Render and the cl
          -ient to Vercel. Render's free tier has an ephemeral disk, so t
          -he JSON file would reset on restart; document this or move to 
          -a free hosted database.                                       
      146 +- **Step 8 (stretch): Deploy.** Frontend on Vercel. API on Ren
          +der as a single instance, with `STORE=mongo` and data in Atlas
          +, because Render's free tier has an ephemeral disk that would 
          +reset the JSON file. Vercel rewrites `/api/*` to the Render se
          +rvice, so the browser still calls its own origin, with no CORS
          + change. The single instance matters because drafts are in mem
          +ory (#M15); drafts open during a restart are lost.            
      147  - **Step 9: MongoDB Atlas store.** Built before the Step 8 dep
           loy; the number keeps Step 8 stable. See "Step 9 detail" below
           .
      148  
      149  ## Step 1 detail: shared types + split engine

⏺ Update(PLAN.md)
  ⎿  Added 2 lines, removed 1 line
      508  - **All-or-nothing:** `fn` runs once, before the transaction, 
           and one transaction takes the revision and applies every chang
           e.
      509  - **Uncertain commits:** each transaction records its id in `m
           eta.recentTxnIds`. After an error, that says whether it commit
           ted.
      510  - **Secrets:** errors and logs hold only the driver error's ty
           pe and code, never its message or the URI.
      511 +- **Timeouts:** `serverSelectionTimeoutMS` and `connectTimeout
          +MS` 5 s, `socketTimeoutMS` 15 s, `waitQueueTimeoutMS` 5 s, `ma
          +xCommitTimeMS` 10 s. No `timeoutMS`, which the driver has depr
          +ecated and ignores (#M20).                                    
      512  
      513  ### Done when
      513 -`npm test` and `npm run typecheck` pass, existing test files h
          -ave additions only, and two real server processes on one local
          - `mongod` agree. The real Atlas check is the user's, with thei
          -r own URI.                                                    
      514 +`npm test` and `npm run typecheck` pass, existing test files h
          +ave additions only, and two real server processes on one local
          + `mongod` agree. The real Atlas check is the user's, with thei
          +r own URI (done: connect, confirm, restart).                  
      515  
      516  ## Verification
      517  - **Unit tests (vitest)**, run with `npm test -w server`:

⏺ Update(README.md)
  ⎿  Added 2 lines, removed 1 line
      71  - **A payment can be counted twice.** A payment recorded outsid
          e a group lowers the overall balance but not the group's, so th
          e group keeps suggesting it. Following that suggestion records 
          it twice. The app warns about this but doesn't prevent it; dele
          ting the extra payment in Expenses undoes it.
      72  - **Adding an expense needs Gemini.** There is no manual expens
          e form, so the UI can't add an expense without a working key an
          d available quota.
      73  - **Local, single user.** There is no login or deployment, and 
          a host with an ephemeral disk would lose the JSON file.
      74 -- **Several server instances aren't fully supported yet.** With
         - MongoDB, instances see each other's saved data on their next r
         -equest, but drafts live in one instance's memory. If Confirm re
         -aches a different instance from the one that made the draft, it
         - answers "draft not found", so serverless hosting such as Verce
         -l needs shared drafts first.                                   
      74 +- **The API must run as a single instance.** With MongoDB, inst
         +ances see each other's saved data on their next request, but dr
         +afts live in one instance's memory. If Confirm reaches a differ
         +ent instance from the one that made the draft, it answers "draf
         +t not found". The planned deploy is therefore the frontend on V
         +ercel and the API on one Render instance, with Vercel rewriting
         + `/api/*` to Render.                                           
      75 +- **An unresponsive database slows every request.** Each `/api`
         + request checks MongoDB first. When a connection went silent in
         + a test, the first request waited about 20 seconds and later on
         +es about 5 seconds each before answering from cached data. Save
         +s failed after about 10 seconds.                               
      76  - **MongoDB keeps everything in memory.** `snapshot()` is synch
          ronous, so each instance loads all data when it starts or sees 
          a change. The date and `groupId` indexes are only used by date-
          filtered summaries from the API, and the UI and the agent don't
           send those yet.
      77  - **A lost commit reply can still duplicate an expense.** If a 
          save fails and the app also can't read back whether it committe
          d, it reports a failure. Retrying could then save a second copy
          , which you can delete in Expenses.
      78  - **Settle-up isn't always minimal.** The greedy method clears 
          all balances in at most n−1 transfers, but it can use a transfe
          r or two more than the true minimum.

⏺ Update(DECISIONS.md)
  ⎿  Added 3 lines, removed 1 line
      109  - **No fallback and no secrets in errors (Step 9).** A bad `ST
           ORE` or a missing URI stops startup, because falling back woul
           d save to the wrong place. Mongo errors keep only the driver e
           rror's type and code, because its messages can hold hosts or t
           he URI. The database is always named `splitbot`, so an Atlas U
           RI with no database name doesn't write to the driver's default
            `test`.
      110  - **Filtered summaries validate less (Step 9).** With a date r
           ange, `/api/summary` validates only expenses in that range, so
            a bad date outside it no longer gives a 400. Only a hand-edit
           ed database can contain one. This applies to both stores.
      111  - **Cut for time (Step 9).** I cut the db.json migration scrip
           t, because I'm starting with fresh data, and the `explain()` i
           ndex tests. So `#M3` checks that the indexes exist, not that q
           ueries use them.
      112 -- **Known limitations (Step 9).** Uncertain commits are tested
          - through injected failures, not real driver error labels. The 
          -real Atlas path hasn't been run; the checks used a local `mong
          -od`, so transactions on the free tier are still to confirm. A 
          -fresh offline clone can't pass `npm test`, because the Mongo t
          -ests need the downloaded binary, and I chose that over skippin
          -g them. `concurrently` asks for Node 22 and warns on Node 20; 
          -this was already the case and it still runs.                  
      112 +- **Deploy: frontend on Vercel, API on one Render instance (St
          +ep 8 plan).** Vercel rewrites `/api/*` to Render, so the brows
          +er calls its own origin and CORS doesn't change. Data lives in
          + Atlas, because Render's free disk is ephemeral. I chose this 
          +over running the API on Vercel, which would have needed drafts
          + moved into Mongo plus a handler wrapper. Trade-off: one insta
          +nce and in-memory drafts, so a Render restart loses open draft
          +s, but saved data is safe. The revision check stays, though wi
          +th one instance it has little to do.                          
      113 +- **Supported timeouts instead of `timeoutMS` (Step 9).** The 
          +driver has deprecated `timeoutMS` and ignores it. It now uses 
          +`connectTimeoutMS` 5 s, `socketTimeoutMS` 15 s, `waitQueueTime
          +outMS` 5 s and `maxCommitTimeMS` 10 s, with server selection a
          +t 5 s as before. Measured with a real `mongod` behind a proxy 
          +that went silent: a write failed after 10 s, the first request
          +'s check took 20 s, and later checks took 5 s each before answ
          +ering from the cache. Trade-off: these limit each step, not a 
          +whole operation. The driver's `withTransaction` can keep retry
          +ing transient errors for up to 120 s, though it didn't in this
          + run.                                                         
      114 +- **Known limitations (Step 9).** Uncertain commits are tested
          + through injected failures, not real driver error labels. The 
          +timeouts have no automated test beyond #M20 (no deprecated opt
          +ion); their numbers come from one run of a throwaway probe. Wh
          +ile the database is unresponsive, every `/api` request waits f
          +or the check first, so the app is slow rather than down. A fre
          +sh offline clone can't pass `npm test`, because the Mongo test
          +s need the downloaded binary, and I chose that over skipping t
          +hem. `concurrently` asks for Node 22 and warns on Node 20; thi
          +s was already the case and it still runs.                     
      115  
      116  ## Where AI got it wrong
      117  _(Log mistakes as they happen: what it did, how it was caught,
            and the fix.)_

⏺ Update(DECISIONS.md)  ⎿  Added 1 line
      139  - Step 6 Part D: a `/review-step` found that the AI had missed
            rules it should have kept: it didn't log the "stop servers" r
           e-prompt or these layout bugs as they happened, and it left fo
           ur new client files out of the PLAN.md list.
      140  - Step 6 Part E: a `/review-step` found that the AI had added 
           a direct write for adding members, beyond the exceptions I'd a
           pproved, had left PLAN.md's type list, data model and Frontend
            sections stale, had titled test #143 "survives a restart" wit
           hout reopening the store, had described the double-payment lim
           itation too mildly, and had listed an older database as driven
            through the UI when that run started from an empty one.
      141  - Step 9: all the new tests passed on the first implementation
           , so the AI broke the code on purpose to check them. Removing 
           `ignoreUndefined` broke no test, though saving `groupId: undef
           ined` as `null` would have stopped the database reopening. Fix
           : test #M19, which fails with that change.
      142 +- Step 9: the AI used `timeoutMS` without checking the install
          +ed driver, and told me each operation was limited to about 15 
          +seconds. Driver 7.8 marks that option deprecated with no effec
          +t, so the limit didn't exist. Neither the tests nor the real-p
          +rocess check flagged it, though the driver prints a warning. I
          + caught it when I ran against Atlas. Fix: supported timeouts, 
          +test #M20 for deprecated options, and failure times measured r
          +ather than assumed.                                           
      143  - Step 9 planning: the AI's first plan had no way for a second
            instance to see writes, only a refusal when it wrote from sta
           le data. I asked for the revision check before each request, w
           ith a two-instance test.
      144  
      145  ## Re-prompts

⏺ Update(DECISIONS.md)
  ⎿  Added 1 line
      164  - Step 6 Part D: after `/review-step` I asked for the missing 
           log entries, the PLAN.md file list, the reworded maths rule, t
           he `balanceDomain` and `shortName` tests, a renamed test input
           , the label clipping fixed only if it was a one-line change, a
           nd the other edge cases logged as known limitations.
      165  - Step 6 Part E: after `/review-step` I gave a time-boxed fix 
           list: approve the member exception, update the stale PLAN.md s
           ections, make test #143 reopen the store, add a note on the ov
           erall tab with a test documenting the double payment and an ho
           nest limitation, say "Nothing to settle yet" for a group with 
           no records, collapse inner spaces in group names, and add the 
           "Use Arun" and failed-write tests. The rest went in as known l
           imitations.
      166  - Step 9: I asked for a plan only. I chose the cached option, 
           with a revision check per request for Vercel and a two-instanc
           e test, called it Step 9, accepted the first-run download and 
           Mongo tests failing offline, and cut the migration script and 
           `explain()` tests.
      167 +- Step 9: after my Atlas check I asked for `timeoutMS` to be r
          +eplaced with supported timeouts, the Atlas result logged, and 
          +the deploy decision recorded in PLAN.md Step 8: frontend on Ve
          +rcel, API on a single Render instance.                        
      168  
      169  ## Where AI sped me up / got in the way
      170  - Sped me up: scaffolding, the plan structure, and enumerating
            split-engine edge cases.

⏺ Update(DECISIONS.md)
  ⎿  Added 1 line
      193  - Step 6 Part D: tests first (the new `charts` test file could
           n't load and the `getSummary` test failed), then 393 server an
           d 130 client tests passed with the typecheck clean. Headless C
           hrome screenshots on a scratch database showed the right value
           s in both toggle modes, a working hover tooltip and no console
            errors. They also caught what the tests couldn't: a long name
            was clipped on the balance chart, and at 1110px a negative am
           ount overlapped the name. Both were fixed (test #126 first for
            the shortening, plus a wider balance scale). At that width a 
           very long name still wraps to two lines and sits close to its 
           amount, but nothing is clipped or overlapping.
      194  - Step 6 Part E: tests first (24 server and 5 client tests fai
           led, plus the new client `groups` test file; the rest of the n
           ew tests pinned behaviour that already held), then 419 server 
           and 157 client tests passed with the typecheck clean. Headless
            Chrome on a scratch database drove the real UI: empty state, 
           create, duplicate name, add member, an API-added expense that 
           brought Mei in on Confirm, Record payment with the group prese
           lected, the group clearing after Confirm with `groupId` saved,
            and no console errors. Chat was off, so the dropdown on an ex
           pense card was checked only by static render and API tests.
      195  - Step 9: tests first (four new test files couldn't load and t
           he `.env.example` URI test failed, while 441 others still pass
           ed), then 517 server and 161 client tests passed with the type
           check clean. Existing test files only gained lines, in `env-ex
           ample.test.ts`. Five deliberate breaks: writes outside the tra
           nsaction, no commit check, no stale-write check and no middlew
           are each failed tests; the fifth, `ignoreUndefined`, needed ne
           w test #M19. Two real server processes on a local `mongod`: a 
           confirm on A showed on B's next request as balances +6400/−380
           0/−2600, the data survived a restart of B, a draft from A got 
           404 on B, no server log contained the URI, and nothing was lef
           t running. Not run against real Atlas.
      196 +- Step 9 Atlas check, run by me with my own URI: the app conne
          +cted to MongoDB Atlas, I confirmed an expense, and it survived
          + a restart. Confirm runs in a transaction, so this also shows 
          +transactions work on my cluster.                              
      197  
      198  ## What I'd do differently
      199  - Put important rules in code from the start, not in the promp
           t.

⏺ Bash(cd /Users/jarvis/Projects/splitbot && npm test 2>&1 | grep -E "Test
      Files|Tests  |FAIL|deprecated option" | cut -c1-120; npm run typecheck
      2>&1 | grep -E "error…)
  ⎿  (No output)
  ⎿  (timeout 5m)

⏺ All 518 server and 161 client tests pass with a clean typecheck. I'm leaving
  the running tsx watch process alone since it's likely your dev server, and
  next I'll soften one log line's wording before the review.

⏺ Update(DECISIONS.md)
  ⎿  Added 1 line, removed 1 line
      139  - Step 6 Part D: a `/review-step` found that the AI had missed
            rules it should have kept: it didn't log the "stop servers" r
           e-prompt or these layout bugs as they happened, and it left fo
           ur new client files out of the PLAN.md list.
      140  - Step 6 Part E: a `/review-step` found that the AI had added 
           a direct write for adding members, beyond the exceptions I'd a
           pproved, had left PLAN.md's type list, data model and Frontend
            sections stale, had titled test #143 "survives a restart" wit
           hout reopening the store, had described the double-payment lim
           itation too mildly, and had listed an older database as driven
            through the UI when that run started from an empty one.
      141  - Step 9: all the new tests passed on the first implementation
           , so the AI broke the code on purpose to check them. Removing 
           `ignoreUndefined` broke no test, though saving `groupId: undef
           ined` as `null` would have stopped the database reopening. Fix
           : test #M19, which fails with that change.
      142 -- Step 9: the AI used `timeoutMS` without checking the install
          -ed driver, and told me each operation was limited to about 15 
          -seconds. Driver 7.8 marks that option deprecated with no effec
          -t, so the limit didn't exist. Neither the tests nor the real-p
          -rocess check flagged it, though the driver prints a warning. I
          - caught it when I ran against Atlas. Fix: supported timeouts, 
          -test #M20 for deprecated options, and failure times measured r
          -ather than assumed.                                           
      142 +- Step 9: the AI used `timeoutMS` without checking the install
          +ed driver, and told me each operation was limited to about 15 
          +seconds. Driver 7.8 marks that option deprecated with no effec
          +t, so the limit didn't exist. Neither the tests nor the real-p
          +rocess check flagged it, though the driver prints a warning. I
          + raised it after my Atlas check. Fix: supported timeouts, test
          + #M20 for deprecated options, and failure times measured rathe
          +r than assumed.                                               
      143  - Step 9 planning: the AI's first plan had no way for a second
            instance to see writes, only a refusal when it wrote from sta
           le data. I asked for the revision check before each request, w
           ith a two-instance test.
      144  
      145  ## Re-prompts

⏺ Skill(review-step)
  ⎿  Successfully loaded skill

⏺ I'll keep this read-only: the diff, the rule checks, and a few repeat runs and
  probes that don't write any files.

⏺ Bash(git log --oneline -5; git status --porcelain | cut -c1-70; git diff HEAD
      --stat | tail -14 | cut -c1-80; echo "--- secrets"; git ls-files | grep -E
      '(^|/)\.env$…)
  ⎿  (No output)
  ⎿  (timeout 3m 20s)

⏺ Bash(cd /Users/jarvis/Projects/splitbot/server && cat > /dev/null <<'X'
      X…)
  ⎿  (No output)

⏺ Bash(cd /Users/jarvis/Projects/splitbot && grep -n "async
      refresh\|socketTimeoutMS\|maxCommitTimeMS\|seq: -1\|didCommit(txnId))"
      server/src/store-mongo.ts | cut -c1-…)
  ⎿  (No output)

⏺ Step 9 review: MongoDB Atlas store

  Verdict: Fix first. The code holds up, but PLAN.md is stale, one README.md
  claim has no evidence behind it, and DECISIONS.md understates a behaviour
  change.

  I reviewed the uncommitted changes on mongo, on top of 45003ab. No repo files
  changed, but one probe created a temp database in the system temp folder. I
  haven't deleted it because this review is read-only.

  Scope

  The change stays inside Step 9. The Step 8 change is text only, as you asked,
  with no vercel.json or deploy config. The migration script and explain() tests
  were cut as agreed.

  CLAUDE.md compliance

  ┌──────────────────┬──────────────────────────────────────────────────────┐
  │       Rule       │                        Result                        │
  ├──────────────────┼──────────────────────────────────────────────────────┤
  │ LLM never does   │ Pass: no agent or domain code changed.               │
  │ arithmetic       │                                                      │
  ├──────────────────┼──────────────────────────────────────────────────────┤
  │ Money is integer │ Pass: cents are stored as they are, and the schema   │
  │  cents           │ still requires integers on load.                     │
  ├──────────────────┼──────────────────────────────────────────────────────┤
  │ Writes go        │ Pass: the confirm route's logic didn't change, and   │
  │ through drafts   │ it now also returns 409 on a conflict with the draft │
  │                  │  restored (#M12).                                    │
  ├──────────────────┼──────────────────────────────────────────────────────┤
  │ Agent bounded to │ Pass: the agent loop didn't change.                  │
  │  5 tool calls    │                                                      │
  ├──────────────────┼──────────────────────────────────────────────────────┤
  │                  │ Pass: this was seen failing for Step 9 and again for │
  │ Tests first      │  #M20. Store code isn't strictly domain logic        │
  │                  │ anyway.                                              │
  ├──────────────────┼──────────────────────────────────────────────────────┤
  │ No tests         │ Pass: the only existing test file touched is         │
  │ weakened         │ env-example.test.ts, with 48 lines added and none    │
  │                  │ removed.                                             │
  ├──────────────────┼──────────────────────────────────────────────────────┤
  │ No key or URI    │ Pass: .env isn't tracked, and only the fake AIza     │
  │ printed or       │ strings in tests appear. No URI with credentials     │
  │ committed        │ appears in the repo, and logs show only store.path.  │
  └──────────────────┴──────────────────────────────────────────────────────┘

  Documentation violations (plan or log out of step with the code):
  1. PLAN.md:9: still says "Data lives in a JSON file. Runs locally."
  2. PLAN.md:29: the repo layout has no store-mongo.ts or store-select.ts. The
     same kind of gap was flagged in the Step 6 Part D review.
  3. PLAN.md:108: the heading still says the REST API is in server/src/index.ts,
     but routes are in app.ts. I fixed this in CLAUDE.md but not here.
  4. README.md:35: "The free Atlas tier is enough" has no evidence behind it.
     Your check confirms Atlas works, but neither of us recorded which tier you
     used.
  5. DECISIONS.md:110: understates the summary change (see Edge cases).
  6. DECISIONS.md:195: gives 517 server tests, but #M20 makes it 518, and the
     final count isn't logged.

  Edge cases

  - A malformed date inside the range is silently dropped. I ran this with an
    expense dated 2026-1-05 on the JSON store; the query code uses the same
    range logic in Mongo:

  | Query                          | Result       |
  |--------------------------------|--------------|
  | no range                       | 400          |
  | ?to=2026-01-31                 | 200, total 0 |
  | ?from=2026-01-01&to=2026-11-30 | 400          |
    January 2026 is the expense's real month, so the January query returns a
    wrong total rather than an error. DECISIONS.md:110 only describes dates
    "outside" the range. Only a hand-edited database can contain this date, so
    it's low risk, but the log should say so.
  - REST and the agent now disagree on this data. The agent's summary tool reads
    snapshot() and validates everything, so the same query can answer
    differently in each.
  - Ordering tie on data that was missing me: only if a database was filled
    outside the app without me. seq: -1 (store-mongo.ts:133) leaves other
    records' stored positions behind their list index, so one update that both
    adds and removes records can give two records the same seq. This comes from
    reading the code; I didn't run it. The app can't currently create that
    state, since there's no migration.
  - A commit that hits maxCommitTimeMS (store-mongo.ts:220): the read-back can
    run before the commit finishes, so the save reports as failed and then
    applies anyway. A retry could then duplicate it. This is the same known gap
    as the logged read-back failure, reached a different way.

  Missing tests

  1. Summary range on both stores: expense dated 2026-1-05 and GET
     /api/summary?to=2026-01-31 → 200 with total 0. This pins the behaviour, or
     a 400 if you decide to fix it.
  2. Conflict on other routes: stale instance and DELETE /api/expenses/:id → 409
     with nothing removed; stale instance and POST /api/groups → 409.
  3. Stalled connection: silent proxy and update() → rejects with StoreError,
     snapshot unchanged, within a set limit. The 10-second figure comes from a
     single throwaway probe, and #M20 only shows that no deprecated option is
     used.
  4. /api/summary when the Mongo query fails: driver error → 500 INTERNAL, with
     no driver message in the response or log.
  5. Shutdown: SIGTERM with an open connection → the process exits and the store
     closes. index.ts startup and signal handling have no automated test.

  Other risks

  - Shutdown can hang (index.ts:40): this is new behaviour in JSON mode too,
    since the process used to exit immediately. listener.close waits for
    requests in progress, and a second Ctrl-C still force-quits. It worked in
    the real-process check, but with no request in flight. On Render, SIGTERM
    could wait on a slow chat request.
  - Stalled database (store-mongo.ts:245): every /api request waits about 5
    seconds, and the first about 20, before answering from the cache. A
    dashboard refresh makes seven calls. This is logged.
  - With a single Render instance, the revision check has little to do: it adds
    a read to every request and causes the slowdown above, mainly to protect a
    setup you've decided not to use. You asked for it, so I'm only flagging it.
    An env flag to turn it off would be a separate decision.
  - Step 8, to check when you get there (none of this has been tried):
    - Vercel's rewrite timeout against a Render free-tier cold start.
    - Atlas network access from Render's outbound IPs.
    - Render's idle spin-down, which would lose open drafts.
  - concurrently: it asks for Node 22 while package.json:7 says 20.19. This was
    already there and is logged.
  - Your dev server: a tsx watch process (PID 56607), not started by my checks,
    has been running and restarts on source edits. If it's your Atlas run, it's
    now on the new timeout code.

  Test results: the Mongo and contract test files passed three runs in a row,
  65/65 each, with no flakiness and no mongod left behind. The last full npm
  test was 518 server and 161 client tests passing, with a clean typecheck.

  What to fix before committing

  1. Update PLAN.md:9, :29 and :108.
  2. Change or remove the free-tier claim at README.md:35, once you confirm
     which tier you used.
  3. Correct DECISIONS.md:110 to cover malformed dates inside the range, and add
     the final count of 518 at :195.
  4. Add missing test 1, which pins that behaviour.

  Tests 2–5 and the shutdown risk could go in as known limitations if you want
  to time-box this. I've made no changes, so tell me which of these to apply.

❯ Apply these, then stop:
  1. Update PLAN.md lines 9, 29 and 108.
  2. README free-tier claim is confirmed: I used the Atlas FREE tier (512 MB).
  Keep it and say so.
  3. Correct DECISIONS.md:110 to cover malformed dates inside the range, and
  log the final count of 518 server tests.
  4. Add missing test 1 to pin the summary-range behaviour.
  5. Shutdown: add a forced exit after 10 seconds if graceful close hangs, with
  a small test if quick.
     Log missing tests 2-4 and the stalled-database delay as known limitations.
  Delete the temp database your probe created. Run npm test and npm run
  typecheck.

⏺ Applying these. Test first: I'll add the pinning test and the shutdown test,
  confirm the shutdown test fails, and find the temp database before deleting
  it.

⏺ Update(server/test/store-api.contract.test.ts)
  ⎿  Added 18 lines
      103      }
      104    });
      105  
      106 +  it('#A5 known limit: with a range, a malformed date the rang
          +e filter drops gives no error, even in its real month', async 
          +() => {                                                       
      107 +    const store = await h.open();                             
      108 +    await store.update((db) => db.expenses.push(expense('me', 
          +{ me: 100 }, { date: '2026-1-05' })));                        
      109 +    const app = appFor(store);                                
      110 +    const summary = (query: string) => request(app).get(`/api/
          +summary${query}`);                                            
      111 +                                                              
      112 +    expect((await summary('')).body.error.code).toBe('INVALID_
          +DATE');                                                       
      113 +    expect((await summary('?from=2026-01-01&to=2026-11-30')).b
          +ody.error.code).toBe('INVALID_DATE');                         
      114 +                                                              
      115 +    // "2026-1-05" sorts after "2026-01-31" as text, so Januar
          +y's query misses it and reports nothing wrong.                
      116 +    const january = await summary('?to=2026-01-31');          
      117 +    expect(january.status).toBe(200);                         
      118 +    expect(january.body.totalCents).toBe(0);                  
      119 +    const december = await summary('?from=2026-12-01');       
      120 +    expect(december.status).toBe(200);                        
      121 +    expect(december.body.totalCents).toBe(0);                 
      122 +  });                                                         
      123 +                                                              
      124    it('#A4 every /api request checks for outside writes first',
            async () => {
      125      const store = await h.open();
      126      let checks = 0;

⏺ Update(server/test/store-api.contract.test.ts)
  ⎿  Added 1 line
       4  import type { Store } from '../src/store';
       5  import { createApp } from '../src/app';
       6  import { createDraftStore } from '../src/drafts';
       7 +import { expense } from './helpers';                           
       8  import { MONGO_START_TIMEOUT_MS, MONGO_TEST_TIMEOUT_MS, startMo
          ngo, type TestMongo } from './mongo-helper';
       9  import { jsonHarness, mongoHarness, type StoreHarness } from '.
          /store-harness';
      10  

⏺ Write(server/test/shutdown.test.ts)
  ⎿  Wrote 59 lines to server/test/shutdown.test.ts
       1 import { afterEach, beforeEach, describe, expect, it, vi } from
         'vitest';
       2 import { gracefulShutdown, SHUTDOWN_TIMEOUT_MS } from '../src/sh
         utdown';
       3
       4 const never = () => new Promise<void>(() => undefined);
       5
       6 describe('gracefulShutdown', () => {
       7   beforeEach(() => {
       8     vi.useFakeTimers();
     … +51 lines (ctrl+o to expand)

⏺ Bash(cd /Users/jarvis/Projects/splitbot/server && npx vitest run
      test/shutdown.test.ts test/store-api.contract.test.ts 2>&1 | grep -E
      "FAIL|Tests  |Cannot find" | cu…)
  ⎿  (No output)

⏺ The shutdown test fails as expected, and #A5 already passes since it pins
  existing behaviour. I'm deleting the probe folder rv-1rWJEv, which holds only
  db.json, and then starting the implementation.

⏺ Write(server/src/shutdown.ts)
  ⎿  Wrote 31 lines to server/src/shutdown.ts
      1 // Closes the server and the store on a signal, and forces an exi
        t if either hangs.
      2 export const SHUTDOWN_TIMEOUT_MS = 10_000;
      3
      4 export interface ShutdownDeps {
      5   closeServer: () => Promise<void>;
      6   closeStore: () => Promise<void>;
      7   exit: (code: number) => void;
      8   log: (message: string) => void;
      9 }
     … +22 lines (ctrl+o to expand)

⏺ Update(server/src/index.ts)
  ⎿  Added 6 lines, removed 1 line
      37  
      38  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      39    process.once(signal, () => {
      40 -    listener.close(() => void store.close().finally(() => proce
         -ss.exit(0)));                                                  
      40 +    gracefulShutdown({                                         
      41 +      closeServer: () => new Promise((resolve) => listener.clos
         +e(() => resolve())),                                           
      42 +      closeStore: () => store.close(),                         
      43 +      exit: (code) => process.exit(code),                      
      44 +      log: (message) => console.error(message),                
      45 +    });                                                        
      46    });
      47  }

⏺ Update(server/src/index.ts)
  ⎿  Added 1 line
       8  import { createApp } from './app';
       9  import { describeEnv, loadEnv, localToday, REPO_ROOT } from './
          config';
      10  import { createDraftStore } from './drafts';
      11 +import { gracefulShutdown } from './shutdown';                 
      12  import { openConfiguredStore, storeConfigFromEnv } from './stor
          e-select';
      13  
      14  // Load config before reading any env var.

  Made 1 scratchpad edit +29 (ctrl+o to expand)

⏺ Bash(T=$(node -p 'require("os").tmpdir()'); rm -r "$T/rv-1rWJEv"; ls -d
      "$T"/rv-* 2>/dev/null; echo "temp db removed"; cd
      /Users/jarvis/Projects/splitbot/server && n…)
  ⎿  (No output)
  ⎿  (timeout 5m)
⏺ The stuck-connection test exited in zero seconds, so it never exercised the
  forced exit; my script probably signalled before that connection opened. I'll
  make the script wait for the connection and rerun.

  Made 1 scratchpad edit +4 -4 (ctrl+o to expand)

⏺ Bash(zsh /private/tmp/claude-501/-Users-jarvis-Projects-splitbot/754fc146-e3b0
      -4347-a779-245424d21f88/scratchpad/shutdown-check.sh 2>&1 | cut -c1-150;
      echo "--- left…)
  ⎿  (No output)
  ⎿  (timeout 1m 30s)

⏺ Now the forced exit is confirmed for real: an idle server exits 0 straight
  away, and one with a stuck request exits 1 at 10 seconds. Final counts are 524
  server and 161 client tests. On to the docs.

⏺ Update(PLAN.md)
  ⎿  Added 1 line, removed 1 line
       6  Constraints:
       7  - About 1.5 days to build, $0 cost (Gemini free tier).
       8  - TypeScript throughout: Node + Express backend, React frontend
          .
       9 -- Single user, no login. Data lives in a JSON file. Runs locall
         -y. Free deployment is a stretch goal.                          
       9 +- Single user, no login. Data lives in a JSON file by default, 
         +or MongoDB Atlas with `STORE=mongo` (Step 9). Runs locally. Fre
         +e deployment is a stretch goal (Step 8).                       
      10  
      11  The repo is empty, so this is a new build.
      12  

⏺ Update(PLAN.md)
  ⎿  Added 4 lines, removed 1 line
      26      src/index.ts          # entry point: loads config, CORS, op
          ens the store, listen
      27      src/config.ts         # loads the repo-root .env (whatever 
          the start folder); startup line without values
      28      src/app.ts            # createApp(deps): Express routes + J
          SON error handler (testable with supertest)
      29 -    src/store.ts          # JSON file store (server/data/db.jso
         -n): in-memory cache, atomic write (tmp + rename), serialized wr
         -ite queue                                                      
      29 +    src/store.ts          # Store interface; JSON file store (s
         +erver/data/db.json): in-memory cache, atomic write (tmp + renam
         +e), serialized write queue                                     
      30 +    src/store-mongo.ts    # MongoDB store (Step 9): the same in
         +terface, with a cache, transactions and a revision check       
      31 +    src/store-select.ts   # picks the store from STORE and MONG
         +ODB_URI (Step 9)                                               
      32 +    src/shutdown.ts       # closes the server and store on a si
         +gnal; forced exit after 10 seconds (Step 9)                    
      33      src/domain/split.ts   # computeShares(): equal | exact | pe
          rcent | shares, plus itemized adjustments
      34      src/domain/balances.ts# net balances, pairwise "who owes wh
          om"
      35      src/domain/settle.ts  # greedy settle-up (at most n−1 trans
          fers): largest creditor vs largest debtor

⏺ Update(PLAN.md)
  ⎿  Added 1 line, removed 1 line
      108  - Default currency is $.
      109  - When asked about money, quote the numbers from tool results 
           only.
      110  
      111 -## REST API (server/src/index.ts)                             
      111 +## REST API (server/src/app.ts)                               
      112  - `POST /api/chat` `{ messages }` → `{ reply, drafts }`
      113  - `POST /api/drafts` creates an expense or settlement draft fr
           om name-based input (the same builder the agent's tools use). 
           The manual form fallback and Settle up's "Record" use it, so e
           very write goes through a draft and the app still works when G
           emini is unavailable.
      114  - `PATCH /api/drafts/:id` applies edits and returns the recomp
           uted draft without saving.

⏺ Update(PLAN.md)
  ⎿  Added 1 line, removed 1 line
      500  | `server/src/store-mongo.ts` | `openMongoStore(uri, { dbName?
           , log?, hooks? })`: cache, transactions, revision check, uncer
           tain-commit check. Collections `meta`, `people`, `expenses`, `
           settlements`, `groups`; database `splitbot` |
      501  | `server/src/store-select.ts` | `storeConfigFromEnv`, `openCo
           nfiguredStore`; loads the driver only in Mongo mode |
      502  | `server/src/app.ts` | `/api` middleware awaits `store.refres
           h()`; `/api/summary` with a range uses `findExpenses`; `StoreC
           onflictError` → 409 `STORE_CONFLICT` |
      503 -| `server/src/index.ts`, `.env.example` | Use the selector, cl
          -ose the store on shutdown; `STORE=json`, empty `MONGODB_URI` |
      503 +| `server/src/index.ts`, `server/src/shutdown.ts`, `.env.examp
          +le` | Use the selector, close the server and store on a signal
          + with a forced exit after 10 seconds (#D); `STORE=json`, empty
          + `MONGODB_URI` |                                              
      504  | `server/test/store.contract.test.ts`, `store-api.contract.te
           st.ts` | The same cases against both stores (#S, #A) |
      505  | `server/test/store-mongo.test.ts`, `store-select.test.ts`, `
           env-example.test.ts` | Mongo-only behaviour (#M), selection (#
           SEL), URI guards |
      506  | `server/test/mongo-helper.ts`, `store-harness.ts` | `MongoMe
           moryReplSet` (transactions need a replica set) and one way to 
           drive either store |

⏺ Update(README.md)
  ⎿  Added 1 line, removed 1 line
      32  MONGODB_URI=<your Atlas connection string>
      33  ```
      34  
      35 -The free Atlas tier is enough. Data goes in a database named `s
         -plitbot`, which starts empty; there is no import from `db.json`
         -. If `STORE=mongo` has no URI, the server won't start, rather t
         -han saving to the JSON file by mistake.                        
      35 +The free Atlas tier (512 MB) is enough; it's what this was chec
         +ked on. Data goes in a database named `splitbot`, which starts 
         +empty; there is no import from `db.json`. If `STORE=mongo` has 
         +no URI, the server won't start, rather than saving to the JSON 
         +file by mistake.                                               
      36  
      37  ## Tests and eval
      38  ```sh

  Read 1 file (ctrl+o to expand)

⏺ Update(DECISIONS.md)
  ⎿  Added 2 lines, removed 1 line
      107  - **Drafts don't work across instances (Step 9).** The revisio
           n check covers saved data only. Drafts are in memory, so a Con
           firm that reaches another instance gets 404 `DRAFT_NOT_FOUND`.
            Test #M15 documents this, and the two-process check showed it
            too. Serverless hosting needs shared drafts before it can wor
           k.
      108  - **Uncertain commits (Step 9).** Each transaction records its
            id in `meta.recentTxnIds`, the last 20. After an error, that 
           id says whether the commit applied, so a lost reply doesn't ca
           use a retry that saves a duplicate. Known gap: if the read-bac
           k fails too, the save is reported as failed even if it applied
           , and a retry can duplicate it. The next check does load the c
           ommitted data.
      109  - **No fallback and no secrets in errors (Step 9).** A bad `ST
           ORE` or a missing URI stops startup, because falling back woul
           d save to the wrong place. Mongo errors keep only the driver e
           rror's type and code, because its messages can hold hosts or t
           he URI. The database is always named `splitbot`, so an Atlas U
           RI with no database name doesn't write to the driver's default
            `test`.
      110 -- **Filtered summaries validate less (Step 9).** With a date r
          -ange, `/api/summary` validates only expenses in that range, so
          - a bad date outside it no longer gives a 400. Only a hand-edit
          -ed database can contain one. This applies to both stores.     
      110 +- **Filtered summaries validate less (Step 9).** With a date r
          +ange, `/api/summary` validates only the expenses the range fil
          +ter keeps, and that filter compares dates as text. So a malfor
          +med date can be dropped even inside the range it really belong
          +s to, and the answer is wrong rather than an error: an expense
          + dated `2026-1-05` gives 200 with total 0 for `?to=2026-01-31`
          +, because `2026-1-05` sorts after `2026-01-31`. The same expen
          +se still gives a 400 with no range or with `?from=2026-01-01&t
          +o=2026-11-30`. The agent's summary tool still validates everyt
          +hing, so it can disagree with REST on the same data. Only a ha
          +nd-edited database can contain such a date. This applies to bo
          +th stores, and test #A5 pins it as a known limit.             
      111 +- **Forced exit on shutdown (Step 9).** The signal handlers I 
          +added in this step meant a stuck request could stop the proces
          +s exiting, in JSON mode too. `server/src/shutdown.ts` now clos
          +es the server and then the store, and exits 1 if that takes mo
          +re than 10 seconds. Second Ctrl-C still kills it straight away
          +. Trade-off: a request still running at 10 seconds is cut off,
          + but a save either commits or rolls back.                     
      112  - **Cut for time (Step 9).** I cut the db.json migration scrip
           t, because I'm starting with fresh data, and the `explain()` i
           ndex tests. So `#M3` checks that the indexes exist, not that q
           ueries use them.
      113  - **Deploy: frontend on Vercel, API on one Render instance (St
           ep 8 plan).** Vercel rewrites `/api/*` to Render, so the brows
           er calls its own origin and CORS doesn't change. Data lives in
            Atlas, because Render's free disk is ephemeral. I chose this 
           over running the API on Vercel, which would have needed drafts
            moved into Mongo plus a handler wrapper. Trade-off: one insta
           nce and in-memory drafts, so a Render restart loses open draft
           s, but saved data is safe. The revision check stays, though wi
           th one instance it has little to do.
      114  - **Supported timeouts instead of `timeoutMS` (Step 9).** The 
           driver has deprecated `timeoutMS` and ignores it. It now uses 
           `connectTimeoutMS` 5 s, `socketTimeoutMS` 15 s, `waitQueueTime
           outMS` 5 s and `maxCommitTimeMS` 10 s, with server selection a
           t 5 s as before. Measured with a real `mongod` behind a proxy 
           that went silent: a write failed after 10 s, the first request
           's check took 20 s, and later checks took 5 s each before answ
           ering from the cache. Trade-off: these limit each step, not a 
           whole operation. The driver's `withTransaction` can keep retry
           ing transient errors for up to 120 s, though it didn't in this
            run.

⏺ Update(DECISIONS.md)
  ⎿  Added 1 line, removed 1 line
      112  - **Cut for time (Step 9).** I cut the db.json migration scrip
           t, because I'm starting with fresh data, and the `explain()` i
           ndex tests. So `#M3` checks that the indexes exist, not that q
           ueries use them.
      113  - **Deploy: frontend on Vercel, API on one Render instance (St
           ep 8 plan).** Vercel rewrites `/api/*` to Render, so the brows
           er calls its own origin and CORS doesn't change. Data lives in
            Atlas, because Render's free disk is ephemeral. I chose this 
           over running the API on Vercel, which would have needed drafts
            moved into Mongo plus a handler wrapper. Trade-off: one insta
           nce and in-memory drafts, so a Render restart loses open draft
           s, but saved data is safe. The revision check stays, though wi
           th one instance it has little to do.
      114  - **Supported timeouts instead of `timeoutMS` (Step 9).** The 
           driver has deprecated `timeoutMS` and ignores it. It now uses 
           `connectTimeoutMS` 5 s, `socketTimeoutMS` 15 s, `waitQueueTime
           outMS` 5 s and `maxCommitTimeMS` 10 s, with server selection a
           t 5 s as before. Measured with a real `mongod` behind a proxy 
           that went silent: a write failed after 10 s, the first request
           's check took 20 s, and later checks took 5 s each before answ
           ering from the cache. Trade-off: these limit each step, not a 
           whole operation. The driver's `withTransaction` can keep retry
           ing transient errors for up to 120 s, though it didn't in this
            run.
      115 -- **Known limitations (Step 9).** Uncertain commits are tested
          - through injected failures, not real driver error labels. The 
          -timeouts have no automated test beyond #M20 (no deprecated opt
          -ion); their numbers come from one run of a throwaway probe. Wh
          -ile the database is unresponsive, every `/api` request waits f
          -or the check first, so the app is slow rather than down. A fre
          -sh offline clone can't pass `npm test`, because the Mongo test
          -s need the downloaded binary, and I chose that over skipping t
          -hem. `concurrently` asks for Node 22 and warns on Node 20; thi
          -s was already the case and it still runs.                     
      115 +- **Known limitations (Step 9).** Uncertain commits are tested
          + through injected failures, not real driver error labels. The 
          +stalled-database delay is real: while the database is unrespon
          +sive, every `/api` request waits for the check first, about 20
          + seconds for the first and about 5 seconds each after that, so
          + the app is slow rather than down, and a dashboard refresh mak
          +es seven calls. Those numbers come from one run of a throwaway
          + probe. Tests not written, from the `/review-step`, to keep to
          + the time box: a stale `DELETE /api/expenses/:id` or `POST /ap
          +i/groups` answering 409 with nothing changed; a silent connect
          +ion making `update()` reject with `StoreError` and the snapsho
          +t unchanged, within a set limit (the only timeout test is #M20
          +, no deprecated option); and `/api/summary` answering 500 `INT
          +ERNAL`, with no driver message in the response or log, when th
          +e Mongo query fails. A fresh offline clone can't pass `npm tes
          +t`, because the Mongo tests need the downloaded binary, and I 
          +chose that over skipping them. `concurrently` asks for Node 22
          + and warns on Node 20; this was already the case and it still 
          +runs.                                                         
      116  
      117  ## Where AI got it wrong
      118  _(Log mistakes as they happen: what it did, how it was caught,
            and the fix.)_

⏺ Update(DECISIONS.md)
  ⎿  Added 2 lines, removed 1 line
      194  - Step 6 Part D: tests first (the new `charts` test file could
           n't load and the `getSummary` test failed), then 393 server an
           d 130 client tests passed with the typecheck clean. Headless C
           hrome screenshots on a scratch database showed the right value
           s in both toggle modes, a working hover tooltip and no console
            errors. They also caught what the tests couldn't: a long name
            was clipped on the balance chart, and at 1110px a negative am
           ount overlapped the name. Both were fixed (test #126 first for
            the shortening, plus a wider balance scale). At that width a 
           very long name still wraps to two lines and sits close to its 
           amount, but nothing is clipped or overlapping.
      195  - Step 6 Part E: tests first (24 server and 5 client tests fai
           led, plus the new client `groups` test file; the rest of the n
           ew tests pinned behaviour that already held), then 419 server 
           and 157 client tests passed with the typecheck clean. Headless
            Chrome on a scratch database drove the real UI: empty state, 
           create, duplicate name, add member, an API-added expense that 
           brought Mei in on Confirm, Record payment with the group prese
           lected, the group clearing after Confirm with `groupId` saved,
            and no console errors. Chat was off, so the dropdown on an ex
           pense card was checked only by static render and API tests.
      196  - Step 9: tests first (four new test files couldn't load and t
           he `.env.example` URI test failed, while 441 others still pass
           ed), then 517 server and 161 client tests passed with the type
           check clean. Existing test files only gained lines, in `env-ex
           ample.test.ts`. Five deliberate breaks: writes outside the tra
           nsaction, no commit check, no stale-write check and no middlew
           are each failed tests; the fifth, `ignoreUndefined`, needed ne
           w test #M19. Two real server processes on a local `mongod`: a 
           confirm on A showed on B's next request as balances +6400/−380
           0/−2600, the data survived a restart of B, a draft from A got 
           404 on B, no server log contained the URI, and nothing was lef
           t running. Not run against real Atlas.
      197 -- Step 9 Atlas check, run by me with my own URI: the app conne
          -cted to MongoDB Atlas, I confirmed an expense, and it survived
          - a restart. Confirm runs in a transaction, so this also shows 
          -transactions work on my cluster.                              
      197 +- Step 9 Atlas check, run by me with my own URI on the Atlas F
          +REE tier (512 MB): the app connected, I confirmed an expense, 
          +and it survived a restart. Confirm runs in a transaction, so t
          +his also shows transactions work on the free tier.            
      198 +- Step 9 final counts: 518 server tests at the `/review-step` 
          +(517 plus #M20). The fixes from that review added #A5 on both 
          +stores and four shutdown tests, so the final count is 524 serv
          +er and 161 client tests, with the typecheck clean. #A5 passed 
          +from the start because it pins existing behaviour; the shutdow
          +n test file failed first because its module didn't exist. A re
          +al server on a scratch JSON file exited 0 straight away when i
          +dle, and exited 1 at 10 seconds with a request stuck half-sent
          +. My first run of that check exited at once because the script
          + signalled before the connection was open, so it proved nothin
          +g and I fixed the script. The forced exit wasn't run in Mongo 
          +mode.                                                         
      199  
      200  ## What I'd do differently
      201  - Put important rules in code from the start, not in the promp
           t.

⏺ Update(DECISIONS.md)
  ⎿  Added 1 line
      166  - Step 6 Part E: after `/review-step` I gave a time-boxed fix 
           list: approve the member exception, update the stale PLAN.md s
           ections, make test #143 reopen the store, add a note on the ov
           erall tab with a test documenting the double payment and an ho
           nest limitation, say "Nothing to settle yet" for a group with 
           no records, collapse inner spaces in group names, and add the 
           "Use Arun" and failed-write tests. The rest went in as known l
           imitations.
      167  - Step 9: I asked for a plan only. I chose the cached option, 
           with a revision check per request for Vercel and a two-instanc
           e test, called it Step 9, accepted the first-run download and 
           Mongo tests failing offline, and cut the migration script and 
           `explain()` tests.
      168  - Step 9: after my Atlas check I asked for `timeoutMS` to be r
           eplaced with supported timeouts, the Atlas result logged, and 
           the deploy decision recorded in PLAN.md Step 8: frontend on Ve
           rcel, API on a single Render instance.
      169 +- Step 9: after `/review-step` I asked for the stale PLAN.md l
          +ines to be updated, the free-tier claim kept now that I'd conf
          +irmed my tier, the summary behaviour described correctly and p
          +inned with a test, a forced exit after 10 seconds on shutdown,
          + and the other missing tests and the stalled-database delay lo
          +gged as known limitations.                                    
      170  
      171  ## Where AI sped me up / got in the way
      172  - Sped me up: scaffolding, the plan structure, and enumerating
            split-engine edge cases.

⏺ All five fixes are done, the limitations are logged, and the temp database
  (rv-1rWJEv) is deleted. npm test passes with 524 server and 161 client tests,
  and npm run typecheck is clean. Only docs changed after that run, and nothing
  is committed.

  The 518 count has moved: you asked me to log 518, but the new tests took it to
  524. DECISIONS.md records both: 518 at the review, and 524 as the final count
  after these fixes.

  1. PLAN.md: lines 9 and 108 are corrected, and the repo layout at line 29 now
     lists the new store files. I also added shutdown.ts to the layout and the
     Step 9 file table.
  2. Free tier: README.md keeps the claim and says it was checked on the 512 MB
     tier. The Atlas check entry in DECISIONS.md says the same.
  3. DECISIONS.md summary entry: it now covers malformed dates inside the range,
     using the 2026-1-05 example, and notes that the agent can disagree with
     REST on the same data.
  4. Test #A5: it pins that behaviour on both stores. It passed from the start
     because the behaviour already existed, so it records the limit rather than
     fixing it.
  5. Shutdown: the new server/src/shutdown.ts forces an exit after 10 seconds,
     with four small tests that failed first because the module didn't exist. I
     also ran a real server on a scratch JSON file:

  | Case                    | Result                |
  |-------------------------|-----------------------|
  | Idle                    | exits 0 straight away |
  | Request stuck half-sent | exits 1 at 10 seconds |
     My first run of the stuck case exited at once because the script signalled
     before the connection was open, so it proved nothing. I fixed the script
     and reran it; both runs are logged. The forced exit hasn't been run in
     Mongo mode.

  Choices to check in the shutdown code:
  - A forced exit or a failed close exits with code 1, and only a fixed message
    is logged, so a driver error can't leak the URI.
  - A request still running at 10 seconds gets cut off.

  Logged as known limitations: missing tests 2–4 and the stalled-database delay.