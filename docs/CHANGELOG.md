# Changelog

What changed in University Simulator, newest first, in terms a user or a university would
notice. Engineering detail is in the commit history.

No version has been released for public use yet. Everything below is part of the first
version in development (0.1.0 in `package.json`). From the first release on, each release
gets its own heading with a version number and date, as described in
[sdlc.md](sdlc.md#versioning).

## Unreleased

### Security

- A staff account that locks after eight wrong sign-in attempts now stays locked until its
  owner sets a new password through an emailed link, or an admin resets it. Before, it
  unlocked by itself after 15 minutes.
- Wrong two-step codes now count towards the lock, as wrong passwords do.

### Changed

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

- 7 October 2026: icons on cards and visible effects on choices; "How it works" returns
  after the welcome page.
- 6 October 2026: a look-ahead note on the forecast, and menus and cards in isiXhosa,
  Afrikaans, Sepedi, Setswana and Sesotho (machine-translated).
- 6 October 2026: card translations, the glossary of university terms, and the engineering
  documents.
- 4 October 2026: first build. The student app with seven chapters, Campus services, the
  Semester Forecast, the survival plan and Campus Realities; content packs for two fictional
  universities; and the staff portal.
