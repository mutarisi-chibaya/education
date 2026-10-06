# 0005. Two-person publish with a server-side pack check

- **Status:** Accepted
- **Date:** 2026-10-05 (recorded retrospectively)
- **Deciders:** project team

## Context

Institutions edit what their students see, including where to go in a crisis and which
number to call. A mistake or a compromised account could put false information in front of
every student at that institution. The platform team cannot review every change by hand
across many institutions.

## Decision

A change reaches students only when all of these hold, enforced on the server:

1. It is saved as a draft and submitted by a signed-in member of that institution.
2. The pack check passes at submission.
3. A **different** person with the reviewer role approves it. Nobody approves their own
   submission, whatever their role.
4. The pack check passes again at publish, with the new version number.

Each publish stores the full pack as a new version. Rollback publishes an old version as a
new one. Every action is written to an audit table that database triggers make append-only.

The pack check is the same Node program the build tools and tests use, run as a subprocess.
If it cannot run, it reports an error and nothing can be published.

## Options considered

| Option | For | Against |
|---|---|---|
| Two-person rule with an automatic check | Scales without platform staff in the loop; catches both mistakes and single-account compromise; accountable | Needs at least two staff per institution; publishing waits on a second person |
| Platform team approves every change | Central control | Does not scale; the platform cannot verify a local phone number anyway |
| Editor publishes directly after the check | Fast | One mistake or one stolen password reaches students |

## Consequences

- An institution needs an editor and a reviewer before it can publish anything.
- The check is a security boundary. Anything it does not validate, an institution can ship.
  Additions to what staff may edit must come with additions to the check.
- Reusing one check everywhere means the journey students play is the journey that was
  verified. It also ties the server to Node.js.
- The check runs inside the request and takes about a second per pack today. It will need a
  queue when many institutions publish at once.
- History is never rewritten, so the `versions` and `audit` tables only grow.

## Revisit when

Institutions with a single administrator need to publish, or check time grows enough to
need background processing.
