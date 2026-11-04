# SplitBot

SplitBot is a Splitwise-style web app that you drive with plain English. Type "Dinner $90, I paid, split with Arun and Mei, Arun had $12 of drinks", and a Gemini agent turns it into a draft expense for you to check and confirm. The app tracks who owes whom, suggests how to settle up, and charts spending by category.

## The problem it solves
Entering shared expenses by hand is slow, especially when a bill isn't an even split. A chatbot is faster, but an LLM can't be trusted with money: it can miscalculate a share or invent an amount. SplitBot keeps the speed of chat and removes that risk. Gemini only extracts the structure of what you typed, tested TypeScript calculates every amount, and nothing is saved until you click Confirm.

## Setup
You need Node 20 or later and a free Gemini API key. It costs nothing to run on the free tier.

```sh
npm install
cp .env.example .env
```

Get a key from [Google AI Studio](https://aistudio.google.com/apikey) and set `GEMINI_API_KEY` in `.env`. `.env` is gitignored, so never put a real key in `.env.example`, which is committed.

## Run the app
```sh
npm run dev
```

Open the address Vite prints, normally http://localhost:5173. The API runs on port 3001 (`PORT` in `.env`), and data is saved to `server/data/db.json`.

Without a key, the chat answers with a "not configured" message and the rest of the app still works.

## Tests and eval
```sh
npm test            # all server and client tests; no key or network needed
npm run typecheck   # type-check every workspace
```

The eval sends 15 example sentences to real Gemini and compares the tool calls and resulting drafts with the expected values. It uses a temporary database, but it does use your free quota.

```sh
npm run eval -w server                       # all 15 cases
npm run eval -w server -- 2 7 --repeat 3     # chosen cases, 3 times each, to see how consistent they are
```

## Architecture
- **Monorepo:** TypeScript npm workspaces. `shared` holds types and money helpers, `server` is Node + Express, and `client` is React + Vite.
- **Agent (`server/src/agent/`):** a Gemini function-calling loop, capped at 5 tool calls per message. It asks a question when something is unclear, and guardrails check the model's output before a draft reaches you.
- **Money logic (`server/src/domain/`):** pure functions compute every share, balance and transfer in integer cents. The model never does this arithmetic.
- **Writes:** tools create in-memory drafts with a 30-minute expiry, and an expense or payment is saved only when you click Confirm. Data is stored in one JSON file, using atomic writes through a queue.
- **Client (`client/src/`):** three columns: account summary, tabs (Smart settle up, Expenses, Charts, Groups) and chat. The Vite proxy forwards `/api` to the server, and the Gemini key stays on the server.

## Key decisions
[DECISIONS.md](DECISIONS.md) starts with a [summary](DECISIONS.md#summary) of the main decisions and of where the AI got things wrong, followed by the full log. The main decisions are:

- The LLM extracts and code calculates.
- All money is integer cents, with a fixed rule for leftover cents.
- Every expense and payment goes through a draft.
- Guardrails warn on drafts, and block only when the model guesses who took part.
- A JSON file instead of a database.

The full build history is in [docs/ai-sessions/](docs/ai-sessions/).

## Known limitations
- **A payment can be counted twice.** A payment recorded outside a group lowers the overall balance but not the group's, so the group keeps suggesting it. Following that suggestion records it twice. The app warns about this but doesn't prevent it; deleting the extra payment in Expenses undoes it.
- **Adding an expense needs Gemini.** There is no manual expense form, so the UI can't add an expense without a working key and available quota.
- **Local, single user.** There is no login or deployment, and a host with an ephemeral disk would lose the JSON file.
- **Settle-up isn't always minimal.** The greedy method clears all balances in at most n−1 transfers, but it can use a transfer or two more than the true minimum.
- **Guardrails can be fooled.** "Sam" passes the named-person check because of the word "same", and a number or name from an earlier expense in the chat can hide a wrong one. Wording like "split 1/2" counts as a date phrase, so an invented date can get through. The date stays visible and editable on the card.
- **Groups are basic.** Groups and members can't be renamed or removed, and the agent can't assign a group; you choose it on the draft card.
- **Tab switches lose state.** Filters reset and an open Record payment card closes. Nothing is saved by accident.
- **Test gaps.** Client tests cover pure logic, fetch wrappers and static rendering, so clicks and layout were only checked by hand. A crash in the middle of a write isn't tested.
- **Eval gaps.** The final full run scored 15/15 (single run, `gemini-3.5-flash-lite`). #7, #9 and #14 pass after the model self-corrects from a rejected first call. The eval doesn't check dates.

The full list is in [DECISIONS.md](DECISIONS.md).
