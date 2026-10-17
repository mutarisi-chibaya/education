"""The staff portal: who may change an institution's pack, and how a change reaches students.

    editor saves a draft  ->  editor submits  ->  a different person reviews
        ->  approve: the pack check runs again, the version goes up, the pack is published
        ->  send back: it returns to draft with a note

Rules this module enforces, whatever the web layer does:
  - staff only ever see and change their own institution (platform admins see all);
  - nobody approves their own submission;
  - nothing is submitted or published unless the pack check passes;
  - staff cannot change their own status, licence, type or version;
  - every action is written to an append-only audit log.
"""

import datetime
import json
import os
import re
import subprocess
import time
from pathlib import Path

from . import auth, db

SESSION_HOURS = 8
MAX_FAILED = 8
MAX_PACK_BYTES = 400 * 1024
INVITE_DAYS = 7
RESET_HOURS = 1
MAX_DIFF_ROWS = 300
INSTITUTION_ID = re.compile(r"^[a-z][a-z0-9-]{1,30}$")
EMAIL = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,190}\.[a-z]{2,}$", re.I)

# What institution staff may edit. Everything else in a pack is set by the platform.
EDITABLE = {"name", "short", "campus", "city", "area", "province", "costs", "courses", "courseList", "housing",
            "brand", "map", "support", "pages", "cards", "campuses"}
# A viewer sees everything their institution's staff see and changes nothing: for judges
# and demos, so a look around can't change what students get or what someone else is doing.
ROLES = ("admin", "editor", "reviewer", "viewer")
PROTECTED = {"id", "version", "status", "type", "licence", "signedOff", "costIndex"}
SECTION_NAMES = {"name": "Name", "short": "Name", "campus": "Tagline", "city": "Location", "area": "Location", "province": "Location",
                 "costs": "Costs", "courses": "Courses", "courseList": "Courses", "housing": "Housing options", "brand": "Branding",
                 "map": "Buildings and map", "pages": "Lists", "campuses": "Campuses"}


class PortalError(Exception):
    def __init__(self, status, message, **extra):
        super().__init__(message)
        self.status = status
        self.body = {"error": message, **extra}


def node_check(root):
    """Run the same pack check the build tools use. If it cannot run, nothing can be published."""
    script = Path(root) / "tools" / "pack-check.mjs"

    def run(institution_id, pack):
        try:
            result = subprocess.run(["node", str(script), institution_id, "--stdin", "--json"], input=json.dumps(pack),
                                    capture_output=True, text=True, encoding="utf-8", timeout=180)
            return json.loads(result.stdout)
        except Exception as e:  # node missing, timeout, bad output: fail closed
            return {"errors": [f"The pack check could not run ({e.__class__.__name__}). Nothing can be published until it does."], "warnings": []}
    return run


class Portal:
    def __init__(self, db_path, content_dir, check, mfa=True, clock=time.time, mailer=None, base_url="http://localhost:8080"):
        self.mailer = mailer            # None: no email; accounts get a temporary password instead
        self.base_url = base_url.rstrip("/")
        self.db_path = str(db_path)
        self.content = Path(content_dir)
        self.check = check
        self.mfa = mfa
        self.clock = clock
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        db.migrate(self.db_path)

    # ------------------------------------------------------------------ helpers

    def _con(self):
        return db.connect(self.db_path)

    def _log(self, con, email, action, institution=None, detail="", ip=""):
        con.execute("INSERT INTO audit (at, user_email, institution_id, action, detail, ip) VALUES (?, ?, ?, ?, ?, ?)",
                    (self.clock(), email, institution, action, detail[:500], ip))

    def _today(self):
        return datetime.date.fromtimestamp(self.clock()).isoformat()

    @staticmethod
    def _public(user):
        return {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"],
                "institution": user["institution_id"], "mustChange": bool(user["must_change"])}

    def _scope(self, user, institution_id):
        """Staff are confined to their own institution. Others' do not exist as far as they can tell."""
        if not isinstance(institution_id, str) or not INSTITUTION_ID.match(institution_id):
            raise PortalError(404, "No such institution.")
        if user["role"] != "admin" and user["institution_id"] != institution_id:
            raise PortalError(404, "No such institution.")

    def _need(self, user, *roles):
        if user["role"] not in roles:
            raise PortalError(403, "Your role does not allow this.")

    # ------------------------------------------------------------- published packs

    def _path(self, institution_id):
        return self.content / "institutions" / f"{institution_id}.json"

    def published(self, institution_id):
        path = self._path(institution_id)
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None

    @staticmethod
    def _entry(pack):
        entry = {"id": pack["id"], "name": pack.get("name"), "short": pack.get("short"), "tagline": pack.get("tagline") or pack.get("campus"),
                 "type": pack.get("type") or "university", "province": pack.get("province"), "status": pack.get("status"),
                 "version": pack.get("version")}
        if pack.get("licence"):
            entry["licence"] = pack["licence"]
        return entry

    def _write_directory(self):
        folder = self.content / "institutions"
        index = folder / "index.json"
        order = [d["id"] for d in json.loads(index.read_text(encoding="utf-8"))] if index.exists() else []
        packs = [json.loads(f.read_text(encoding="utf-8")) for f in folder.glob("*.json") if f.name != "index.json"]
        packs.sort(key=lambda p: (order.index(p["id"]) if p["id"] in order else len(order), p["id"]))
        self._replace(index, [self._entry(p) for p in packs])

    @staticmethod
    def _replace(path, data):
        """Write a file so that readers only ever see the old or the new version, never half of one."""
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        os.replace(tmp, path)

    # ---------------------------------------------------------------- accounts

    def create_user(self, actor, email, name, role, institution_id=None, ip=""):
        """Returns the new account and its temporary password, shown once."""
        if actor is not None:
            self._need(actor, "admin")
        email = (email or "").strip().lower()
        if not EMAIL.match(email) or not (name or "").strip():
            raise PortalError(400, "A name and a valid email address are needed.")
        if role not in ROLES:
            raise PortalError(400, "Role must be admin, editor, reviewer or viewer.")
        if role == "admin":
            institution_id = None
        elif not institution_id or self.published(institution_id) is None and not self._has_draft(institution_id):
            raise PortalError(400, "Editors, reviewers and viewers belong to an existing institution.")
        password = auth.new_password()
        digest, salt = auth.hash_password(password)
        con = self._con()
        try:
            with con:
                try:
                    cur = con.execute("INSERT INTO users (email, name, role, institution_id, pw_hash, pw_salt, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                                      (email, name.strip(), role, institution_id, digest, salt, self.clock()))
                except db.sqlite3.IntegrityError:
                    raise PortalError(409, "That email address already has an account.") from None
                self._log(con, actor["email"] if actor else "system", "user.created", institution_id, f"{email} as {role}", ip)
                user = con.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
                if actor is not None and self.mailer:
                    # Invited by email: nobody else ever knows a password for this account.
                    link = self._send_link(con, user, "invite")
                    self._log(con, actor["email"], "user.invited", institution_id, email, ip)
                    return {"user": self._public(user), "invited": True, "link": link if self.mailer.reveals_links else None}
            return {"user": self._public(user), "temporaryPassword": password}
        finally:
            con.close()

    # ---------------------------------------------- invitation and reset links

    def _send_link(self, con, user, purpose, locked=False):
        """Email a single-use link for setting a password. Only its hash is stored."""
        token = auth.new_token()
        life = INVITE_DAYS * 86400 if purpose == "invite" else RESET_HOURS * 3600
        con.execute("DELETE FROM tokens WHERE user_id = ? AND purpose = ?", (user["id"], purpose))
        con.execute("INSERT INTO tokens (token_hash, user_id, purpose, expires_at) VALUES (?, ?, ?, ?)",
                    (auth.token_hash(token), user["id"], purpose, self.clock() + life))
        link = f"{self.base_url}/portal/#set-password={token}"
        if purpose == "invite":
            subject = "Your University Simulator staff account"
            body = (f"Hello {user['name']},\n\nAn account has been created for you on the University Simulator staff portal, "
                    f"as {user['role']}.\n\nChoose your password here (the link works once, for {INVITE_DAYS} days):\n{link}\n\n"
                    "After that you will be asked to set up two-step login with an authenticator app.")
        elif locked:
            subject = "Your University Simulator account is locked"
            body = (f"Hello {user['name']},\n\nYour account was locked after {MAX_FAILED} wrong sign-in attempts. To unlock it, choose a "
                    f"new password here (the link works once, for {RESET_HOURS} hour):\n{link}\n\nIf the link has expired, use "
                    "\"Forgot your password?\" on the sign-in page. If the attempts were not yours, tell your administrator.")
        else:
            subject = "Reset your University Simulator password"
            body = (f"Hello {user['name']},\n\nSomeone asked to reset the password for this account. If it was you, choose a new "
                    f"password here (the link works once, for {RESET_HOURS} hour):\n{link}\n\nIf it was not you, ignore this email: "
                    "your password has not changed.")
        self.mailer.send(user["email"], subject, body)
        return link

    def request_reset(self, email, ip=""):
        """Always answers the same way, so nobody can find out which addresses have accounts."""
        email = (email or "").strip().lower()
        answer = {"ok": True}
        if not self.mailer:
            return answer
        con = self._con()
        try:
            with con:
                user = con.execute("SELECT * FROM users WHERE email = ? AND disabled = 0", (email,)).fetchone()
                if user:
                    link = self._send_link(con, user, "reset")
                    self._log(con, email, "password.reset_requested", user["institution_id"], "", ip)
                    if self.mailer.reveals_links:
                        answer["link"] = link
        finally:
            con.close()
        return answer

    def redeem_link(self, token, new_password, ip=""):
        """Set a password with an invitation or reset link. The link then stops working."""
        problem = auth.password_problem(new_password or "")
        con = self._con()
        try:
            with con:
                row = con.execute("""SELECT t.*, u.email, u.institution_id FROM tokens t JOIN users u ON u.id = t.user_id
                                     WHERE t.token_hash = ? AND t.used = 0 AND t.expires_at > ? AND u.disabled = 0""",
                                  (auth.token_hash(token or ""), self.clock())).fetchone()
                if not row:
                    raise PortalError(400, "This link has expired or has already been used. Ask for a new one.")
                if problem:
                    raise PortalError(400, problem)
                digest, salt = auth.hash_password(new_password)
                con.execute("UPDATE users SET pw_hash = ?, pw_salt = ?, must_change = 0, failed = 0 WHERE id = ?",
                            (digest, salt, row["user_id"]))
                con.execute("UPDATE tokens SET used = 1 WHERE token_hash = ?", (row["token_hash"],))
                con.execute("DELETE FROM sessions WHERE user_id = ?", (row["user_id"],))
                self._log(con, row["email"], "password.set_by_link", row["institution_id"], row["purpose"], ip)
                return {"ok": True, "email": row["email"]}
        finally:
            con.close()

    def _has_draft(self, institution_id):
        con = self._con()
        try:
            return con.execute("SELECT 1 FROM packs WHERE institution_id = ?", (institution_id,)).fetchone() is not None
        finally:
            con.close()

    def list_users(self, actor):
        self._need(actor, "admin")
        con = self._con()
        try:
            rows = con.execute("SELECT * FROM users ORDER BY institution_id, email").fetchall()
            return [{**self._public(r), "disabled": bool(r["disabled"]), "twoStep": bool(r["totp_enabled"])} for r in rows]
        finally:
            con.close()

    def reset_user(self, actor, user_id, disable=None, ip=""):
        """A new temporary password (and two-step login reset), or switch the account off or on."""
        self._need(actor, "admin")
        con = self._con()
        try:
            with con:
                target = con.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
                if not target:
                    raise PortalError(404, "No such account.")
                con.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
                if disable is not None:
                    con.execute("UPDATE users SET disabled = ? WHERE id = ?", (1 if disable else 0, user_id))
                    self._log(con, actor["email"], "user.disabled" if disable else "user.enabled", target["institution_id"], target["email"], ip)
                    return {"ok": True}
                password = auth.new_password()
                digest, salt = auth.hash_password(password)
                con.execute("UPDATE users SET pw_hash = ?, pw_salt = ?, must_change = 1, totp_secret = NULL, totp_enabled = 0, failed = 0 WHERE id = ?",
                            (digest, salt, user_id))
                con.execute("DELETE FROM recovery_codes WHERE user_id = ?", (user_id,))
                self._log(con, actor["email"], "user.reset", target["institution_id"], target["email"], ip)
                return {"temporaryPassword": password}
        finally:
            con.close()

    # ------------------------------------------------------------------- login

    def _failed(self, con, user, detail, ip):
        """Count a wrong password or code. The last one allowed locks the account until its owner
        sets a new password through an emailed link, or an admin resets it."""
        failed = user["failed"] + 1
        locked = failed >= MAX_FAILED
        con.execute("UPDATE users SET failed = ? WHERE id = ?", (failed, user["id"]))
        self._log(con, user["email"], "login.locked" if locked else "login.failed", user["institution_id"], detail, ip)
        if locked and self.mailer:
            self._send_link(con, user, "reset", locked=True)

    def login(self, email, password, code=None, ip=""):
        """Returns (session token, info). The same message for every failure, so accounts cannot be guessed."""
        email = (email or "").strip().lower()
        bad = PortalError(401, "The email address or password is not right.")
        con = self._con()
        try:
            with con:
                user = con.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
                if not user:
                    auth.hash_password(password or "")  # spend the same time as a real check
                    self._log(con, email[:120], "login.failed", None, "unknown account", ip)
                    return None, bad
                if user["disabled"]:
                    return None, bad
                if user["failed"] >= MAX_FAILED:
                    return None, PortalError(429, 'This account is locked after too many wrong attempts. Use "Forgot your password?" '
                                                  "to unlock it by email, or ask an administrator.")
                if not auth.verify_password(password or "", user["pw_hash"], user["pw_salt"]):
                    self._failed(con, user, "", ip)
                    return None, bad
                mfa_ok = 0 if self.mfa else 1
                backup_left = None  # set when a backup code was used in place of the authenticator
                if self.mfa and user["totp_enabled"]:
                    if not code:
                        return None, PortalError(401, "Enter the 6-digit code from your authenticator app.", need="code")
                    if not auth.verify_totp(user["totp_secret"], code, self.clock()):
                        spent = con.execute("UPDATE recovery_codes SET used = 1 WHERE user_id = ? AND code_hash = ? AND used = 0",
                                            (user["id"], auth.recovery_hash(code))).rowcount
                        if not spent:
                            self._failed(con, user, "wrong code", ip)
                            return None, PortalError(401, "That code is not right. Codes change every 30 seconds.", need="code")
                        backup_left = con.execute("SELECT COUNT(*) FROM recovery_codes WHERE user_id = ? AND used = 0", (user["id"],)).fetchone()[0]
                    mfa_ok = 1
                token = auth.new_token()
                csrf = auth.new_token()
                now = self.clock()
                con.execute("UPDATE users SET failed = 0 WHERE id = ?", (user["id"],))
                con.execute("DELETE FROM sessions WHERE expires_at < ?", (now,))
                con.execute("INSERT INTO sessions (token_hash, user_id, csrf, mfa_ok, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
                            (auth.token_hash(token), user["id"], csrf, mfa_ok, now, now + SESSION_HOURS * 3600))
                self._log(con, email, "login", user["institution_id"], "" if backup_left is None else "with a backup code", ip)
                info = self._me(user, csrf, mfa_ok)
                return token, info if backup_left is None else {**info, "backupCodesLeft": backup_left}
        finally:
            con.close()

    def _me(self, user, csrf, mfa_ok):
        step = "password" if user["must_change"] else "two-step" if (self.mfa and not mfa_ok) else "ready"
        return {"user": self._public(user), "csrf": csrf, "step": step, "twoStepRequired": self.mfa}

    def session(self, token):
        """The signed-in user for a session token, or None."""
        if not token:
            return None
        con = self._con()
        try:
            row = con.execute("""SELECT u.*, s.csrf AS csrf, s.mfa_ok AS mfa_ok FROM sessions s JOIN users u ON u.id = s.user_id
                                 WHERE s.token_hash = ? AND s.expires_at > ? AND u.disabled = 0""", (auth.token_hash(token), self.clock())).fetchone()
            return dict(row) if row else None
        finally:
            con.close()

    def me(self, user):
        return self._me(user, user["csrf"], user["mfa_ok"])

    def ready(self, user):
        """Past the temporary password and two-step setup: allowed to do real work."""
        if user["must_change"]:
            raise PortalError(403, "Choose your own password first.", step="password")
        if self.mfa and not user["mfa_ok"]:
            raise PortalError(403, "Set up two-step login first.", step="two-step")

    def logout(self, token):
        con = self._con()
        try:
            with con:
                con.execute("DELETE FROM sessions WHERE token_hash = ?", (auth.token_hash(token or ""),))
        finally:
            con.close()

    def change_password(self, user, current, new, ip=""):
        if not auth.verify_password(current or "", user["pw_hash"], user["pw_salt"]):
            raise PortalError(400, "Your current password is not right.")
        problem = auth.password_problem(new or "")
        if problem:
            raise PortalError(400, problem)
        if new == current:
            raise PortalError(400, "Choose a password you have not used here before.")
        digest, salt = auth.hash_password(new)
        con = self._con()
        try:
            with con:
                con.execute("UPDATE users SET pw_hash = ?, pw_salt = ?, must_change = 0 WHERE id = ?", (digest, salt, user["id"]))
                self._log(con, user["email"], "password.changed", user["institution_id"], "", ip)
        finally:
            con.close()
        return {"ok": True}

    def two_step_begin(self, user):
        """A fresh secret for the authenticator app. It only counts once a code from it is confirmed."""
        if user["totp_enabled"]:
            raise PortalError(400, "Two-step login is already set up. Ask a platform admin to reset it.")
        secret = auth.new_totp_secret()
        con = self._con()
        try:
            with con:
                con.execute("UPDATE users SET totp_secret = ? WHERE id = ?", (secret, user["id"]))
        finally:
            con.close()
        return {"secret": secret, "uri": auth.totp_uri(secret, user["email"])}

    def two_step_confirm(self, user, code, token, ip=""):
        con = self._con()
        try:
            with con:
                row = con.execute("SELECT totp_secret, totp_enabled FROM users WHERE id = ?", (user["id"],)).fetchone()
                if row["totp_enabled"] or not row["totp_secret"] or not auth.verify_totp(row["totp_secret"], code, self.clock()):
                    raise PortalError(400, "That code is not right. Codes change every 30 seconds.")
                con.execute("UPDATE users SET totp_enabled = 1 WHERE id = ?", (user["id"],))
                con.execute("UPDATE sessions SET mfa_ok = 1 WHERE token_hash = ?", (auth.token_hash(token),))
                # Backup codes for a lost or broken phone. Shown once, now; only their hashes are kept.
                codes = auth.new_recovery_codes()
                con.execute("DELETE FROM recovery_codes WHERE user_id = ?", (user["id"],))
                con.executemany("INSERT INTO recovery_codes (user_id, code_hash) VALUES (?, ?)", [(user["id"], auth.recovery_hash(c)) for c in codes])
                self._log(con, user["email"], "two-step.enabled", user["institution_id"], "", ip)
        finally:
            con.close()
        return {"ok": True, "backupCodes": codes}

    # ------------------------------------------------------------------- packs

    def institutions(self, user):
        """The institutions this person works on, with where each one is in the workflow."""
        folder = self.content / "institutions"
        index = json.loads((folder / "index.json").read_text(encoding="utf-8")) if (folder / "index.json").exists() else []
        con = self._con()
        try:
            states = {r["institution_id"]: r["state"] for r in con.execute("SELECT institution_id, state FROM packs")}
            drafts = [r["institution_id"] for r in con.execute("SELECT institution_id FROM packs")]
        finally:
            con.close()
        known = {d["id"]: d for d in index}
        out = []
        for inst_id in list(known) + [d for d in drafts if d not in known]:
            if user["role"] != "admin" and user["institution_id"] != inst_id:
                continue
            entry = known.get(inst_id, {"id": inst_id, "name": None, "version": 0})
            out.append({"id": inst_id, "name": entry.get("name"), "version": entry.get("version", 0), "status": entry.get("status"),
                        "licence": entry.get("licence"), "state": states.get(inst_id, "draft")})
        return out

    def _row(self, con, institution_id):
        """The working draft. It starts as a copy of what is published."""
        row = con.execute("SELECT * FROM packs WHERE institution_id = ?", (institution_id,)).fetchone()
        if row:
            return row
        pack = self.published(institution_id)
        if pack is None:
            raise PortalError(404, "No such institution.")
        con.execute("INSERT INTO packs (institution_id, draft) VALUES (?, ?)", (institution_id, json.dumps(pack, ensure_ascii=False)))
        return con.execute("SELECT * FROM packs WHERE institution_id = ?", (institution_id,)).fetchone()

    def _name_of(self, con, user_id):
        row = con.execute("SELECT name, email FROM users WHERE id = ?", (user_id,)).fetchone() if user_id else None
        return f"{row['name']} ({row['email']})" if row else None

    def get_pack(self, user, institution_id):
        self._scope(user, institution_id)
        con = self._con()
        try:
            with con:
                row = self._row(con, institution_id)
                draft = json.loads(row["draft"])
                live = self.published(institution_id)
                submitted_by_me = row["submitted_by"] == user["id"]
                viewer = user["role"] == "viewer"
                return {
                    "pack": draft, "rev": row["rev"], "state": row["state"],
                    "publishedVersion": (live or {}).get("version", 0),
                    "submittedBy": self._name_of(con, row["submitted_by"]), "reviewNote": row["review_note"],
                    "changes": self.changes(live, draft),
                    "diff": self.diff(live, draft),
                    "can": {
                        "edit": row["state"] == "draft" and not viewer,
                        "addCards": row["state"] == "draft" and user["role"] == "admin",
                        "submit": row["state"] == "draft" and not viewer and bool(self.changes(live, draft)),
                        "review": row["state"] == "submitted" and user["role"] in ("reviewer", "admin") and not submitted_by_me,
                        "ownSubmission": row["state"] == "submitted" and submitted_by_me,
                        "viewOnly": viewer,
                        "rollback": user["role"] in ("reviewer", "admin"),
                    },
                }
        finally:
            con.close()

    @staticmethod
    def changes(live, draft):
        """A plain list of what differs from the published pack, for the reviewer."""
        live = live or {}
        out = []
        seen = set()
        for key in sorted(EDITABLE - {"support", "cards"}):
            if live.get(key) != draft.get(key) and SECTION_NAMES[key] not in seen:
                seen.add(SECTION_NAMES[key])
                out.append(SECTION_NAMES[key])
        old, new = live.get("support") or {}, draft.get("support") or {}
        services = sorted(k for k in set(old) | set(new) if old.get(k) != new.get(k))
        if services:
            out.append("Services: " + ", ".join(services))
        old, new = live.get("cards") or {}, draft.get("cards") or {}
        off = sorted(set(new.get("off") or []) ^ set(old.get("off") or []))
        if off:
            out.append("Cards switched on or off: " + ", ".join(off))
        edited = sorted(k for k in set(old.get("edit") or {}) | set(new.get("edit") or {}) if (old.get("edit") or {}).get(k) != (new.get("edit") or {}).get(k))
        if edited:
            out.append("Cards reworded: " + ", ".join(edited))
        if (old.get("add") or {}) != (new.get("add") or {}):
            out.append("Own cards")
        return out

    @staticmethod
    def diff(live, draft):
        """Every value that differs from the published pack, as before and after, for the reviewer."""
        def flatten(node, path, out):
            if isinstance(node, dict):
                for key, value in node.items():
                    flatten(value, path + [key], out)
            elif isinstance(node, list):
                if node and all(isinstance(x, dict) and "id" in x for x in node):
                    for item in node:           # buildings, campuses, own cards: follow them by id, not by position
                        flatten(item, path + [str(item["id"])], out)
                elif all(not isinstance(x, (dict, list)) for x in node):
                    out[" > ".join(path)] = ", ".join(str(x) for x in node)
                else:
                    for i, item in enumerate(node):
                        flatten(item, path + [str(i + 1)], out)
            elif node is not None and node != "":
                out[" > ".join(path)] = str(node)
            return out

        old = flatten({k: v for k, v in (live or {}).items() if k in EDITABLE}, [], {})
        new = flatten({k: v for k, v in draft.items() if k in EDITABLE}, [], {})
        rows = [{"where": key, "before": old.get(key, ""), "after": new.get(key, "")}
                for key in sorted(set(old) | set(new)) if old.get(key) != new.get(key)]
        return rows[:MAX_DIFF_ROWS]

    def _merge(self, current, incoming):
        """Take only what staff may edit from the incoming pack; keep everything else as it was."""
        if not isinstance(incoming, dict):
            raise PortalError(400, "The pack must be an object.")
        merged = {k: v for k, v in current.items() if k in PROTECTED}
        for key in EDITABLE:
            if key in incoming and incoming[key] is not None:
                merged[key] = incoming[key]
        if len(json.dumps(merged, ensure_ascii=False).encode("utf-8")) > MAX_PACK_BYTES:
            raise PortalError(413, "The pack is too large.")
        return merged

    @staticmethod
    def _own_cards(pack):
        """The cards written specially for this institution, for the whole of it and for each campus."""
        layers = {"": pack, **{c.get("id"): c for c in pack.get("campuses") or []}}
        return {k: add for k, layer in layers.items() if (add := (layer.get("cards") or {}).get("add"))}

    def save(self, user, institution_id, pack, rev, ip=""):
        self._scope(user, institution_id)
        self._need(user, "editor", "reviewer", "admin")
        con = self._con()
        try:
            with con:
                row = self._row(con, institution_id)
                if row["state"] != "draft":
                    raise PortalError(409, "This pack is waiting for review and cannot be edited until it is approved or sent back.")
                if row["rev"] != rev:
                    raise PortalError(409, "Someone else saved changes while you were editing. Reload to see them, then make your change again.", rev=row["rev"])
                current = json.loads(row["draft"])
                merged = self._merge(current, pack)
                # A new card sets what a choice does, which is a game rule. Our team writes those,
                # on request; the institution's reviewer still approves them like any other change.
                if user["role"] != "admin" and self._own_cards(merged) != self._own_cards(current):
                    raise PortalError(403, "New story cards are written by the University Simulator team. Ask us for one, and it will come to you for review.")
                con.execute("UPDATE packs SET draft = ?, rev = rev + 1, updated_by = ?, updated_at = ?, review_note = NULL WHERE institution_id = ?",
                            (json.dumps(merged, ensure_ascii=False), user["id"], self.clock(), institution_id))
                self._log(con, user["email"], "draft.saved", institution_id, "; ".join(self.changes(self.published(institution_id), merged)), ip)
                return {"rev": row["rev"] + 1}
        finally:
            con.close()

    def run_check(self, user, institution_id):
        self._scope(user, institution_id)
        con = self._con()
        try:
            with con:
                draft = json.loads(self._row(con, institution_id)["draft"])
        finally:
            con.close()
        return self.check(institution_id, draft)

    def submit(self, user, institution_id, ip=""):
        self._scope(user, institution_id)
        self._need(user, "editor", "reviewer", "admin")
        con = self._con()
        try:
            with con:
                row = self._row(con, institution_id)
                if row["state"] != "draft":
                    raise PortalError(409, "This pack is already waiting for review.")
                draft = json.loads(row["draft"])
                if not self.changes(self.published(institution_id), draft):
                    raise PortalError(400, "There are no changes to submit.")
                result = self.check(institution_id, draft)
                if result["errors"]:
                    raise PortalError(422, "The pack check found problems. Fix them and submit again.", **result)
                con.execute("UPDATE packs SET state = 'submitted', submitted_by = ?, submitted_at = ?, review_note = NULL WHERE institution_id = ?",
                            (user["id"], self.clock(), institution_id))
                self._log(con, user["email"], "pack.submitted", institution_id, "; ".join(self.changes(self.published(institution_id), draft)), ip)
                return {"state": "submitted", "warnings": result["warnings"]}
        finally:
            con.close()

    def review(self, user, institution_id, decision, note="", ip=""):
        """Approve (and publish) or send back. Never by the person who submitted it."""
        self._scope(user, institution_id)
        self._need(user, "reviewer", "admin")
        if decision not in ("approve", "reject"):
            raise PortalError(400, "Decision must be approve or reject.")
        con = self._con()
        try:
            with con:
                row = self._row(con, institution_id)
                if row["state"] != "submitted":
                    raise PortalError(409, "Nothing is waiting for review.")
                if row["submitted_by"] == user["id"]:
                    raise PortalError(403, "A second person has to review this: you cannot approve your own submission.")
                if decision == "reject":
                    if not (note or "").strip():
                        raise PortalError(400, "Say what needs to change, so the editor knows.")
                    con.execute("UPDATE packs SET state = 'draft', review_note = ?, rev = rev + 1 WHERE institution_id = ?", (note.strip()[:1000], institution_id))
                    self._log(con, user["email"], "pack.sent_back", institution_id, note.strip(), ip)
                    return {"state": "draft"}
                draft = json.loads(row["draft"])
                submitter = self._name_of(con, row["submitted_by"])
                version = self._publish(con, institution_id, draft, submitter, user, "pack.published", ip)
                return {"state": "draft", "version": version}
        finally:
            con.close()

    def _publish(self, con, institution_id, pack, submitter, approver, action, ip):
        live = self.published(institution_id) or {}
        pack = dict(pack)
        pack["version"] = int(live.get("version") or 0) + 1
        pack["signedOff"] = {"by": approver["name"], "date": self._today()}
        result = self.check(institution_id, pack)
        if result["errors"]:
            raise PortalError(422, "The pack check found problems, so nothing was published.", **result)
        text = json.dumps(pack, ensure_ascii=False)
        con.execute("INSERT INTO versions (institution_id, version, pack, submitted_by, approved_by, published_at) VALUES (?, ?, ?, ?, ?, ?)",
                    (institution_id, pack["version"], text, submitter, f"{approver['name']} ({approver['email']})", self.clock()))
        con.execute("UPDATE packs SET draft = ?, state = 'draft', rev = rev + 1, submitted_by = NULL, submitted_at = NULL, review_note = NULL WHERE institution_id = ?",
                    (text, institution_id))
        self._log(con, approver["email"], action, institution_id, f"version {pack['version']}", ip)
        # Written last: if this fails, the database changes above are rolled back with it.
        self._replace(self._path(institution_id), pack)
        self._write_directory()
        return pack["version"]

    def rollback(self, user, institution_id, version, ip=""):
        """Publish an earlier version again, as a new version. The history is never rewritten."""
        self._scope(user, institution_id)
        self._need(user, "reviewer", "admin")
        con = self._con()
        try:
            with con:
                old = con.execute("SELECT pack FROM versions WHERE institution_id = ? AND version = ?", (institution_id, version)).fetchone()
                if not old:
                    raise PortalError(404, "That version is not in the history.")
                self._row(con, institution_id)
                new = self._publish(con, institution_id, json.loads(old["pack"]), f"rollback to version {version}", user, "pack.rolled_back", ip)
                return {"version": new}
        finally:
            con.close()

    def history(self, user, institution_id):
        self._scope(user, institution_id)
        con = self._con()
        try:
            versions = [{"version": r["version"], "submittedBy": r["submitted_by"], "approvedBy": r["approved_by"], "at": r["published_at"]}
                        for r in con.execute("SELECT * FROM versions WHERE institution_id = ? ORDER BY version DESC LIMIT 50", (institution_id,))]
            audit = [{"at": r["at"], "who": r["user_email"], "action": r["action"], "detail": r["detail"]}
                     for r in con.execute("SELECT * FROM audit WHERE institution_id = ? ORDER BY id DESC LIMIT 200", (institution_id,))]
            return {"versions": versions, "audit": audit}
        finally:
            con.close()

    # ----------------------------------------------------------- platform admin

    def create_institution(self, actor, data, ip=""):
        """A new institution starts as a draft. It appears to students only once a pack is approved."""
        self._need(actor, "admin")
        inst_id = (data.get("id") or "").strip()
        if not INSTITUTION_ID.match(inst_id):
            raise PortalError(400, "The id must be lower-case letters, digits and hyphens.")
        if self.published(inst_id) is not None or self._has_draft(inst_id):
            raise PortalError(409, "An institution with that id already exists.")
        name = (data.get("name") or "").strip()
        if not name:
            raise PortalError(400, "The institution needs a name.")
        status = data.get("status") if data.get("status") in ("demo", "licensed") else "licensed"
        pack = {"id": inst_id, "version": 0, "name": {"en": name}, "short": (data.get("short") or name).strip(), "status": status,
                "type": data.get("type") if data.get("type") in ("university", "tvet", "private") else "university",
                "province": (data.get("province") or None), "costIndex": 1, "costs": {"rent_private": 3500, "taxi_week": 250},
                "campus": {"en": "New institution"}, "city": {"en": "the city"}, "area": (data.get("short") or name).strip(), "support": {}}
        if status == "licensed":
            pack["licence"] = {"tier": data.get("licenceTier") or "standard", "expires": data.get("licenceExpires") or ""}
        con = self._con()
        try:
            with con:
                con.execute("INSERT INTO packs (institution_id, draft) VALUES (?, ?)", (inst_id, json.dumps(pack, ensure_ascii=False)))
                self._log(con, actor["email"], "institution.created", inst_id, name, ip)
        finally:
            con.close()
        return {"id": inst_id}

    def set_licence(self, actor, institution_id, data, ip=""):
        """Status, type and licence are the platform's to set, never the institution's."""
        self._need(actor, "admin")
        self._scope(actor, institution_id)
        con = self._con()
        try:
            with con:
                row = self._row(con, institution_id)
                if row["state"] != "draft":
                    raise PortalError(409, "This pack is waiting for review.")
                pack = json.loads(row["draft"])
                if data.get("status") in ("demo", "licensed"):
                    pack["status"] = data["status"]
                if data.get("type") in ("university", "tvet", "private"):
                    pack["type"] = data["type"]
                if data.get("licenceTier") or data.get("licenceExpires"):
                    pack["licence"] = {"tier": data.get("licenceTier") or (pack.get("licence") or {}).get("tier") or "standard",
                                       "expires": data.get("licenceExpires") or (pack.get("licence") or {}).get("expires") or ""}
                con.execute("UPDATE packs SET draft = ?, rev = rev + 1 WHERE institution_id = ?", (json.dumps(pack, ensure_ascii=False), institution_id))
                self._log(con, actor["email"], "licence.changed", institution_id, json.dumps({k: data.get(k) for k in ("status", "type", "licenceTier", "licenceExpires")}), ip)
        finally:
            con.close()
        return {"ok": True}

    # ---------------------------------------------------------------- catalogue

    def catalogue(self):
        """What the editing screens offer to choose from: services, cards, courses, housing, map positions."""
        core = json.loads((self.content / "core.json").read_text(encoding="utf-8"))
        chapters = []
        for entry in json.loads((self.content / "chapters" / "index.json").read_text(encoding="utf-8")):
            ch = json.loads((self.content / "chapters" / f"{entry['id']}.json").read_text(encoding="utf-8"))
            cards = [{"id": e["id"], "type": e["type"], "title": e.get("title"), "text": e.get("text"),
                      "choices": [{"id": c["id"], "label": c["label"], "outcome": c["outcome"]} for c in e.get("choices", [])]}
                     for e in ch["events"] if e["type"] not in ("tests", "results")]
            pools = sorted({s["pool"] for s in ch.get("slots", []) if any(e.get("pool") == s["pool"] for e in ch["events"])})
            chapters.append({"id": ch["id"], "title": ch["title"], "cards": cards, "pools": pools, "weeks": ch["weeks"]})
        return {
            "services": [{"id": k, "name": v["name"], "offers": v["offers"], "reach": v["reach"]} for k, v in core["support"].items()],
            "courses": [{"id": c["id"], "label": c["label"]} for c in core["courses"]],
            "housing": [{"id": h["id"], "label": h["label"]} for h in core["housing"]],
            "positions": json.loads((self.content / "map-positions.json").read_text(encoding="utf-8")),
            "styles": ["help_seeker", "planner", "connector", "avoider", "borrower", "self_sacrificer"],
            "chapters": chapters,
        }
