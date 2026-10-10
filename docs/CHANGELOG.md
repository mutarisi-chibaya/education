# Changelog

What changed in University Simulator, newest first, in terms a user or a university would
notice. Engineering detail is in the commit history.

No version has been released for public use yet. Everything below is part of the first
version in development (0.1.0 in `package.json`). From the first release on, each release
gets its own heading with a version number and date, as described in
[sdlc.md](sdlc.md#versioning).

## Unreleased

### Removed

- 11 October 2026: the separate backup app built to the original proposal. University
  Simulator is the only app in the project.
- 11 October 2026: the optional AI-written version of the forecast. The forecast and plan are
  worked out on the phone by rules, and nothing is sent to an AI service.
- 11 October 2026: wording that described the app as unfinished: the "draft wording" line on
  Campus Realities, "not a trained AI model yet" under "How this forecast works", and the
  call for pilot universities on the For universities screen.

### Security

- 11 October 2026: staff get eight single-use backup codes when they set up two-step login, for
  signing in after losing a phone.
- 11 October 2026: the server serves only the app's own folders. Before, an address spelled
  with capitals or percent-encoding could fetch private files, including the staff database.
- A staff account that locks after eight wrong sign-in attempts now stays locked until its
  owner sets a new password through an emailed link, or an admin resets it. Before, it
  unlocked by itself after 15 minutes.
- Wrong two-step codes now count towards the lock, as wrong passwords do.

### Changed

- 11 October 2026: a university's own story cards are written by our team on request.
  University staff can read them, switch them off and approve them in review, but can no
  longer add or change them in the portal.
- 11 October 2026: if a university removes a course, housing option or campus a student had
  chosen, the app now asks the student to choose again. Before, it failed to load.
- 11 October 2026: a chapter completion waits on the phone until the server has taken it, so a
  busy or unreachable server no longer loses counts.
- 11 October 2026: a whole lecture hall on one campus network can send completions at once. The
  limit is now per device, with a roomier limit per address.
- 11 October 2026: the app downloads its university's content only when there is a newer
  version, which saves data on every other open.
- 11 October 2026: the forecast's late-money line names the student's own funding (NSFAS
  allowance, bursary stipend, money from family, or loan, savings or wages). Before, it said
  "your allowance" to everyone. The setup screen and the start of First Term now say "your
  money" for the same reason.
- 10 October 2026: the "Saved to your survival plan" line and the fictional-university note
  moved inside each support card's "More details".
- 10 October 2026: toiletries are bought monthly, weekly campus food was added, and the
  cash-flow chart was replaced.
- 7 October 2026: the plan's share button was relabelled, and share and save gained icons.
- 6 October 2026: support cards sit side by side on wide screens.
- 6 October 2026: less text on screen, with two-layer support cards, shorter onboarding and
  abbreviations that explain themselves on a tap.
- 6 October 2026: university-specific cards are locked until setup is done.

### Added

- 11 October 2026: a Guide tab in the staff portal. It explains how a change reaches students,
  what each tab is for, and how to do each common job step by step, and it opens by itself at
  a person's first sign-in.
- 11 October 2026: a manual test document for the staff portal, with a quick check and a
  full test.
- 7 October 2026: icons on cards and visible effects on choices; "How it works" returns
  after the welcome page.
- 6 October 2026: a look-ahead note on the forecast, and menus and cards in isiXhosa,
  Afrikaans, Sepedi, Setswana and Sesotho (machine-translated).
- 6 October 2026: card translations, the glossary of university terms, and the engineering
  documents.
- 4 October 2026: first build. The student app with seven chapters, Campus services, the
  Semester Forecast, the survival plan and Campus Realities; content packs for two fictional
  universities; and the staff portal.
