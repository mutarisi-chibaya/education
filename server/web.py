"""HTTP routes for the staff portal API (everything under /portal/api/).

The web layer only does what belongs to the web: the session cookie, the
CSRF token, rate limits and turning errors into JSON. Every permission rule
lives in portal.py.
"""

import re
import time
from http.cookies import SimpleCookie

from .portal import PortalError

COOKIE = "fys_portal"
LOGIN_LIMIT = 10      # login attempts per client per minute
WRITE_LIMIT = 120     # other requests per client per minute
_hits = {}

# (method, pattern) -> handler name. <id> is an institution id, <n> a number.
ROUTES = [
    ("POST", r"login", "login"),
    ("POST", r"logout", "logout"),
    ("POST", r"reset/request", "reset_request"),
    ("POST", r"reset/confirm", "reset_confirm"),
    ("GET", r"me", "me"),
    ("POST", r"password", "password"),
    ("POST", r"two-step/begin", "two_step_begin"),
    ("POST", r"two-step/confirm", "two_step_confirm"),
    ("GET", r"catalogue", "catalogue"),
    ("GET", r"institutions", "institutions"),
    ("POST", r"institutions", "create_institution"),
    ("GET", r"pack/(?P<id>[a-z0-9-]+)", "get_pack"),
    ("PUT", r"pack/(?P<id>[a-z0-9-]+)", "save"),
    ("POST", r"pack/(?P<id>[a-z0-9-]+)/check", "check"),
    ("POST", r"pack/(?P<id>[a-z0-9-]+)/submit", "submit"),
    ("POST", r"pack/(?P<id>[a-z0-9-]+)/review", "review"),
    ("POST", r"pack/(?P<id>[a-z0-9-]+)/rollback", "rollback"),
    ("POST", r"pack/(?P<id>[a-z0-9-]+)/licence", "licence"),
    ("GET", r"pack/(?P<id>[a-z0-9-]+)/history", "history"),
    ("GET", r"pack/(?P<id>[a-z0-9-]+)/stats", "stats"),
    ("GET", r"pack/(?P<id>[a-z0-9-]+)/card-requests", "card_requests"),
    ("POST", r"pack/(?P<id>[a-z0-9-]+)/card-requests", "request_card"),
    ("POST", r"pack/(?P<id>[a-z0-9-]+)/card-requests/(?P<n>\d+)", "answer_card_request"),
    ("GET", r"users", "list_users"),
    ("POST", r"users", "create_user"),
    ("POST", r"users/(?P<n>\d+)/reset", "reset_user"),
    ("POST", r"users/(?P<n>\d+)/disable", "disable_user"),
    ("POST", r"users/(?P<n>\d+)/enable", "enable_user"),
]
TEXT_FIELDS = {"email", "password", "code", "current", "new", "token", "text", "note", "decision", "status", "name", "role",
               "institution", "id", "short", "type", "province", "licenceTier", "licenceExpires"}
OPEN = {"login", "reset_request", "reset_confirm"}                    # no session needed
SETUP = {"me", "logout", "password", "two_step_begin", "two_step_confirm"}  # allowed before setup is finished


def limited(key, limit):
    now = time.time()
    recent = [t for t in _hits.get(key, []) if now - t < 60]
    recent.append(now)
    _hits[key] = recent
    return len(recent) > limit


def cookie_header(token, secure, clear=False):
    parts = [f"{COOKIE}={'' if clear else token}", "Path=/portal", "HttpOnly", "SameSite=Strict",
             "Max-Age=0" if clear else f"Max-Age={8 * 3600}"]
    if secure:
        parts.append("Secure")
    return "; ".join(parts)


def handle(portal, method, path, headers, data, ip, secure=True, stats=None):
    """Returns (status, body, set_cookie or None)."""
    sub = path.split("/portal/api/", 1)[1].strip("/")
    for verb, pattern, name in ROUTES:
        match = re.fullmatch(pattern, sub)
        if match and verb == method:
            break
    else:
        return 404, {"error": "Not found."}, None

    if limited((ip, name in OPEN), LOGIN_LIMIT if name in OPEN else WRITE_LIMIT):
        return 429, {"error": "Too many requests. Wait a minute and try again."}, None

    jar = SimpleCookie(headers.get("Cookie") or "")
    token = jar[COOKIE].value if COOKIE in jar else None
    data = data if isinstance(data, dict) else {}
    # Fields that are always text: a list or an object in their place ({"$ne": 1}, say) is refused
    # here, rather than reaching code that expects text.
    if any(k in TEXT_FIELDS and v is not None and not isinstance(v, str) for k, v in data.items()):
        return 400, {"error": "That request is not valid."}, None
    try:
        if name == "login":
            token, info = portal.login(data.get("email"), data.get("password"), data.get("code"), ip)
            if token is None:
                raise info
            return 200, info, cookie_header(token, secure)
        if name == "reset_request":
            return 200, portal.request_reset(data.get("email"), ip), None
        if name == "reset_confirm":
            return 200, portal.redeem_link(data.get("token"), data.get("password"), ip), None

        user = portal.session(token)
        if not user:
            return 401, {"error": "Please sign in."}, None
        # Cookies are sent automatically, so anything that changes data must also carry the session's token.
        if method != "GET" and headers.get("X-CSRF-Token") != user["csrf"]:
            return 403, {"error": "This request could not be verified. Reload the page and try again."}, None
        if name not in SETUP:
            portal.ready(user)

        inst = match.groupdict().get("id")
        number = int(match.group("n")) if "n" in match.groupdict() and match.group("n") else None
        if name == "logout":
            portal.logout(token)
            return 200, {"ok": True}, cookie_header("", secure, clear=True)
        body = {
            "me": lambda: portal.me(user),
            "password": lambda: portal.change_password(user, data.get("current"), data.get("new"), ip),
            "two_step_begin": lambda: portal.two_step_begin(user),
            "two_step_confirm": lambda: portal.two_step_confirm(user, data.get("code"), token, ip),
            "catalogue": portal.catalogue,
            "institutions": lambda: portal.institutions(user),
            "create_institution": lambda: portal.create_institution(user, data, ip),
            "get_pack": lambda: portal.get_pack(user, inst),
            "save": lambda: portal.save(user, inst, data.get("pack"), data.get("rev"), ip),
            "check": lambda: portal.run_check(user, inst),
            "submit": lambda: portal.submit(user, inst, ip),
            "review": lambda: portal.review(user, inst, data.get("decision"), data.get("note") or "", ip),
            "rollback": lambda: portal.rollback(user, inst, data.get("version"), ip),
            "licence": lambda: portal.set_licence(user, inst, data, ip),
            "history": lambda: portal.history(user, inst),
            "stats": lambda: institution_stats(portal, user, inst, stats),
            "card_requests": lambda: portal.card_requests(user, inst),
            "request_card": lambda: portal.request_card(user, inst, data.get("text"), ip),
            "answer_card_request": lambda: portal.answer_card_request(user, inst, number, data.get("status"), ip),
            "list_users": lambda: portal.list_users(user),
            "create_user": lambda: portal.create_user(user, data.get("email"), data.get("name"), data.get("role"), data.get("institution"), ip),
            "reset_user": lambda: portal.reset_user(user, number, ip=ip),
            "disable_user": lambda: portal.reset_user(user, number, disable=True, ip=ip),
            "enable_user": lambda: portal.reset_user(user, number, disable=False, ip=ip),
        }[name]()
        return 200, body, None
    except PortalError as e:
        return e.status, e.body, None


def institution_stats(portal, user, institution_id, stats):
    """An institution's own anonymous numbers. Staff only ever get their own."""
    portal._scope(user, institution_id)
    return stats(institution_id) if stats else {"students": 0, "completions": 0, "byChapter": {}, "feedback": {}}
