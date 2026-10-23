# Contributing

How to set up, make a change and get it merged. The wider process is in
[docs/sdlc.md](docs/sdlc.md); the system is described in
[docs/architecture.md](docs/architecture.md).

## Set up

You need Node.js 20 (see `.nvmrc`) and Python 3.11. There is nothing to install for
the app or the tests.

```bash
npm start                 # static app at http://localhost:8080
npm test                  # app, content and pack tests
npm run test:portal       # staff portal tests
```

To run the server with the API and the staff portal:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m server.admin demo            # demo staff accounts; passwords print once
python serve.py
```

Open the app through `http://localhost`, not a LAN address or a file path, or the service
worker will not run.

## Which kind of change is it?

| You are changing | Edit | Then |
|---|---|---|
| A game rule | `js/engine.js` | Add a unit test |
| A screen or interaction | `js/main.js`, `css/app.css` | Play it in a browser, including offline |
| A shared card or chapter | `content/chapters/*.json`, `content/core.json` | `npm test`; bump `version` in `core.json` |
| One institution's details | Its pack, through the portal or `intake/` | `npm run pack:check <id>` |
| Interface wording | `i18n/en.json` and `i18n/zu.json` | `npm test` checks every key exists in both |
| Portal rules | `server/portal.py` | Add a test in `test/test_portal.py` |
| Database schema | A new migration in `server/db.py` | Never edit an existing migration |

## Rules of the codebase

- **Game logic never touches the DOM.** `engine.js`, `forecast.js`, `budget.js` and
  `content.js` must keep running in Node.
- **Nothing about an institution lives in code.** It goes in that institution's pack.
- **Engine functions do not mutate their input.** They take a state and return a new one.
- **Every string that reaches the page goes through `esc()`**, including content.
- **Every server call from the app is optional.** It must time out and fail quietly.
- **No new runtime dependency** without a [decision record](docs/adr/README.md).
- **Content text** is written in English only and must pass the writing rules: situation at
  most 40 words, labels at most 6 words, 2 to 3 choices, outcomes at most 2 sentences. Other
  languages live in `content/lang/<lang>.json`, keyed by the English: run
  `node tools/translate.mjs` to fill in new or reworded text.
- **Phone numbers** appear only for verified national services or verified licensed packs.
- Match the style of the file you are in. Comments say why, not what.

## Making a change

1. Open or pick up an issue that states what done looks like.
2. Branch from `main`: `feat/…`, `fix/…`, `content/…` or `docs/…`.
3. Make the change with its test.
4. Bump the version numbers it affects
   ([which ones](docs/data-model.md#version-numbers)). If any file the app loads changed,
   that includes `VERSION` in `sw.js`.
5. Update any document the change makes untrue.
6. Run both test suites.
7. Open a pull request.

## Commit messages

Start with a short imperative summary, at most about 70 characters. Add a body when the
reason is not obvious from the summary.

```
Hide campus phone numbers unchecked for 400 days

A number that nobody has re-verified should not be shown to a student
in a crisis. National lines are always kept.
```

## Pull requests

Describe what changed and why, how you tested it, and tick the
[definition of done](docs/sdlc.md#definition-of-done). Keep a pull request to one purpose;
separate content changes from code changes where you can, since different people review
them.

A reviewer other than the author approves before merge.

## Reporting a security problem

Do not open a public issue. See
[docs/security-privacy.md](docs/security-privacy.md#reporting-a-problem).
