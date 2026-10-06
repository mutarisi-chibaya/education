# API reference

All endpoints are served by [serve.py](../serve.py). Bodies and responses are JSON.

## Public API

Used by the student app. No authentication. The app treats every one of these as optional
and falls back silently when a call fails or times out.

| Method | Path | Purpose |
|---|---|---|
| GET | `/institutions` | Directory of institutions and server features |
| GET | `/packs/{id}` | The assembled content pack for one institution |
| GET | `/stats` | Completion summary; `?institution={id}` for one institution |
| POST | `/stats` | Record that a device completed a chapter, with optional feedback |
| POST | `/plan` | Have the AI write the Semester Forecast as prose |

### GET `/institutions`

```json
{
  "institutions": [
    { "id": "sizwe", "name": { "en": "..." }, "short": "Sizwe", "type": "university",
      "status": "demo", "version": 18013, "active": true }
  ],
  "features": { "ai": false, "stats": true }
}
```

`active` is false once a licence has expired. `features.ai` is true only when the Anthropic
SDK is installed and credentials are set.

### GET `/packs/{id}`

Returns `institution`, `version`, `name`, `costs`, `support`, `cards`, `minis`, `tips`, and
`source` (`core`, `institution`, `chapterIndex`, `chapters`). The app rebuilds its pack from
`source` when `version` is higher than the one it has. Unknown id: `404`.

### POST `/stats`

```json
{ "device_id": "a-random-uuid", "institution": "sizwe", "chapter": "first_term",
  "completed": true, "feedback": { "realistic": "yes", "learned": "yes", "recommend": "maybe" } }
```

| Rule | Detail |
|---|---|
| `device_id` | 8 to 64 characters, letters, digits and hyphens |
| `chapter` | Must be a known chapter id |
| `institution` | Optional; must be a known institution id |
| `feedback` | Optional; keys `realistic` (yes, partly, no), `learned` (yes, no), `recommend` (yes, maybe, no) |
| Other keys | Rejected |
| Body size | At most 16 KB |
| Rate limit | 30 writes per client address per minute, shared with `/plan` |
| Origin | A cross-origin post is refused unless the origin equals `FYS_APP_ORIGIN` |

Responses: `200 {"ok": true}`, `400` invalid, `403` origin, `429` rate limit.

### POST `/plan`

Accepts the anonymous forecast fields built by `aiPayload` in
[js/forecast.js](../js/forecast.js); any other key is dropped. Returns `200 {"text": "..."}`,
`502` when no text was produced, or `503` when the AI plan is not configured. Same size,
rate and origin rules as `POST /stats`.

## Portal API

Everything under `/portal/api/`, routed by [server/web.py](../server/web.py). Rules are
enforced in [server/portal.py](../server/portal.py).

**Authentication.** A session cookie `fys_portal` (HttpOnly, SameSite=Strict, path
`/portal`, eight hours). Every non-GET request must also send the session's CSRF token in
`X-CSRF-Token`. Until an account has chosen its own password and set up two-step login, only
the routes marked *setup* work.

**Scope.** Editors and reviewers can only address their own institution. Any other id
returns `404`, exactly as if it did not exist.

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `login` | open | Email, password and, when asked, a 6-digit code |
| POST | `reset/request` | open | Ask for a password-reset link |
| POST | `reset/confirm` | open | Set a password with an invitation or reset token |
| GET | `me` | setup | The signed-in user, CSRF token and next step |
| POST | `logout` | setup | End the session |
| POST | `password` | setup | Change password |
| POST | `two-step/begin` | setup | Get a new authenticator secret |
| POST | `two-step/confirm` | setup | Confirm it with a code |
| GET | `catalogue` | any | Services, cards, courses, housing and map positions to choose from |
| GET | `institutions` | any | Institutions this user works on, with workflow state |
| POST | `institutions` | admin | Create an institution as a draft |
| GET | `pack/{id}` | scoped | Draft, revision, state, change summary, diff, permissions |
| PUT | `pack/{id}` | scoped | Save the draft; body `{ pack, rev }` |
| POST | `pack/{id}/check` | scoped | Run the pack check on the draft |
| POST | `pack/{id}/submit` | scoped | Check, then lock for review |
| POST | `pack/{id}/review` | reviewer, admin | `{ decision: "approve" or "reject", note }` |
| POST | `pack/{id}/rollback` | reviewer, admin | `{ version }`; publishes it again as a new version |
| POST | `pack/{id}/licence` | admin | Status, type, licence tier and expiry |
| GET | `pack/{id}/history` | scoped | Published versions and the audit trail |
| GET | `pack/{id}/stats` | scoped | That institution's anonymous numbers |
| GET | `users` | admin | All accounts |
| POST | `users` | admin | Create an account |
| POST | `users/{n}/reset` | admin | New temporary password; clears two-step setup |
| POST | `users/{n}/disable`, `users/{n}/enable` | admin | Switch an account off or on |

### Status codes

| Code | Meaning |
|---|---|
| 400 | Invalid input |
| 401 | Not signed in, or wrong credentials. The body may carry `need: "code"` |
| 403 | Role not allowed, CSRF token missing, setup not finished (`step`), or self-approval |
| 404 | Unknown route, or an institution outside the user's scope |
| 409 | Conflict: stale `rev`, wrong workflow state, or duplicate |
| 413 | Body or pack too large |
| 422 | The pack check failed; the body carries `errors` and `warnings` |
| 429 | Rate limit or account lockout |

Limits: 10 open requests (login, reset) and 120 other requests per client address per
minute; 512 KB per request body; 400 KB per pack.
