"""Staff portal: accounts, isolation between institutions, and the review workflow.

    python -m unittest test.test_portal
"""

import json
import shutil
import sqlite3
import tempfile
import unittest
from pathlib import Path

from server import auth, mailer, web
from server.portal import Portal, PortalError, node_check

ROOT = Path(__file__).resolve().parent.parent
PASSWORD = "a long enough passphrase"


class Clock:
    def __init__(self):
        self.now = 1_800_000_000.0

    def __call__(self):
        return self.now


class PortalCase(unittest.TestCase):
    mfa = False
    with_mail = False
    check = staticmethod(lambda inst, pack: {"errors": [], "warnings": []})

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        shutil.copytree(ROOT / "content", self.tmp / "content")
        self.clock = Clock()
        self.mail = mailer.Outbox(self.tmp / "data" / "outbox") if self.with_mail else None
        self.portal = Portal(self.tmp / "data" / "portal.db", self.tmp / "content", self.check, mfa=self.mfa, clock=self.clock,
                             mailer=self.mail, base_url="https://portal.example")
        self.admin = self.account("admin@unisim.example", "Admin", "admin")
        self.editor = self.account("editor@sizwe.example", "Sizwe Editor", "editor", "sizwe")
        self.reviewer = self.account("reviewer@sizwe.example", "Sizwe Reviewer", "reviewer", "sizwe")
        self.outsider = self.account("editor@karoocoast.example", "Karoo Editor", "editor", "karoo-coast")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def account(self, email, name, role, institution=None):
        """Create an account and sign it in with its own password."""
        temp = self.portal.create_user(None, email, name, role, institution)["temporaryPassword"]
        token, _ = self.portal.login(email, temp)
        self.portal.change_password(self.portal.session(token), temp, PASSWORD)
        return self.portal.session(token)

    def edit(self, user, institution="sizwe", **changes):
        current = self.portal.get_pack(user, institution)
        pack = {**current["pack"], **changes}
        return self.portal.save(user, institution, pack, current["rev"])

    def live(self, institution="sizwe"):
        return json.loads((self.tmp / "content" / "institutions" / f"{institution}.json").read_text(encoding="utf-8"))


class Accounts(PortalCase):
    def test_passwords_are_hashed_and_wrong_ones_refused(self):
        con = sqlite3.connect(self.tmp / "data" / "portal.db")
        stored = con.execute("SELECT pw_hash, pw_salt FROM users WHERE email = 'editor@sizwe.example'").fetchone()
        con.close()
        self.assertNotIn(PASSWORD, stored)
        self.assertTrue(auth.verify_password(PASSWORD, *stored))
        token, err = self.portal.login("editor@sizwe.example", "wrong")
        self.assertIsNone(token)
        # An unknown account gets exactly the same answer as a wrong password.
        _, unknown = self.portal.login("nobody@sizwe.example", "wrong")
        self.assertEqual(err.body, unknown.body)

    def test_account_locks_after_repeated_failures_and_waiting_does_not_unlock_it(self):
        for _ in range(8):
            self.portal.login("editor@sizwe.example", "wrong")
        token, err = self.portal.login("editor@sizwe.example", PASSWORD)
        self.assertIsNone(token)
        self.assertEqual(err.status, 429)
        self.clock.now += 30 * 86400
        self.assertIsNone(self.portal.login("editor@sizwe.example", PASSWORD)[0])
        # An admin's reset is one way back in.
        temp = self.portal.reset_user(self.admin, self.editor["id"])["temporaryPassword"]
        self.assertTrue(self.portal.login("editor@sizwe.example", temp)[0])

    def test_temporary_password_must_be_replaced_with_a_strong_one(self):
        temp = self.portal.create_user(self.admin, "new@sizwe.example", "New", "editor", "sizwe")["temporaryPassword"]
        token, info = self.portal.login("new@sizwe.example", temp)
        self.assertEqual(info["step"], "password")
        user = self.portal.session(token)
        with self.assertRaises(PortalError):
            self.portal.ready(user)
        with self.assertRaises(PortalError):
            self.portal.change_password(user, temp, "short")
        self.portal.change_password(user, temp, PASSWORD)
        self.portal.ready(self.portal.session(token))

    def test_sessions_expire_and_logout_ends_them(self):
        token, _ = self.portal.login("editor@sizwe.example", PASSWORD)
        self.assertTrue(self.portal.session(token))
        self.portal.logout(token)
        self.assertIsNone(self.portal.session(token))
        token, _ = self.portal.login("editor@sizwe.example", PASSWORD)
        self.clock.now += 9 * 3600
        self.assertIsNone(self.portal.session(token))

    def test_only_admins_manage_accounts(self):
        with self.assertRaises(PortalError) as e:
            self.portal.create_user(self.editor, "x@sizwe.example", "X", "reviewer", "sizwe")
        self.assertEqual(e.exception.status, 403)
        with self.assertRaises(PortalError):
            self.portal.list_users(self.reviewer)
        self.assertEqual(len(self.portal.list_users(self.admin)), 4)
        # A disabled account cannot sign in, and its sessions end at once.
        token, _ = self.portal.login("editor@sizwe.example", PASSWORD)
        self.portal.reset_user(self.admin, self.editor["id"], disable=True)
        self.assertIsNone(self.portal.session(token))
        self.assertIsNone(self.portal.login("editor@sizwe.example", PASSWORD)[0])


class TwoStep(PortalCase):
    mfa = True

    def test_two_step_login_is_set_up_then_required(self):
        token, info = self.portal.login("editor@sizwe.example", PASSWORD)
        self.assertEqual(info["step"], "two-step")
        user = self.portal.session(token)
        with self.assertRaises(PortalError):
            self.portal.ready(user)
        secret = self.portal.two_step_begin(user)["secret"]
        with self.assertRaises(PortalError):
            self.portal.two_step_confirm(user, "000000", token)
        self.portal.two_step_confirm(user, auth.totp(secret, self.clock.now), token)
        self.portal.ready(self.portal.session(token))
        # From now on the password alone is not enough.
        token, err = self.portal.login("editor@sizwe.example", PASSWORD)
        self.assertIsNone(token)
        self.assertEqual(err.body["need"], "code")
        self.assertIsNone(self.portal.login("editor@sizwe.example", PASSWORD, "123456")[0])
        token, info = self.portal.login("editor@sizwe.example", PASSWORD, auth.totp(secret, self.clock.now))
        self.assertEqual(info["step"], "ready")
        # Wrong codes count towards the lock as wrong passwords do.
        for _ in range(8):
            self.portal.login("editor@sizwe.example", PASSWORD, "000000")
        token, err = self.portal.login("editor@sizwe.example", PASSWORD, auth.totp(secret, self.clock.now))
        self.assertIsNone(token)
        self.assertEqual(err.status, 429)

    def test_backup_codes_sign_in_once_each_when_the_phone_is_lost(self):
        token, _ = self.portal.login("editor@sizwe.example", PASSWORD)
        user = self.portal.session(token)
        secret = self.portal.two_step_begin(user)["secret"]
        codes = self.portal.two_step_confirm(user, auth.totp(secret, self.clock.now), token)["backupCodes"]
        self.assertEqual(len(set(codes)), 8)
        # Only hashes are stored.
        con = sqlite3.connect(self.tmp / "data" / "portal.db")
        stored = [r[0] for r in con.execute("SELECT code_hash FROM recovery_codes")]
        con.close()
        self.assertEqual(len(stored), 8)
        self.assertFalse(set(codes) & set(stored))
        # A code works in place of the authenticator, typed loosely, and then never again.
        token, info = self.portal.login("editor@sizwe.example", PASSWORD, f" {codes[0].lower()} ")
        self.assertTrue(token)
        self.assertEqual(info["backupCodesLeft"], 7)
        self.assertIsNone(self.portal.login("editor@sizwe.example", PASSWORD, codes[0])[0])
        self.assertIsNone(self.portal.login("editor@sizwe.example", PASSWORD, "AAAAA-AAAAA")[0])
        # A normal sign-in says nothing about backup codes.
        _, info = self.portal.login("editor@sizwe.example", PASSWORD, auth.totp(secret, self.clock.now))
        self.assertNotIn("backupCodesLeft", info)
        # An admin reset clears two-step login, and the old codes with it.
        temp = self.portal.reset_user(self.admin, self.editor["id"])["temporaryPassword"]
        self.assertTrue(self.portal.login("editor@sizwe.example", temp)[0])
        con = sqlite3.connect(self.tmp / "data" / "portal.db")
        self.assertEqual(con.execute("SELECT COUNT(*) FROM recovery_codes").fetchone()[0], 0)
        con.close()

    def test_totp_matches_the_published_test_vector(self):
        # RFC 6238 test secret "12345678901234567890" at T = 59 seconds.
        self.assertEqual(auth.totp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59), "287082")


class Isolation(PortalCase):
    def test_staff_only_see_and_change_their_own_institution(self):
        self.assertEqual([i["id"] for i in self.portal.institutions(self.editor)], ["sizwe"])
        self.assertEqual([i["id"] for i in self.portal.institutions(self.outsider)], ["karoo-coast"])
        self.assertEqual(len(self.portal.institutions(self.admin)), 2)
        for action in (lambda: self.portal.get_pack(self.outsider, "sizwe"),
                       lambda: self.portal.save(self.outsider, "sizwe", {}, 1),
                       lambda: self.portal.submit(self.outsider, "sizwe"),
                       lambda: self.portal.history(self.outsider, "sizwe"),
                       lambda: self.portal.run_check(self.outsider, "sizwe")):
            with self.assertRaises(PortalError) as e:
                action()
            self.assertEqual(e.exception.status, 404)

    def test_staff_cannot_change_status_licence_type_or_version(self):
        self.edit(self.editor, status="licensed", type="tvet", version=999, licence={"tier": "gold", "expires": "2099-01-01"},
                  id="other", short="Sizwe U")
        pack = self.portal.get_pack(self.editor, "sizwe")["pack"]
        self.assertEqual((pack["status"], pack["type"], pack["id"]), ("demo", "university", "sizwe"))
        self.assertNotEqual(pack["version"], 999)
        self.assertNotIn("licence", pack)
        self.assertEqual(pack["short"], "Sizwe U")


class Workflow(PortalCase):
    def test_draft_submit_review_publish(self):
        before = self.live()["version"]
        self.edit(self.editor, short="Sizwe U")
        state = self.portal.get_pack(self.editor, "sizwe")
        self.assertEqual(state["changes"], ["Name"])
        self.assertEqual(self.live()["short"], "Sizwe", "a draft changes nothing for students")
        self.portal.submit(self.editor, "sizwe")
        # Locked while it waits, and the submitter cannot approve it.
        with self.assertRaises(PortalError) as e:
            self.edit(self.editor, short="Again")
        self.assertEqual(e.exception.status, 409)
        with self.assertRaises(PortalError) as e:
            self.portal.review(self.editor, "sizwe", "approve")
        self.assertEqual(e.exception.status, 403)
        self.assertTrue(self.portal.get_pack(self.reviewer, "sizwe")["can"]["review"])
        result = self.portal.review(self.reviewer, "sizwe", "approve")
        live = self.live()
        self.assertEqual((live["short"], live["version"], result["version"]), ("Sizwe U", before + 1, before + 1))
        self.assertEqual(live["signedOff"]["by"], "Sizwe Reviewer")
        directory = json.loads((self.tmp / "content" / "institutions" / "index.json").read_text(encoding="utf-8"))
        self.assertEqual(next(d for d in directory if d["id"] == "sizwe")["version"], before + 1)

    def test_nobody_reviews_their_own_submission_even_a_reviewer(self):
        self.edit(self.reviewer, short="Mine")
        self.portal.submit(self.reviewer, "sizwe")
        with self.assertRaises(PortalError):
            self.portal.review(self.reviewer, "sizwe", "approve")
        self.portal.review(self.admin, "sizwe", "approve")
        self.assertEqual(self.live()["short"], "Mine")

    def test_sending_back_needs_a_note_and_reopens_the_draft(self):
        self.edit(self.editor, short="Sizwe U")
        self.portal.submit(self.editor, "sizwe")
        with self.assertRaises(PortalError):
            self.portal.review(self.reviewer, "sizwe", "reject")
        self.portal.review(self.reviewer, "sizwe", "reject", "The short name should stay Sizwe.")
        state = self.portal.get_pack(self.editor, "sizwe")
        self.assertEqual((state["state"], state["reviewNote"]), ("draft", "The short name should stay Sizwe."))
        self.assertEqual(self.live()["short"], "Sizwe")
        self.edit(self.editor, short="Sizwe")

    def test_two_people_editing_do_not_overwrite_each_other(self):
        first = self.portal.get_pack(self.editor, "sizwe")
        second = self.portal.get_pack(self.reviewer, "sizwe")
        self.portal.save(self.editor, "sizwe", {**first["pack"], "short": "A"}, first["rev"])
        with self.assertRaises(PortalError) as e:
            self.portal.save(self.reviewer, "sizwe", {**second["pack"], "short": "B"}, second["rev"])
        self.assertEqual(e.exception.status, 409)
        self.assertEqual(self.portal.get_pack(self.editor, "sizwe")["pack"]["short"], "A")

    def test_rollback_publishes_an_earlier_version_as_a_new_one(self):
        for name in ("One", "Two"):
            self.edit(self.editor, short=name)
            self.portal.submit(self.editor, "sizwe")
            self.portal.review(self.reviewer, "sizwe", "approve")
        versions = self.portal.history(self.editor, "sizwe")["versions"]
        first = versions[-1]["version"]
        with self.assertRaises(PortalError):
            self.portal.rollback(self.editor, "sizwe", first)
        new = self.portal.rollback(self.reviewer, "sizwe", first)["version"]
        self.assertEqual((self.live()["short"], self.live()["version"]), ("One", new))
        self.assertEqual(new, versions[0]["version"] + 1, "history is never rewritten")

    def test_every_action_is_in_the_audit_log_which_cannot_be_altered(self):
        self.edit(self.editor, short="Sizwe U")
        self.portal.submit(self.editor, "sizwe")
        self.portal.review(self.reviewer, "sizwe", "approve")
        actions = [a["action"] for a in self.portal.history(self.editor, "sizwe")["audit"]]
        for expected in ("draft.saved", "pack.submitted", "pack.published", "login", "user.created"):
            self.assertIn(expected, actions)
        con = sqlite3.connect(self.tmp / "data" / "portal.db")
        for sql in ("DELETE FROM audit", "UPDATE audit SET detail = 'x'"):
            with self.assertRaises(sqlite3.DatabaseError):
                con.execute(sql)
        con.close()

    def test_admin_creates_an_institution_that_stays_hidden_until_approved(self):
        self.portal.create_institution(self.admin, {"id": "new-college", "name": "New College", "type": "tvet", "status": "demo"})
        self.assertFalse((self.tmp / "content" / "institutions" / "new-college.json").exists())
        with self.assertRaises(PortalError):
            self.portal.create_institution(self.editor, {"id": "x-college", "name": "X"})
        with self.assertRaises(PortalError):
            self.portal.create_institution(self.admin, {"id": "sizwe", "name": "Again"})
        staff = self.account("editor@newcollege.example", "College Editor", "editor", "new-college")
        self.assertEqual(self.portal.get_pack(staff, "new-college")["publishedVersion"], 0)


class RealCheck(PortalCase):
    """With the real pack check: an unsafe pack cannot be submitted, a safe one publishes."""
    check = staticmethod(node_check(ROOT))

    def test_a_pack_that_fails_the_check_cannot_be_submitted(self):
        pack = self.portal.get_pack(self.editor, "sizwe")["pack"]
        support = {**pack["support"], "health": {**pack["support"]["health"], "building": "nowhere"}}
        self.edit(self.editor, support=support)
        with self.assertRaises(PortalError) as e:
            self.portal.submit(self.editor, "sizwe")
        self.assertEqual(e.exception.status, 422)
        self.assertTrue(any("not on this campus's map" in x for x in e.exception.body["errors"]))
        self.assertEqual(self.portal.get_pack(self.editor, "sizwe")["state"], "draft")

    def test_a_reworded_card_goes_live_through_review(self):
        pack = self.portal.get_pack(self.outsider, "karoo-coast")["pack"]
        cards = json.loads(json.dumps(pack["cards"]))
        cards["edit"]["FT-02"]["title"] = {"en": "Clubs and Societies Fair", "zu": "Umbukiso Wamaqembu Nezinhlangano"}
        self.edit(self.outsider, "karoo-coast", cards=cards)
        self.assertEqual(self.portal.get_pack(self.outsider, "karoo-coast")["changes"], ["Cards reworded: FT-02"])
        self.portal.submit(self.outsider, "karoo-coast")
        self.portal.review(self.admin, "karoo-coast", "approve")
        self.assertEqual(self.live("karoo-coast")["cards"]["edit"]["FT-02"]["title"]["en"], "Clubs and Societies Fair")


class EmailLinks(PortalCase):
    """Invitations and password resets by emailed link."""
    with_mail = True

    def token(self, message):
        return message["body"].split("#set-password=")[1].split()[0]

    def test_invitation_sets_the_password_and_works_once(self):
        made = self.portal.create_user(self.admin, "new@sizwe.example", "New Person", "editor", "sizwe")
        self.assertTrue(made["invited"])
        self.assertNotIn("temporaryPassword", made, "nobody but the invited person ever has a password for the account")
        message = self.mail.sent[-1]
        self.assertEqual(message["to"], "new@sizwe.example")
        self.assertIn("https://portal.example/portal/#set-password=", message["body"])
        self.assertTrue(list((self.tmp / "data" / "outbox").glob("*.txt")), "the outbox keeps a copy on disk")
        token = self.token(message)
        with self.assertRaises(PortalError):
            self.portal.redeem_link(token, "short")
        self.portal.redeem_link(token, PASSWORD)
        signed_in, info = self.portal.login("new@sizwe.example", PASSWORD)
        self.assertTrue(signed_in)
        self.assertEqual(info["step"], "ready")
        with self.assertRaises(PortalError):
            self.portal.redeem_link(token, "another long passphrase")
        # Only a hash of the link is stored.
        con = sqlite3.connect(self.tmp / "data" / "portal.db")
        self.assertNotIn(token, [r[0] for r in con.execute("SELECT token_hash FROM tokens")])
        con.close()

    def test_password_reset_reveals_nothing_and_expires(self):
        before = len(self.mail.sent)
        self.assertEqual(self.portal.request_reset("nobody@sizwe.example")["ok"], True)
        self.assertEqual(len(self.mail.sent), before, "no email for an unknown address, and the same answer")
        session, _ = self.portal.login("editor@sizwe.example", PASSWORD)
        self.assertEqual(self.portal.request_reset("Editor@Sizwe.example")["ok"], True)
        token = self.token(self.mail.sent[-1])
        self.clock.now += 2 * 3600
        with self.assertRaises(PortalError):
            self.portal.redeem_link(token, "a brand new passphrase")
        self.portal.request_reset("editor@sizwe.example")
        self.portal.redeem_link(self.token(self.mail.sent[-1]), "a brand new passphrase")
        self.assertIsNone(self.portal.session(session), "a reset signs out every device")
        self.assertIsNone(self.portal.login("editor@sizwe.example", PASSWORD)[0])
        self.assertTrue(self.portal.login("editor@sizwe.example", "a brand new passphrase")[0])

    def test_a_locked_account_is_emailed_a_link_that_unlocks_it(self):
        before = len(self.mail.sent)
        for _ in range(8):
            self.portal.login("editor@sizwe.example", "wrong")
        self.assertEqual(len(self.mail.sent), before + 1, "one email, sent when the account locks")
        message = self.mail.sent[-1]
        self.assertEqual(message["to"], "editor@sizwe.example")
        self.assertIn("locked", message["subject"])
        self.assertIsNone(self.portal.login("editor@sizwe.example", PASSWORD)[0], "the right password does not unlock it")
        self.portal.redeem_link(self.token(message), "a brand new passphrase")
        self.assertTrue(self.portal.login("editor@sizwe.example", "a brand new passphrase")[0])

    def test_smtp_mailer_is_chosen_from_the_environment(self):
        import os
        os.environ["SMTP_HOST"] = "smtp.example"
        try:
            chosen = mailer.from_env(self.tmp)
        finally:
            del os.environ["SMTP_HOST"]
        self.assertIsInstance(chosen, mailer.Smtp)
        self.assertFalse(chosen.reveals_links, "with real email, links are never shown on screen")
        self.assertIsInstance(mailer.from_env(self.tmp), mailer.Outbox)


class Reviewing(PortalCase):
    def test_the_reviewer_sees_before_and_after_for_every_changed_value(self):
        pack = self.portal.get_pack(self.outsider, "karoo-coast")["pack"]
        pages = json.loads(json.dumps(pack["pages"]))
        pages["accredited"]["items"].append({"name": "Harbour House", "detail": {"en": "Accredited private residence"}})
        support = json.loads(json.dumps(pack["support"]))
        support["health"]["room"] = {"en": "First floor", "zu": "Isitezi sokuqala"}
        self.edit(self.outsider, "karoo-coast", pages=pages, support=support)
        diff = {r["where"]: r for r in self.portal.get_pack(self.outsider, "karoo-coast")["diff"]}
        room = diff["support > health > room > en"]
        self.assertEqual((room["before"], room["after"]), ("Ground floor", "First floor"))
        added = diff["pages > accredited > items > 4 > name"]
        self.assertEqual((added["before"], added["after"]), ("", "Harbour House"))
        self.assertNotIn("version", " ".join(diff), "only what staff can edit is compared")

    def test_only_our_team_adds_a_card_and_the_institution_still_reviews_it(self):
        card = {"id": "SZ-01", "type": "situational", "pool": "ft_sit",
                "title": {"en": "The late bus"}, "text": {"en": "The last campus bus has gone and it is dark."},
                "choices": [{"id": "a", "label": {"en": "Walk alone"}, "outcome": {"en": "You get home shaken."}, "effects": {"wellbeing": -4}},
                            {"id": "b", "label": {"en": "Call campus security"}, "outcome": {"en": "An escort walks you home."}, "effects": {"wellbeing": 2}}]}
        with self.assertRaises(PortalError) as e:
            self.edit(self.editor, cards={"add": {"first_term": [card]}})
        self.assertEqual(e.exception.status, 403)
        self.assertNotIn("add", self.portal.get_pack(self.editor, "sizwe")["pack"].get("cards") or {}, "nothing was saved")
        self.assertFalse(self.portal.get_pack(self.editor, "sizwe")["can"]["addCards"])
        self.assertTrue(self.portal.get_pack(self.admin, "sizwe")["can"]["addCards"])
        # Our team adds it. After that the editor can still change other things, switch the card off, but not alter it.
        self.edit(self.admin, cards={"add": {"first_term": [card]}})
        self.edit(self.editor, area={"en": "Riverside"})
        self.edit(self.editor, cards={"add": {"first_term": [card]}, "off": ["SZ-01"]})
        changed = {**card, "choices": [{**card["choices"][0], "effects": {"money": -900}}, card["choices"][1]]}
        with self.assertRaises(PortalError):
            self.edit(self.editor, cards={"add": {"first_term": [changed]}})
        with self.assertRaises(PortalError):
            self.edit(self.editor, cards={})
        # It goes live only when the institution's own reviewer approves it.
        self.portal.submit(self.admin, "sizwe")
        self.portal.review(self.reviewer, "sizwe", "approve")
        self.assertEqual(self.live()["cards"]["add"]["first_term"][0]["id"], "SZ-01")

    def test_catalogue_offers_what_an_own_card_needs(self):
        cat = self.portal.catalogue()
        first_term = next(ch for ch in cat["chapters"] if ch["id"] == "first_term")
        self.assertIn("ft_sit", first_term["pools"])
        self.assertIn("help_seeker", cat["styles"])


class Web(PortalCase):
    """The HTTP layer: cookie, CSRF token and the setup steps."""

    def call(self, method, route, data=None, cookie=None, csrf=None):
        headers = {"Cookie": cookie or "", "X-CSRF-Token": csrf or ""}
        return web.handle(self.portal, method, f"/portal/api/{route}", headers, data, "10.0.0.1")

    def test_cookie_is_locked_down_and_changes_need_the_csrf_token(self):
        status, info, cookie = self.call("POST", "login", {"email": "editor@sizwe.example", "password": PASSWORD})
        self.assertEqual(status, 200)
        for part in ("HttpOnly", "SameSite=Strict", "Secure", "Path=/portal"):
            self.assertIn(part, cookie)
        jar = cookie.split(";")[0]
        self.assertEqual(self.call("GET", "pack/sizwe", cookie=jar)[0], 200)
        self.assertEqual(self.call("GET", "pack/karoo-coast", cookie=jar)[0], 404)
        self.assertEqual(self.call("GET", "pack/sizwe")[0], 401)
        self.assertEqual(self.call("POST", "pack/sizwe/submit", cookie=jar)[0], 403, "no CSRF token")
        self.assertEqual(self.call("POST", "pack/sizwe/submit", cookie=jar, csrf=info["csrf"])[0], 400, "nothing to submit")
        self.assertEqual(self.call("GET", "users", cookie=jar)[0], 403)
        self.assertEqual(self.call("GET", "nonsense", cookie=jar)[0], 404)

    def test_setup_steps_come_before_any_work(self):
        temp = self.portal.create_user(self.admin, "new@sizwe.example", "New", "editor", "sizwe")["temporaryPassword"]
        _, info, cookie = self.call("POST", "login", {"email": "new@sizwe.example", "password": temp})
        jar = cookie.split(";")[0]
        status, body, _ = self.call("GET", "pack/sizwe", cookie=jar)
        self.assertEqual((status, body["step"]), (403, "password"))
        self.assertEqual(self.call("POST", "password", {"current": temp, "new": PASSWORD}, jar, info["csrf"])[0], 200)
        self.assertEqual(self.call("GET", "pack/sizwe", cookie=jar)[0], 200)

    def test_reset_links_need_no_session(self):
        web._hits.clear()
        self.assertEqual(self.call("POST", "reset/request", {"email": "editor@sizwe.example"})[:2], (200, {"ok": True}))
        status, body, _ = self.call("POST", "reset/confirm", {"token": "not-a-real-token", "password": PASSWORD})
        self.assertEqual(status, 400)
        self.assertIn("expired", body["error"])

    def test_login_attempts_are_rate_limited(self):
        web._hits.clear()
        codes = [web.handle(self.portal, "POST", "/portal/api/login", {}, {"email": "a@b.co", "password": "x"}, "10.9.9.9")[0] for _ in range(12)]
        self.assertEqual(codes[:10], [401] * 10)
        self.assertEqual(codes[-1], 429)


if __name__ == "__main__":
    unittest.main()
