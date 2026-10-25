# Risks and known limitations

A register of what could go wrong and what is known to be incomplete. An entry here is not a
bug report: many are deliberate trade-offs for a hackathon build. The purpose is that each
one is a recorded decision with an owner, and is revisited before a pilot with real students.

Last reviewed: 25 October 2026.

## How to read it

| Status | Meaning |
|---|---|
| **Accepted** | Known and intended for the current stage. Revisit at the stated trigger |
| **Open** | Not yet decided. Needs an owner |
| **Planned** | Will be addressed; see the trigger |

Likelihood and impact are Low, Medium or High, judged for a public pilot, not for a demo.

## Product and delivery

| # | Risk | L | I | Status | Mitigation or trigger |
|---|---|---|---|---|---|
| P1 | Campus Realities wording has not been reviewed by a support professional | M | H | Planned | The app no longer labels the wording as a draft, so nothing on screen tells a student it is unreviewed. Review before any pilot |
| P2 | isiZulu is not reviewed by first-language speakers, and isiXhosa, Afrikaans, Sepedi, Setswana and Sesotho are machine-translated (`tools/translate.mjs`) and unreviewed | M | M | Planned | A language carries no label once it is fully translated. Review by a first-language speaker before any pilot |
| P3 | Not yet tested on a low-cost Android phone on slow data | M | H | Planned | Testing rounds in October |
| P5 | The forecast is rule-based and could be read as a prediction about a real student | M | M | Accepted | The app says so on the forecast and About screens |
| P6 | Story chapters are written for universities; colleges need their own | H | L | Accepted | Out of MVP scope; see [MVP.md](../MVP.md) |

## Security

| # | Risk | L | I | Status | Mitigation or trigger |
|---|---|---|---|---|---|
| S2 | `npm start` (`tools/serve.mjs`) serves the whole repository, including `data/` and `.git/` | M | H | Accepted | Local development only. Do not expose it through a tunnel; use `python serve.py` or a static deploy |
| S3 | With no mail server configured, a password-reset link is returned in the response to whoever asks | H | H | Accepted | Demo behaviour, documented in PORTAL.md. Set `SMTP_HOST` for anything beyond a demo; consider refusing to start without it unless a demo flag is set |
| S4 | Rate limits use the connecting address and live in process memory | M | M | Accepted | Behind a proxy all clients share one limit. Listed as a swap point in PORTAL.md |
| S8 | An institution's own cards are checked for wording and numeric effects only; the size of a money effect and fields such as `flags` and `recurring` are not restricted | L | L | Accepted | Since 11 October 2026 only a platform admin can add or change these cards, so a wrong value is our own mistake to catch. Tighten `tools/pack-check.mjs` if that ever changes |

## Reliability and operations

| # | Risk | L | I | Status | Mitigation or trigger |
|---|---|---|---|---|---|
| R1 | Single Python process, standard-library web server | H | M | Accepted | Students play from static files and are unaffected by server outages. Replace for a rollout |
| R2 | SQLite files on one machine; backups are run by hand; restore never rehearsed | M | H | Planned | Schedule `server.admin backup`; rehearse a restore before a pilot |
| R3 | No monitoring, logging to standard output only | H | M | Planned | See [runbook.md](runbook.md#monitoring) |
| R4 | No continuous integration or branch protection | H | M | Planned | See [sdlc.md](sdlc.md#5-review) |
| R5 | Four version numbers are bumped by hand; missing `VERSION` in `sw.js` strands phones on old files | M | M | Accepted | Release checklist. Could be derived from a content hash |
| R7 | Any pack version change restarts a chapter in progress, including a change unrelated to the story | M | L | Accepted | By design: finished chapters are kept |
| R8 | The server can't run as more than one instance: SQLite, published pack files and rate limits all live on one machine | M | M | Accepted | Students are unaffected (they play from static files). Before a rollout: hosted database, packs in object storage, shared rate limits. See [architecture.md](architecture.md#8-scaling-layers-and-future-work) |

## Maintainability

| # | Risk | L | I | Status | Mitigation or trigger |
|---|---|---|---|---|---|
| M1 | `js/main.js` (~2,600 lines) holds every screen, which makes changes harder to review and easier to break | M | L | Accepted | Not changed during the hackathon. Split by screen group; see [architecture.md](architecture.md#modularity-what-to-split-next) |
| M2 | `server/portal.py` (~900 lines) and `portal/portal.js` (~1,100 lines) each hold the whole portal | M | L | Accepted | Same as M1: split into accounts, workflow and institutions |

## Performance and data cost

Students are often on expensive or patchy data, so bytes matter more than milliseconds.

| # | Risk | L | I | Status | Mitigation or trigger |
|---|---|---|---|---|---|
| D2 | `serve.py` does not compress responses; a first load is about 800 KB | H | M | Accepted | A static host or CDN compresses automatically. Only matters if `serve.py` is the production host |
| D3 | All chapters and Campus Realities load before the first screen | M | L | Accepted | Simple and fully offline after one load. Could load per chapter |
| D4 | Every service-worker version bump re-downloads every app file | M | L | Accepted | Follows from D2 and R5 |

## Privacy and compliance

| # | Risk | L | I | Status | Mitigation or trigger |
|---|---|---|---|---|---|
| C1 | No retention period for `stats.db` or for staff data and the audit log (which records IP addresses) | M | M | Open | Decide before a pilot; see [security-privacy.md](security-privacy.md#before-a-pilot-with-real-institutions) |
| C3 | No published contact for security reports or for universities | H | L | Open | Set `contact.email` in `content/core.json` |

## Adding an entry

Add a row with the next number in its section. State the risk as what could happen, not as
the fix. When a risk is resolved, move it to the list below with the date and the change
that resolved it, so the history is kept.

## Resolved

- **S7** (11 October 2026): setting up two-step login now gives eight single-use backup codes, so a
  lost phone no longer needs an admin.
- **R6** (11 October 2026): a saved game that names a course, housing option or campus its pack no
  longer offers is caught at start-up. Setup opens with the answers that still fit and asks for the
  rest; the journey then starts afresh.
- **P4** (11 October 2026): a web search found no institution named "Sizwe University" or "Karoo
  Coast University". Repeat the check before a public launch.
- **S1** (11 October 2026): private files could be fetched by spelling the address with capitals
  or percent-encoding. The server now serves only the app's own folders and judges an address by
  the file it resolves to. Covered by `test/test_server.py`.
- **S6, C2** (11 October 2026): the AI-written plan was removed, so there is no `/plan` endpoint,
  no API key and nothing sent to an AI provider. See [adr/0007](adr/0007-rule-based-forecast-without-ai.md).
- **D1** (11 October 2026): the app now reads the pack version from the short institution list and
  downloads the pack only when the server's is newer. A pack response still carries its content
  twice, which now only costs data when there is an update.
- **S5** (10 October 2026): wrong two-step codes now lock the account as wrong passwords do. A locked
  account stays locked until its password is reset by emailed link or by an admin.
