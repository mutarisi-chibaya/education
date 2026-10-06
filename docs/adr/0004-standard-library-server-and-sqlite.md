# 0004. Standard-library Python server and SQLite

- **Status:** Accepted
- **Date:** 2026-10-05 (recorded retrospectively)
- **Deciders:** project team

## Context

The server is optional for students and was built during a hackathon. It needs to serve
files, expose five small endpoints and host the staff portal. It must be runnable by anyone
with Python installed, with nothing to provision.

## Decision

Implement the server with Python's standard library only: `http.server` for HTTP, `sqlite3`
for storage, `hashlib.scrypt` for passwords, and a hand-written TOTP implementation. The
only optional third-party package is the Anthropic SDK. Keep each part that a production
deployment would replace behind one named seam.

| Seam | Location |
|---|---|
| Rules and workflow, independent of the web | `server/portal.py` (takes database path, content folder, check, mailer and clock as inputs) |
| Request to response | `server/web.py: handle()` |
| Database connection and schema | `server/db.py` |
| Email | `server/mailer.py` |
| Writing a published pack | `Portal._replace` |
| Running the pack check | the `check` function passed to `Portal` |

## Options considered

| Option | For | Against |
|---|---|---|
| Standard library and SQLite | Zero setup; one command to run; nothing to patch | Not a production web server; one process; rate limits and caches in memory; security-sensitive code written by hand |
| A web framework with a hosted database | Production-grade request handling, middleware, pooling | Setup and hosting cost before there is a pilot to justify it |
| Serverless functions | Scales to zero | The pack check needs Node and several seconds; more moving parts |

## Consequences

- `python serve.py` is the whole deployment today.
- The portal's rules can be tested without HTTP, with an injected clock and check.
- Moving to a framework or a hosted database means replacing a seam, not the rules.
- Things a framework would provide are our responsibility: static-file access rules, header
  handling, body limits, rate limiting, and behaviour behind a proxy. Weaknesses found in
  these are tracked in [risks.md](../risks.md).
- Node.js must be installed beside Python, because the pack check is shared with the app.

## Revisit when

A real institution is about to be onboarded. At that point the web server, database, mail
and backups move to managed services, as planned in [MVP.md](../../MVP.md).
