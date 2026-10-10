# Architecture decision records

Each record captures one decision that shaped the system: the situation, what was chosen,
and what follows from it. They explain why the code looks the way it does.

| # | Decision | Status |
|---|---|---|
| [0001](0001-offline-first-pwa-without-a-framework.md) | Offline-first PWA with no framework or build step | Accepted |
| [0002](0002-content-as-data-in-layered-packs.md) | All story content is data, in layered packs | Accepted |
| [0003](0003-no-student-accounts.md) | No student accounts; progress stays on the device | Accepted |
| [0004](0004-standard-library-server-and-sqlite.md) | Standard-library Python server and SQLite | Accepted |
| [0005](0005-two-person-publish-with-server-side-check.md) | Two-person publish with a server-side pack check | Accepted |
| [0006](0006-rule-based-forecast.md) | A rule-based forecast, with AI only for wording | Superseded by 0007 |
| [0007](0007-rule-based-forecast-without-ai.md) | A rule-based forecast, with no AI | Accepted |

The first six were written on 5 October 2026 from the code and existing documents, after the
decisions had been made. The reasoning recorded is what the code comments and documents
state; where the team's actual reasons differed, correct the record.

## Writing a new record

1. Copy [template.md](template.md) to `NNNN-short-title.md` with the next number.
2. Write it before the change is built, and include it in the same pull request.
3. Keep it to one page. Record the options that were seriously considered.
4. Never edit an accepted record to change its decision. Write a new one and mark the old
   one "Superseded by NNNN".

Write a record when a change adds a runtime dependency, a stored field or database, a new
external service, a new trust boundary, or reverses one of the records above.
