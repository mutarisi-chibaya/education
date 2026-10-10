# 0007. A rule-based forecast, with no AI

- **Status:** Accepted
- **Date:** 2026-10-11
- **Deciders:** project team

## Context

Record 0006 kept the forecast rule-based and added an optional AI rewrite of its summary,
switched on by a server API key. In practice the key was never set: every forecast students
and testers saw came from the rules. The unused path still cost something. It was a second
version of the summary to keep correct, the only part of the system with a per-use cost, the
only place student data left the device for a third party, and a line on the Privacy screen
that described something the app did not do.

## Decision

Remove the AI rewrite entirely: the `/plan` endpoint, the Anthropic SDK, the app's request
and toggle, and every mention on screen and in the documents. The forecast and the survival
plan are worked out on the phone by transparent rules, and that is the whole of it.

## Options considered

| Option | For | Against |
|---|---|---|
| Rules only | One forecast to keep correct; works offline; every number can be explained; nothing sent to a third party; no running cost | The summary reads as a template |
| Keep the optional AI rewrite (0006) | Friendlier prose when online | Unused; a cost, a privacy disclosure and a second code path for no benefit to students today |
| A statistical model on the phone | Odds in place of single cases | Its inputs would be example assumptions nobody has measured; considered and declined in October 2026 |

## Consequences

- The server has no third-party package and holds no API key. Record 0004's note about an
  optional SDK no longer applies.
- The only things the app sends are the anonymous completion count and optional feedback.
- The forecast's wording is limited to what the templates say, in every language.

## Revisit when

A pilot produces consented, anonymous outcome data that could validate the rules or justify
a trained model.
