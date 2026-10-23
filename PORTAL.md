# The staff portal

The staff portal is where an institution looks after its own campus in University
Simulator. Staff sign in, edit their institution on screen, and a second person approves
the change before students see it.

It is at `/portal/` on the server, for example `http://localhost:8080/portal/`.

New staff do not need this document: the portal has a **Guide** tab that explains how a
change reaches students, what each tab is for, and how to do each common job step by step.
It opens by itself the first time someone signs in on a browser. To test the portal by hand,
follow [docs/portal-testing.md](docs/portal-testing.md).

## Who can do what

| Role | Belongs to | Can |
|---|---|---|
| **Editor** | One institution | Edit the draft, run the check, submit for review, and withdraw their own submission to keep editing |
| **Reviewer** | One institution | See what students see, and each submission with its before-and-after table; run the check; approve or send back a submission, and publish an earlier version again. A reviewer never makes changes, so the person who approves a change is never the one who made it |
| **Viewer** | One institution | Open every tab, see what students see and anything submitted for review, read the history, and run the check. Nothing can be saved, submitted or published. For judges and demos |
| **Platform admin** | Us | Everything, for every institution. Creates institutions and accounts, and sets status, type and licence |

Staff only ever see their own institution. To them, the others do not exist.

## How a change reaches students

1. **Edit.** An editor changes the draft and saves it. Students, reviewers and viewers still see the published version: a draft stays with the editors until they submit it.
2. **Check.** The same pack check the build tools use runs on the server. It plays the whole
   story on every campus and refuses unverified phone numbers, services in buildings that
   are not on the map, placeholder email addresses, unreadable colours and rule changes.
3. **Submit.** The draft is locked and sent for review. It cannot be submitted while the
   check finds problems.
4. **Review.** A different person approves it or sends it back with a note. Nobody can
   approve their own submission, whatever their role.
5. **Publish.** On approval the check runs once more, the version number goes up, the
   reviewer's name and the date are recorded as the sign-off, and the pack is published.
   Students get it the next time they open the app online.

Every step is written to a record that cannot be edited or deleted: who did what, when,
and from where. Each published version is kept, and a reviewer can publish an earlier one
again. That makes a new version; the history is never rewritten.

## What staff can change

On screen, without knowing any IDs:

- **Details and look:** name, the area near campus, a week of taxi fares (which commuting
  students pay in the game; rent is never part of a student's money), courses, whether there are university residences, monogram and colours. Without
  residences, the cards about residence life are switched off, and back on when they are
  ticked again. Each box has a "?" that says what it is for and where students see it.
- **Campuses:** add or remove campuses, with the courses taught on each.
- **Campus map:** a link to the campus map the institution already publishes, which is all
  most need. Optionally, a simple map that works offline: buildings and where they sit on it,
  with a live preview.
- **Services:** for each service, what it is called, its building and room, hours, email,
  phone and website. A phone number needs the name of the person who checked it and the date.
- **Lists:** lists a service points students to, such as accredited accommodation or a
  workshop calendar, with a link to the institution's official page.
- **Story cards:** switch a card off, or reword its title, situation, answers and results.
  The original wording is shown beside each box.
- **Their own cards:** a situation particular to the institution. Staff can read these and
  switch them off, but cannot write them: a new card sets what a choice does, which is a game
  rule. Staff ask for one on the Story cards tab, in the portal. Our team sees the request,
  writes the card signed in as a platform admin, and marks the request done; the
  institution's reviewer then approves the card like any other change.

The reviewer sees a summary of what changed and a line-by-line table of what students see
now beside what they would see after the change.

What staff cannot change: what a choice does to money, marks and wellbeing; the national
helplines; Campus Realities; and their own status, type, licence or version number.

## Running it

```
python -m server.admin create-admin you@example.org "Your Name"
python serve.py
```

The first command creates the first platform admin and prints a temporary password, once.
Sign in at `/portal/`, choose your own password, and set up two-step login with an
authenticator app. Then create institutions and staff accounts from the Platform admin tab.

**Accounts by email.** When an admin creates an account in the portal, that person gets an
emailed invitation with a link to choose their own password; nobody else ever knows it. The
sign-in screen has "Forgot your password?", which emails a link that works once, for one
hour. With no mail server configured, each email is written to `data/outbox/` as a text
file and the link is also shown on screen, which is how the demo works. Set `SMTP_HOST`
(and `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`) to send real email, and
`PORTAL_URL` to the portal's public address so the links point to it.

For a demo on your own machine:

```
python -m server.admin demo            # an admin, plus an editor, a reviewer and a viewer for each demo university
set PORTAL_MFA=off                     # PowerShell: $env:PORTAL_MFA="off"
python serve.py
```

`PORTAL_MFA=off` skips two-step login. It is for demos only; the server prints a warning
when it is off. `python -m server.admin audit` prints the full record of who did what, and
`python -m server.admin backup` copies the databases to `data/backups/` while the server
keeps running.

A good demo is Karoo Coast University: sign in as its editor, open **Lists** to see its
accredited accommodation, open **Story cards** to see its own card ("The last shuttle to
town") and its two reworded cards, change something, and open **Review and publish** to see
the before-and-after table. Then sign in as its reviewer to approve it.

**For judges**, the hosted demo has shared Karoo Coast accounts so they can try the whole
change process: `editor@karoocoast.example` makes a change and submits it, and
`reviewer@karoocoast.example` approves it, which shows that nobody approves their own work.
`viewer@karoocoast.example` can look around without changing anything. Set
`PORTAL_JUDGE_PASSWORD` and the server creates the three on every start, or resets them to
that password. They skip two-step login, and their password cannot be changed, reset or
emailed from the portal, so one judge cannot lock the others out. Every other account still
needs two-step login. Judges never get the platform admin or a Sizwe account: Sizwe is the
university in the demo videos, and publishing restarts an unfinished chapter for anyone
playing with that university.

On Render, [render.yaml](render.yaml) runs the server from the [Dockerfile](Dockerfile)
(Python and Node) with `TRUST_PROXY=1`, so rate limits see each visitor's own address rather
than Render's proxy. The free plan's disk is temporary: accounts, drafts and published
changes are lost on each restart, and the demo starts clean. Do not create a platform admin
there without a mail server: with none, a reset link appears on screen to whoever asks.

Node.js must be installed on the server, because the pack check is the same program the
build tools use. If it cannot run, nothing can be submitted or published.

## Signing in for the first time, step by step

**1. Get the accounts.** `python -m server.admin demo` creates these seven and prints a
temporary password for each, once. Copy them when they appear.

| Role | Email |
|---|---|
| Platform admin | `admin@unisim.example` |
| Sizwe editor | `editor@sizwe.example` |
| Sizwe reviewer | `reviewer@sizwe.example` |
| Karoo Coast editor | `editor@karoocoast.example` |
| Karoo Coast reviewer | `reviewer@karoocoast.example` |
| Sizwe viewer (read-only) | `viewer@sizwe.example` |
| Karoo Coast viewer (read-only) | `viewer@karoocoast.example` |

Running the command again does not print the passwords again; it reports that the accounts
already exist, and creates any that are missing (the viewers, on a database made before
they existed). If a password is lost, use "Forgot your password?" (step 5).

**2. Start the server and open the portal.** Run `python serve.py`, then open
`http://localhost:8080/portal/`.

**3. Sign in and choose your password.** Use an email from the table and its temporary
password. You are asked straight away for a new password of at least 12 characters.

**4. Set up two-step login.** The next screen shows a long setup key.

1. On your phone, open an authenticator app (Google Authenticator or Microsoft
   Authenticator; install one if you have none).
2. Tap **+** to add an account and choose **Enter a setup key**. In Microsoft's app this is
   "Other account", then "Or enter code manually".
3. Type any account name, for example "University Simulator", and type the setup key from
   the screen. The type is "Time based".
4. The app shows a 6-digit number that changes every 30 seconds. Type the current one into
   the Code box and press Finish.

Every later sign-in asks for the password and the current 6-digit number. Keep the setup
key private: it works like a second password.

**To skip step 4 for a demo**, stop the server and start it with two-step login off:

```
$env:PORTAL_MFA="off"      # PowerShell. In Command Prompt: set PORTAL_MFA=off
python serve.py
```

**5. If you forget a password.** Press "Forgot your password?" on the sign-in screen and
enter the email address. With no mail server set up, the reset link appears on screen and
is also saved as a text file in `data/outbox/`. Open the link and choose a new password.

**6. If someone loses their phone.** They can sign in with one of the eight backup codes
they were shown when they set up two-step login, typed where the 6-digit code goes. Each
code works once. If they have none left, sign in as the platform admin, open the Platform
admin tab, and press "New temporary password" beside their account. That also clears their
two-step setup, so they set it up again at their next sign-in and get new backup codes.

**To start again from nothing**, stop the server and delete `data/portal.db` (and
`portal.db-wal` and `portal.db-shm` beside it, if they exist). All accounts,
drafts and the history go with it; what is already published to students stays.

## Security

- **Passwords** are stored only as scrypt hashes with a per-account salt, and must be at
  least 12 characters. A new person chooses theirs through an emailed invitation link.
- **Invitation and reset links** work once, expire (seven days and one hour), and are stored
  only as hashes. Asking for a reset gives the same answer whether or not the address has
  an account, and using one signs that account out everywhere.
- **Two-step login** with an authenticator app (time-based one-time codes) is required for
  every account. Setting it up gives eight single-use backup codes for a lost phone; they
  are shown once and stored only as hashes.
- **Lockout:** eight wrong passwords or two-step codes lock an account. It stays locked until
  its owner sets a new password through an emailed link, or an admin resets it; waiting does
  not unlock it. Sign-in attempts are also rate-limited per address. An unknown account and a wrong password get the same answer.
- **Sessions** last eight hours. The session cookie is HttpOnly, Secure and SameSite=Strict,
  and limited to `/portal`. Only a hash of the session token is stored.
- **Every change needs a second token** sent in a header, so another website cannot act on a
  signed-in person's behalf.
- **Isolation** is enforced on the server for every request, not by hiding things on screen.
- **The portal pages** run only their own scripts, cannot be embedded in another site, and are
  never cached. The database, the server code and the intake folders are never served.
- **Two people editing at once** cannot overwrite each other: the second save is refused and
  asked to reload.
- **Publishing is all-or-nothing.** The pack file is replaced in one step, so a phone never
  downloads half a pack.

## How it is built, and where production parts plug in

This is a hackathon build. Each part that a national rollout would replace sits behind one
small, named place in the code, so it can be swapped without touching the rules.

| Part | In this build | For a national rollout | Where it plugs in |
|---|---|---|---|
| Rules and workflow | `server/portal.py` | Unchanged | It takes the database, the content folder, the pack check, the mailer and the clock as inputs, and knows nothing about the web server |
| Email | Written to `data/outbox/`, links shown on screen | A mail provider | Set `SMTP_HOST`: `server/mailer.py` already sends through any SMTP server. Another service is one class with a `send` method |
| Database | SQLite files under `data/`, with numbered migrations | A hosted database | `server/db.py` is the only file that opens a connection or defines the schema |
| Web server | Python's built-in server in `serve.py` | A production server behind HTTPS and a load balancer | `server/web.py` is one function from a request to a response, so any web framework can call it |
| Published packs | Files under `content/institutions/` | The same files on a content delivery network | `Portal._replace` is the one place a pack is written |
| Pack check | A separate process on the same machine | A queue, so many institutions are checked at once | The `check` function passed to `Portal` |
| Backups | `python -m server.admin backup`, run by hand | The same command on a schedule, plus a tested restore | A scheduled task |
| Rate limits and lockout | Kept in memory and in the database, per server | Shared between servers | `limited()` in `server/web.py` |
| Two-step login | Authenticator app codes and single-use backup codes | The same | `server/auth.py` |

Tests: `python -m unittest discover -s test -p "test_*.py"` covers accounts, lockout,
two-step login, invitation and reset links, isolation between institutions, the whole
review workflow, the before-and-after view, rollback, the audit log and the web layer.
