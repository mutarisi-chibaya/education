# 0006. A rule-based forecast, with AI only for wording

- **Status:** Superseded by 0007
- **Date:** 2026-10-05 (recorded retrospectively)
- **Deciders:** project team

## Context

At the end of each chapter the app tells the student which weeks ahead look riskiest, what
their coping pattern was, and what to do about it. This must work offline, must be
explainable to a student and a university, and there is no play data yet to learn from.

## Decision

Compute the Semester Forecast with transparent rules in `js/forecast.js`: a cash-flow
projection from the setup, a tally of coping tags, and risk weeks scored from the next
chapter's `forecast_tags` weighted by the player's current numbers and choices. Say plainly
in the app that these are rules, not a trained model.

Offer an optional AI rewrite of the summary. The server sends an allowlisted set of
anonymous forecast fields to a language model and instructs it to use only those facts. The
rule-based text is always computed, is shown while the request runs, and remains available
beside the AI text. If the server, the key or the network is missing, nothing changes.

## Options considered

| Option | For | Against |
|---|---|---|
| Rules, with optional AI wording | Works offline; every number can be explained; no data needed; AI failure is invisible | Rules encode the authors' judgement; weights are not validated against outcomes |
| A trained predictive model | Could be more accurate | No data to train on; would need consented collection; hard to explain; cannot run offline easily |
| AI generates the forecast itself | Flexible, personal | Could invent services, numbers or risks; needs a connection; costs per use |

## Consequences

- The forecast is deterministic and unit-tested.
- The claims the product can make are limited to what the rules support, which is stated in
  [MVP.md](../../MVP.md#what-we-are-not-claiming).
- The AI never decides anything. It can only rephrase facts it was given, and its output is
  escaped as plain text before display.
- Only English and isiZulu are requested from the model; other interface languages receive
  English prose.
- The AI endpoint is the only part of the system with a per-use cost.

## Revisit when

A pilot with consented, anonymous play data exists. That is what would allow rule weights to
be validated or a model to be trained.
