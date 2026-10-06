# Risks and known limitations

A register of what could go wrong and what is known to be incomplete. An entry here is not a
bug report: many are deliberate trade-offs for a hackathon build. The purpose is that each
one is a recorded decision with an owner, and is revisited before a pilot with real students.

Last reviewed: 5 October 2026.

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
| P1 | Campus Realities wording has not been reviewed by a support professional | M | H | Planned | `reviewed: false` shows a "draft wording" line. Review before any pilot |
| P2 | isiZulu is not reviewed by first-language speakers, and isiXhosa, Afrikaans, Sepedi, Setswana and Sesotho are machine-translated (`tools/translate.mjs`) and unreviewed | M | M | Planned | A language carries no label once it is fully translated. Review by a first-language speaker before any pilot |
| P3 | Not yet tested on a low-cost Android phone on slow data | M | H | Planned | Testing rounds in October |
| P4 | "Sizwe University" not yet confirmed as unused by a real institution | L | M | Open | Check before public launch |
| P5 | The forecast is rule-based and could be read as a prediction about a real student | M | M | Accepted | The app says so on the forecast and About screens |
| P6 | Story chapters are written for universities; colleges need their own | H | L | Accepted | Out of MVP scope; see [MVP.md](../MVP.md) |

## Security

| # | Risk | L | I | Status | Mitigation or trigger |
|---|---|---|---|---|---|
| S1 | The check that keeps `data/`, server code and dot-folders from being served compares the raw URL, so a differently-cased or percent-encoded path gets past it. Observed on Windows: `/Data/portal.db` and `/%64ata/portal.db` return the database | H | H | Open | Check the resolved file path, or serve from an allowlist. Required before the server is reachable by anyone else |
| S2 | `npm start` (`tools/serve.mjs`) serves the whole repository, including `data/` and `.git/` | M | H | Accepted | Local development only. Do not expose it through a tunnel; use `python serve.py` or a static deploy |
| S3 | With no mail server configured, a password-reset link is returned in the response to whoever asks | H | H | Accepted | Demo behaviour, documented in PORTAL.md. Set `SMTP_HOST` for anything beyond a demo; consider refusing to start without it unless a demo flag is set |
| S4 | Rate limits use the connecting address and live in process memory | M | M | Accepted | Behind a proxy all clients share one limit. Listed as a swap point in PORTAL.md |
| S5 | Wrong two-step codes are counted but do not lock the account | L | M | Open | Apply the same lockout as wrong passwords |
| S6 | `POST /plan` is unauthenticated and spends API credit | M | M | Accepted | Rate limit and field allowlist. Add a per-day cap before a pilot |
| S7 | No recovery codes for two-step login | M | L | Planned | An admin reset is the only recovery; listed in PORTAL.md |
| S8 | An institution's own cards are checked for wording and numeric effects only; the size of a money effect and fields such as `flags` and `recurring` are not restricted | L | M | Open | Tighten `tools/pack-check.mjs` to an allowlist of fields and a bound on money |

## Reliability and operations

| # | Risk | L | I | Status | Mitigation or trigger |
|---|---|---|---|---|---|
| R1 | Single Python process, standard-library web server | H | M | Accepted | Students play from static files and are unaffected by server outages. Replace for a rollout |
| R2 | SQLite files on one machine; backups are run by hand; restore never rehearsed | M | H | Planned | Schedule `server.admin backup`; rehearse a restore before a pilot |
| R3 | No monitoring, logging to standard output only | H | M | Planned | See [runbook.md](runbook.md#monitoring) |
| R4 | No continuous integration or branch protection | H | M | Planned | See [sdlc.md](sdlc.md#5-review) |
| R5 | Four version numbers are bumped by hand; missing `VERSION` in `sw.js` strands phones on old files | M | M | Accepted | Release checklist. Could be derived from a content hash |
| R6 | A saved game that refers to a course or housing option later removed from its pack can fail at load, and the error screen offers no reset | L | H | Open | Validate the save against the pack at boot and fall back to setup |
| R7 | Any pack version change restarts a chapter in progress, including a change unrelated to the story | M | L | Accepted | By design: finished chapters are kept |

## Performance and data cost

Students are often on expensive or patchy data, so bytes matter more than milliseconds.

| # | Risk | L | I | Status | Mitigation or trigger |
|---|---|---|---|---|---|
| D1 | Each online open fetches `/packs/{id}` (about 550 KB for Sizwe) to compare a version number, and the response carries the content twice | H | M | Open | Compare against the version already returned by `/institutions`; drop the duplicate fields |
| D2 | `serve.py` does not compress responses; a first load is about 800 KB | H | M | Accepted | A static host or CDN compresses automatically. Only matters if `serve.py` is the production host |
| D3 | All chapters and Campus Realities load before the first screen | M | L | Accepted | Simple and fully offline after one load. Could load per chapter |
| D4 | Every service-worker version bump re-downloads every app file | M | L | Accepted | Follows from D2 and R5 |

## Privacy and compliance

| # | Risk | L | I | Status | Mitigation or trigger |
|---|---|---|---|---|---|
| C1 | No retention period for `stats.db` or for staff data and the audit log (which records IP addresses) | M | M | Open | Decide before a pilot; see [security-privacy.md](security-privacy.md#before-a-pilot-with-real-institutions) |
| C2 | Forecast fields are sent to an external AI provider when the AI plan is on | L | M | Open | Fields are anonymous. Decide whether to disclose on the Privacy screen |
| C3 | No published contact for security reports or for universities | H | L | Open | Set `contact.email` in `content/core.json` |

## Adding an entry

Add a row with the next number in its section. State the risk as what could happen, not as
the fix. When a risk is resolved, move it to the list below with the date and the change
that resolved it, so the history is kept.

## Resolved

None yet.
