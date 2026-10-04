# First Year Sim (proposal edition)

The backup app, built to the original **First_Year_Sim_Project_Proposal.pdf**. The main app
(University Simulator, in the project root) follows the more comprehensive build spec. This
one stays deliberately close to the proposal's MVP scope, so there's a working demo to fall
back on.

It is fully independent of the main app: its own engine, content, translations, offline
cache (`fys-proposal-v*`) and saved game (`fys-proposal:save`).

## Run it

From the project root, start either server as usual and open the `/proposal-app/` path:

```powershell
python serve.py          # then open http://localhost:8080/proposal-app/
```

`npm start` works the same way. With `ANTHROPIC_API_KEY` set, `serve.py` also writes the
forecast in words on the plan screen. Without it (or offline) the template plan is used.

## What's in it (proposal → app)

| Proposal | Here |
|---|---|
| Intro screens (2–3) | 3 screens: the problem and hook stat, how it works, what you leave with |
| Setup with UP options, hometown and laptop | UP Hatfield, course, housing, origin, funding, monthly money, laptop, family support |
| Money forecast appears straight away | Shown right after setup, with an on-time vs. late-allowance chart |
| Eight-week loop, three meters | Money, Marks, Wellbeing; a game week ≈ two real weeks |
| Weekly cards (weeks 1–8 table) | 1 module choice · 2 Societies Day · 3 allowance late · 4 family asks (or data runs out) · 5 test + assignment clash · 6 lonely (if you joined nothing) or can't sleep · 7 test week · 8 results and progression rules |
| Friday and small spends | Week 2 asks your going-out habit, charged automatically each week after essentials (changeable on the dashboard); weeks 4 and 6 offer a small spend. Accepted spends and subscriptions are never offered twice; a "forgotten subscription" card lets you cancel or share it |
| Surprise expense, accommodation scam, commuter events | One surprise in a random week; scam for private renters; taxi fares for commuters; gym debit order; paying a friend back |
| Real support cards | 15 UP services, unverified until confirmed with Student Affairs |
| Semester Forecast | Cash flow, spending leaks, coping profile, the two riskiest weeks and causes, and how the game adapted |
| Survival plan | Steps with week numbers, monthly budget, buffer target, late-allowance playbook, key dates, contacts |
| Share with family | Plain-language summary, shared on WhatsApp |
| Shareable image | Saves (or shares on phones) a PNG of the plan |
| One local language | English + isiZulu (isiZulu still needs review by a first-language speaker) |

Money never goes below zero: shortfalls are cut in order (groceries first, then transport,
then data and toiletries), and going without costs wellbeing or marks instead.

## Files

- `content/up.json`: every card, support service and setting. It's self-contained, so edit it
  directly. It was generated from the main app's content by `tools/build_proposal_content.py`;
  only rerun that if you want to copy card changes over from the main app (it overwrites
  local edits).
- `js/engine.js`: the game engine and forecast (pure functions, tested in Node).
- `js/app.js`: screens. `i18n/`: interface text. `sw.js`: offline cache. **Bump `VERSION` in
  `sw.js` whenever you change a file.**

Tests: `npm test` from the project root includes `test/proposal.test.mjs`, which plays every
setup combination through all eight weeks.
