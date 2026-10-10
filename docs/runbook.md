# Runbook

How to deploy, operate and recover University Simulator. Commands assume the repository
root as the working directory.

## Requirements

| Component | Needs |
|---|---|
| Student app only | Any static web host with HTTPS |
| Server | Python 3.11, the version it is developed on (standard library only), and Node.js 20 on the same machine for the pack check |
| Email (optional) | An SMTP server |

Service workers only run on `localhost` or HTTPS. Without HTTPS there is no offline mode.

## Deploy

### Static only (no portal, no statistics)

Publish the repository root to a static host. The student app plays fully from bundled
content. Exclude `data/`, `server/`, `tools/`, `test/`, `intake/`, `.git/` and `*.py` from
what is published.

### With the server

1. Put the server behind a reverse proxy that terminates HTTPS.
2. Set the environment (see [security-privacy.md](security-privacy.md#secrets-and-configuration)):
   - `PORTAL_URL` to the public address
   - `SMTP_HOST` and its companions, so invitation and reset links are emailed and not shown on screen
   - Leave `PORTAL_MFA` and `PORTAL_INSECURE_COOKIE` unset
3. Create the first admin, once: `python -m server.admin create-admin you@example.org "Your Name"`
4. Start: `python serve.py 8080`
5. Check the start-up lines: two-step login on, portal email via SMTP.

`data/` is created on first use and must be on persistent storage that is backed up.

### After a deploy

| Check | Expected |
|---|---|
| Open the site | Onboarding screen appears |
| Reload with the network off | The app still opens |
| `GET /institutions` | Lists institutions; `features` reflects configuration |
| `GET /stats` | A JSON summary |
| Open `/portal/` | Sign-in screen |
| Request `/data/portal.db` | 404 |

## Routine tasks

| Task | How | When |
|---|---|---|
| Back up databases | `python -m server.admin backup` (safe while running; writes to `data/backups/<timestamp>/`) | Daily, and before every deploy |
| Copy backups off the machine | Whatever the host provides | Daily |
| Audit packs | `node tools/pack-audit.mjs` lists phone checks older than 300 days, licences within 60 days of expiry, and packs that fail the check | Monthly |
| Re-verify national helplines | Call or check each number in the README list; update `last_checked` | Before launch, then yearly |
| Read the audit log | `python -m server.admin audit [institution]` | On request, or when investigating |
| Review statistics | `GET /stats` or the portal's Numbers tab | After each testing round |
| Clear the demo outbox | Delete files in `data/outbox/` | When not using SMTP |

## Common operations

### Add an institution

Through the portal (Platform admin tab) or from intake spreadsheets:

```bash
npm run pack:build intake/<folder>    # builds content/institutions/<id>.json and checks it
```

A failed build leaves the published pack untouched. Full steps:
[ADDING_A_UNIVERSITY.md](../ADDING_A_UNIVERSITY.md).

### Remove an institution

Delete `content/institutions/<id>.json`, then `node tools/reindex.mjs`. Students who had
chosen it start again from setup at their next load, because their saved game can no longer
find its pack.

### Let a licence lapse

Nothing to do. Once `licence.expires` passes, the institution drops out of the list for new
students; students who already chose it keep playing.

### A staff member is locked out or has lost their phone

A locked account is emailed a link for choosing a new password, which unlocks it, and
"Forgot your password?" on the sign-in page sends another. Someone without their phone can
type one of their backup codes where the 6-digit code goes. Otherwise, sign in as a platform
admin, open the Platform admin tab and press "New temporary password" beside the account.
This also clears their two-step setup and their backup codes.

### Ship a content or code change to phones

Follow the [release checklist](sdlc.md#release-checklist). The step most often missed is
bumping `VERSION` in `sw.js`: without it, phones keep the cached files.

## Incidents

### A published pack is wrong

1. In the portal, open the institution, History tab, and press "Publish this version again"
   on the last good version. This creates a new version; nothing is rewritten.
2. Students receive it the next time they open the app online.
3. Use the audit log to see who published the faulty version and what changed.

If the portal is unavailable, restore the pack file from version control or a backup, raise
its `version` above the faulty one, run `npm run pack:check <id>` and
`node tools/reindex.mjs`, and deploy.

### A helpline number is wrong

Treat as urgent. Correct it in `content/core.json` or `content/realities.json`, update
`last_checked`, bump `version` in `core.json` and `VERSION` in `sw.js`, run `npm test`, and
deploy. Phones pick it up at their next online open.

### A bad app release

Deploy the previous commit with a **higher** `VERSION` in `sw.js` than the bad release.
Reusing an old value will not reach phones that already installed the bad one.

### The server is down

Students are unaffected: the app plays from its cache and bundled packs. Pack updates and the
portal are unavailable until it returns, and completion counts wait on each phone and are
sent once it is back. Restart
`python serve.py`. If the port is busy it tries the next free one and prints which.

### The database is lost or corrupt

1. Stop the server.
2. Copy `portal.db` and `stats.db` from the newest folder in `data/backups/` into `data/`,
   and delete any `-wal` and `-shm` files beside them.
3. Start the server.

Published packs are files under `content/institutions/`, not rows in the database, so what
students see is unaffected. Drafts, accounts and history return to the time of the backup.
A restore has not yet been rehearsed; do one before a pilot.

### A staff account is compromised

1. As a platform admin, switch the account off. This ends all its sessions.
2. Read the audit log for that account's actions.
3. Roll back any pack it published (a reviewer still had to approve it; check who).
4. Issue a new temporary password only once the person is confirmed.

## Monitoring

There is no monitoring yet. The server prints to standard output only. Before a pilot, at
minimum:

- Keep the server's output in a log file with rotation.
- Alert on the process stopping and on disk space for `data/`.
- Check `GET /institutions` from outside on a schedule.

## Reference

| Item | Value |
|---|---|
| Default port | 8080 (`python serve.py <port>`; `PORT` for `npm start`) |
| Databases | `data/portal.db`, `data/stats.db` (SQLite; `portal.db` in WAL mode) |
| Session length | 8 hours |
| Lockout | 8 wrong passwords or codes; unlocked by an emailed reset link or an admin reset |
| Invitation link | 7 days, single use |
| Reset link | 1 hour, single use |
| Phone number hidden when unchecked for | 400 days |
