# 0003. No student accounts; progress stays on the device

- **Status:** Accepted
- **Date:** 2026-10-05 (recorded retrospectively)
- **Deciders:** project team

## Context

The game asks about funding, family obligations and housing, and has an optional section on
discrimination, harassment and abuse. Students must feel safe answering honestly. Some are
minors still in matric. A sign-up step also costs players at the door.

## Decision

There is no student account. Progress and preferences are stored in the browser's
`localStorage` and never sent anywhere. The server receives only an anonymous completion
record keyed by a random device id. Campus Realities keeps its state in memory only: nothing
about what was viewed is saved or sent.

## Options considered

| Option | For | Against |
|---|---|---|
| Local storage only | No personal data to protect; works offline; no sign-up | Progress is lost if the browser data is cleared; no play across devices; no per-student analytics |
| Optional account for sync | Cross-device play | Introduces personal data, consent, and a breach surface for sensitive answers |
| Institution single sign-on | Institutions could see their own students | Students would reasonably assume their university can see their answers |

## Consequences

- The privacy promise is simple and true: erase the device data and nothing remains.
- Statistics are counts, not people. A device that clears its storage counts as a new one,
  and the public count can be inflated by anyone willing to try. Numbers are indicative.
- Institutions get aggregate completions and feedback, never individual journeys.
- A model trained on play data is not possible without a separate, consented pilot.
- Saved games must stay compatible with content updates on the device, since there is no
  server-side copy to migrate.

## Revisit when

A consented research pilot needs individual play data, or students ask for progress to
follow them across devices.
