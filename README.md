# University Simulator

A mobile-first, offline-capable web game (PWA) with a small Python server, where South
African students rehearse university life before it happens, from matric to graduation.
Demo universities: **Sizwe University** (three campuses) and **Karoo Coast University** (one
campus, built from the intake template). Both are fictional.

**Source of truth:** [First_Year_Sim_Build_Spec.md](First_Year_Sim_Build_Spec.md). The
proposal PDF is background. All events are **data, not code**: cards live in JSON files the
engine reads, so they can be added or rewritten without touching game logic.

There's no account and nothing personal is stored: progress stays on the device. The game and
the Semester Forecast run fully offline after the first load.

**Engineering docs:** architecture, data model, API, process, testing, security and the
runbook are in [docs/](docs/README.md). To contribute, start with [CONTRIBUTING.md](CONTRIBUTING.md).

**Independence:** Sizwe University is fictional. The app is independent of every real
university, uses no real university names or logos, and is not professional advice. Phone
numbers appear only for verified national services.

## Run it

**Python** (uses the project's `.venv`):

```powershell
.venv\Scripts\Activate.ps1
python serve.py                      # http://localhost:8080
```

**Node 18+** (also runs the tests):

```bash
npm start          # http://localhost:8080
npm test           # every chapter × every setup, plus content checks
npm run icons      # regenerate icons/
```

Service workers need `localhost` or HTTPS. To test on a phone, deploy (Netlify, GitHub
Pages) or use an HTTPS tunnel (`npx cloudflared tunnel --url http://localhost:8080`).
**When you change any file, bump `VERSION` in [sw.js](sw.js)** so players get the update.

### Server (serve.py, spec §11–12)

The app is bundled with its content packs and plays without the server. When the server is
reachable, the app uses it; when it is down, asleep or slow, the app carries on silently.

| Endpoint | Purpose |
|---|---|
| `GET /institutions` | Available institutions, each with its latest pack version, and which features are on |
| `GET /packs/{institution}` | Latest content pack with its version: `support`, `cards`, `minis`, `tips`, `costs` |
| `POST /stats` | Anonymous completion counts: `{device_id (random), chapter, completed, feedback?}` |
| `GET /stats` | Summary of those counts. The About screen shows "Tested by X students" from it, and nothing if there are none |

- The saved game stores its pack version. If a newer pack arrives, an unfinished chapter
  restarts on the new content and finished chapters are kept.
- `/stats` validates its schema, is rate-limited per device and per address, keeps one row
  per device and chapter, and refuses cross-origin posts unless the origin matches
  `FYS_APP_ORIGIN`. The app keeps a completion on the phone until the server has taken it.
- Secrets live in server environment variables, never in front-end code. Only the app's own
  folders are served; `data/`, server code, tools and documents are refused.
- A phone downloads its university's pack only when the server lists a newer version.
- All card and pack text is rendered as plain text, never HTML.
- Deploy behind HTTPS.

## The journey (spec §8)

The app opens on the onboarding pages, then the home screen: **Character setup, Before You
Apply, First Year, Middle Years and Final Year**. Every chapter is built and open, so a learner
still deciding can start with the Prequel and a second-year can start at Middle Years.

Setup asks nine questions (spec §2): institution, status, course, housing, funding, origin,
laptop, family needs and age/role, plus the monthly amount the budget is built on.

| # | Chapter | Cards / minis per run | File |
|---|---|---|---|
| — | Prequel: Before You Apply (4 steps) | 7 / 2 | [prequel.json](content/chapters/prequel.json) |
| 0 | Arrival (3 steps) | 5 / 2 | [arrival.json](content/chapters/arrival.json) |
| 1 | First Term (8 weeks, ~10 min) | 9 / 4 | [first_term.json](content/chapters/first_term.json) |
| 2 | First Exams (6 weeks) | 7 / 3 | [first_exams.json](content/chapters/first_exams.json) |
| 3 | Bounce Back (6 weeks) | 5 / 2 | [bounce_back.json](content/chapters/bounce_back.json) |
| 4 | Middle Years (6 weeks) | 9 / 3 | [middle_years.json](content/chapters/middle_years.json) |
| 5 | Finish Line (6 weeks) | 6 / 2 | [finish_line.json](content/chapters/finish_line.json) |

**Run budgets (spec §6).** Each chapter file sets `budget: { cards, minis }`. Only cards with
choices count; wins, tests and results don't. Fixed-week core cards come first. Where an
adaptive card should replace a core card for some players (a loan shark, outstanding fees, a
cut bursary), both share `slot: "spine"` and the first one whose conditions match wins the
week. Whatever room is left is filled from the `slots` pools (situational, surprise, outage,
friend's story, light), at most one a week, in a weighted random order.

**Minis** show on the week dashboard: one tap, exactly two options, a one-line result. A
chapter uses its own `minis` first, then the shared ones in [core.json](content/core.json).
Minis move hidden trackers (`confidence`, `connection`, `bunk_count`), which feed the forecast. A
mini about a small spend (KFC with friends, a jacket on sale) also costs what it says, as a
spending leak, and its paid answer is disabled when the player can't afford it.

Each week: dashboard (and mini) → that week's cards → next week. **Friday nights are a
habit**: the first Friday asks how often you go out; after that the cost comes off every week
after food and transport, and a "getting home safely" mini can follow. About half the Friday
weeks offer one **small spend**. Every chapter ends with the **Semester Forecast** and a
**survival plan**; Finish Line ends with the **journey summary and fair-game reflection**.

**Money rules.** Living costs are capped at a share of the money in hand, and no payment can
take the last R50, so money never reaches zero. A choice the player cannot pay for is shown but
disabled. When more than a month of basics is in hand, half the spare goes on "everyday extras"
at the end of the week, and part-time income ends with its chapter, so money does not pile up.
Minis never change marks or wellbeing. After tests, the marks meter is set to the average
of the module marks. On the outcome screen, "Change my answer" undoes the last choice.

Shared random pools live in [core.json](content/core.json) (`events`): **surprise expenses**
(FT-R1 in the spec: stolen phone, broken laptop, lab coat, course pack, doctor) and the
**repayment** card for anyone who borrowed from a friend.

## Card schema (spec §5)

```json
{
  "id": "FT-03", "type": "core", "week": 3,
  "conditions": { "funding": ["nsfas", "bursary"] },
  "title": { "en": "...", "zu": "..." }, "text": { "en": "...", "zu": "..." },
  "choices": [
    { "id": "help", "label": {...}, "tags": ["help_seeker"],
      "effects": { "money": 400, "wellbeing": 4 },
      "flags": ["used_food_support"], "support": ["food_programme", "financial_aid_office"],
      "tip": {...}, "outcome": {...} }
  ],
  "forecast_tags": ["money_shortfall"], "research": "USAf Understanding Students Issue 2 (2018)"
}
```

- **Types:** `core`, `situational`, `random` (from a `pool`), `recurring`, `friend_story`
  (never scored on the meters; `realities` links it to a Campus Realities topic), `win`,
  `light`, `mini`, plus `tests` and `results`. A `tip` is one sentence on a choice or a
  support card.
- **Conditions:** any setup key (`laptop` and `family_needs` are `"yes"`/`"no"`), plus
  `flags`, `notFlags`, `trackers` (`{"connection": {"lte": 1}}`), `habit`, `moneyBelow`,
  `helpMax`, `marksGte`, `week`, and `tests` (`anyFail`, `worstLt`, `bestGte`).
- **Effects:** meters (`money` in rand, `marks`, `wellbeing`) and hidden trackers
  (`connection`, `buffer`, `help_seeking`, `family_obligation`, `confidence`, `debt`,
  `bunk_count`). A `help_seeker` tag adds `help_seeking` and `confidence`, an `avoider` tag
  lowers `confidence`, a `connector` tag adds `connection`, and every win adds `confidence`.
- **Extras:** `variants` (text or effects by condition), `content_note` (shows a note with a
  skip option first), `surprise` (a buffer softens the cost), `amount` (scales with income),
  `later`, `recurring` / `cancelRecurring`, `followUp`.
- **Chapter files** set `weeks`, `budget`, `economy`, `friday`, `tests` (modifiers,
  `failFlag`, `recoverFlag`), `slots` and `minis`.
- **Writing rules** (checked by `npm test`): situation ≤ 40 words, labels ≤ 6 words, 2–3
  choices (minis exactly 2), outcomes ≤ 2 sentences. FT-01, FT-02, EX-02, BB-03 and MY-01 carry the 4–5
  choices the chapter tables and play-testing asked for. First Term and Middle Years run one card
  over the spec budget (the textbook card and the academic-skills workshops card).
- **Support cards:** generic in `core.json`; an institution file overrides names and how to
  reach them. Each has `verified` and `last_checked`. Sizwe's services are fictional: names
  and descriptions only, no phone numbers.
- **Campuses:** an institution file may list `campuses`. A campus is one more layer over the
  university: it can set its own `map`, `costs`, `pages`, `courses` and per-service `support`
  details (`building`, `room`, `hours`), or mark a service as elsewhere with `away`. Anything it
  leaves out comes from the university. Setup asks "Which campus?" only when there is more than
  one, and cards can be limited to a campus with `"conditions": { "campus": [...] }`.
- **Content pack:** [institutions/](content/institutions/) holds one file per version with
  its `version`, `costs` (`rent_private`, `taxi_week`) and support overrides. The server
  assembles the full pack from it, `core.json` and the chapter files.

## Semester Forecast (spec §10)

| Part | How it works |
|---|---|
| Money forecast | Weekly cash flow from setup: the week money runs out, on time and late |
| Spending leaks | Friday nights, takeaways, clothes, data and subscriptions, per month and in weeks of food money |
| Coping profile | The top coping tag this chapter ("You avoided help 5 times out of 8") |
| Risk weeks | The **next** chapter's cards, each carrying `forecast_tags`, weighted by this player's vulnerabilities (low money, low connection, debt, failed modules...) → its 2 riskiest weeks |
| Adaptive events | Conditions read live trackers: low connection → loneliness; in debt → loan shark; never asked for help → tutor check-in; borrowed → repayment card |
| Memory | "In First Term you avoided help 5 of 8 times. This chapter..." The recurring cards quote it too |
| Fair game | The final screen lists what made this setup's start harder or easier, and the supports that level the field |

These are transparent, research-based rules, and the app says so. Nothing in the forecast is
written or decided by an AI model.

## Campus Realities (spec §9)

A separate, opt-in card on the home screen: [realities.json](content/realities.json). All ten
topics from the spec are built. Each topic plays card by card, like a chapter, through the five
parts: recognise it, a short scenario with explanatory feedback, if it happens to you, if it
happens to a friend, and rights and where to go.

- A content note comes first, and a **Quick exit** button is on every screen.
- The scenario is **never scored**, and **nothing about what was viewed is saved or sent**:
  the section's state lives in memory only.
- The body text is English until a support professional has reviewed it. Set
  `reviewed: true` once that is done, and the app then says so on each topic.

In the main game, the friend's-story cards (unfair treatment, xenophobic comments, a friend
shaken after a party) only add `connection` and `help_seeking`, never touch the meters, and
point to Campus Realities. FT-F5 and the week-6 mental-health cards show a **content note
with a skip option**.

## Other screens (spec §13)

About (what it's based on, the independence disclaimer, and a "Tested by X students" line
that only appears with real numbers), For universities (licensing explained; set
`contact.email` in `core.json` to show a contact address), Privacy (plain language, with an
"erase everything on this device" button), and three feedback questions after a chapter when
the server is reachable.

## Testing checklist (spec §14)

- [x] Every chapter completes for every setup combination; no dead ends (`npm test`)
- [x] No placeholder text in playable chapters
- [x] Works offline after first load; works with the server down
- [ ] Tested on a low-cost Android phone with slow data
- [x] Content validation passes (word limits, choice counts)
- [x] National helpline numbers verified (3 October 2026); no invented numbers anywhere
- [x] "Sizwe University" and "Karoo Coast University" not found as real institution names (web search, 11 October 2026)
- [ ] Campus Realities reviewed by a support professional; quick exit works on every screen
- [ ] isiZulu reviewed by a first-language speaker
- [ ] Machine-translated languages (isiXhosa, Afrikaans, Sepedi, Setswana, Sesotho: menus and cards, from `node tools/translate.mjs`) reviewed by first-language speakers
- [ ] Testing round 1 (12–14 Oct) and round 2 (18–20 Oct); results recorded honestly (`GET /stats`)

**National numbers in the app** (checked 3 October 2026): NSFAS `08000 67327`, SADAG
`0800 567 567`, Higher Health `0800 36 36 36`, GBV Command Centre `0800 428 428`, police
`10111`. Re-check them before launch and update `last_checked`.

## Licensing a university (stage 1)

A university fills in the spreadsheets in [intake/template/](intake/template/); we turn them into
its pack. [intake/README.md](intake/README.md) is the guide we send them, and
[intake/karoo-coast/](intake/karoo-coast/) is a complete example: a second fictional university
with one campus, no residences and its own colours.

```bash
npm run pack:build intake/karoo-coast   # sheets -> content/institutions/karoo-coast.json, then checks it
npm run pack:check sizwe                # check a pack; add --online to test that links answer
```

A pack can set its own services, map, costs, courses, housing options, campuses and brand
(name, monogram, colours), and can switch cards off or reword them. Cards of its own are written by our team on
request (`cards` in the
institution file). Wording can change; effects, flags and conditions cannot. The check refuses a
pack with unverified phone numbers, services in buildings that are not on the map, placeholder
email addresses in a licensed pack, unreadable brand colours, card edits that break the writing
rules, or a journey that no longer plays to the end on every campus. A failed build leaves the
published pack untouched.

To remove a university, delete its file from `content/institutions/` and run
`node tools/reindex.mjs`. [ADDING_A_UNIVERSITY.md](ADDING_A_UNIVERSITY.md) is the step-by-step guide.

## The staff portal (stage 2)

Institutions edit their own pack at `/portal/`: staff accounts with two-step login, roles
(editor, reviewer, read-only viewer, platform admin), a draft that a second person must approve, the pack check
on the server before anything is submitted or published, version history with rollback, and
an audit log that cannot be altered. [PORTAL.md](PORTAL.md) covers how to run it, the security
measures and what a national rollout still needs.

```bash
python -m server.admin demo      # demo accounts; passwords are printed once
npm run test:portal              # accounts, isolation, workflow, audit log
```

## Built for many institutions

| Question | Answer |
|---|---|
| What does a phone download? | The shared story (once), a small directory of institutions, and **only the pack of the institution the student chooses**. A 300-institution directory is under 80 KB |
| Does it still work offline? | Yes. The chosen pack is kept in its own cache, survives app updates, and refreshes quietly in the background when online |
| How does a student find theirs? | From seven institutions up, the list gets a search box (name or province) and groups: universities, TVET colleges, private colleges |
| Only universities? | No. An institution has a `type` and can bring its own course list (`courseList`), so a college can offer its own programmes. The story chapters are written for universities; a college version of the chapters is content work, not code |
| How do updates reach students? | Each pack has a version. A newer pack arrives on the next online open; finished chapters are kept and an unfinished one restarts |
| What stops a bad update? | `tools/pack-check.mjs` runs on every build and in `npm test` for every pack: it plays the whole journey on every campus and refuses unverified phone numbers, missing buildings and rule changes |
| What keeps details true over time? | `tools/pack-audit.mjs` lists phone checks that are getting old and licences close to expiry. A campus phone number unchecked for 400 days is hidden automatically; national helplines always stay |
| What happens when a licence lapses? | The institution drops out of the list for new students. Students who already chose it keep playing |
| Can an institution see its own numbers? | Yes. Completions carry the institution id; `GET /stats?institution=<id>` returns that institution's students, chapters and feedback. Still anonymous: a random device code, no names |
| Will the server cope? | Students play from static files, which any web host or CDN serves at any scale. The server only handles packs (cached in memory), and stats (SQLite, one row per device and chapter) |

Still to do before a national rollout: college versions of the story chapters, and managed
hosting (a hosted database in place of the SQLite files, a production web server, backups,
and email invitations for staff accounts). [PORTAL.md](PORTAL.md) lists each part.

## Android app

If an installable app is needed, wrap the deployed PWA as a Trusted Web Activity with
[PWABuilder](https://www.pwabuilder.com) or [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap).
