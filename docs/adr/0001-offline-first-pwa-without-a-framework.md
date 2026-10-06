# 0001. Offline-first PWA with no framework or build step

- **Status:** Accepted
- **Date:** 2026-10-05 (recorded retrospectively)
- **Deciders:** project team

## Context

The players are South African students, many on low-cost Android phones with expensive or
patchy data. The game must work after one load with no connection. It must also be easy to
hand to judges and universities: open a link, no install.

## Decision

Build the student app as a Progressive Web App in plain JavaScript ES modules, HTML and CSS,
served as static files. A service worker precaches the whole app on first load and answers
cache-first afterwards. There is no framework, no bundler and no runtime dependency.

## Options considered

| Option | For | Against |
|---|---|---|
| Static PWA, vanilla JS | Small download; no build to break; runs from any static host; engine modules run unchanged in Node for tests | Rendering is manual string templates; no component model; no type checking |
| React or similar with a bundler | Component model, ecosystem, types | Larger download; a build pipeline to maintain; more to learn for content contributors |
| Native Android app | Best device integration | Store review, install friction, a second codebase for other platforms |

## Consequences

- The app is a set of files any host or CDN can serve at any scale.
- `engine.js`, `content.js`, `forecast.js` and `budget.js` are imported directly by the tests
  and by the pack check, so the rules students play are the rules that are tested.
- `main.js` holds all rendering and event handling in one large module and re-renders the
  screen with `innerHTML` on each update. All dynamic text must go through `esc()`.
- Files are shipped unminified and uncompressed unless the host compresses them.
- Cache invalidation is manual: `VERSION` in `sw.js` must be bumped when a file changes.
- An installable Android app, if needed, is a Trusted Web Activity wrapper around the PWA.

## Revisit when

`main.js` becomes hard to change safely, or the app needs screens complex enough that a
component model and types would pay for a build step.
