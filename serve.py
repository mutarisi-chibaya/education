"""Local server for University Simulator.

Serves the static app, plus the small API from the build spec (section 11).
The app works fully offline without it: packs are bundled, and every call
falls back quietly.

    GET  /institutions         available versions (sizwe, general) and features
    GET  /packs/{institution}  latest content pack (JSON) with its version
    POST /stats                anonymous completion counts
                               {device_id (random), institution, chapter, completed, feedback?}
    GET  /stats                summary of those counts (real numbers only);
                               add ?institution=<id> for one institution's numbers
    POST /plan                 AI writes the Semester Forecast in natural language
                               (needs the `anthropic` package and an API key,
                               which stays on the server)
    /portal/                   the staff portal: institutions edit their own pack
    /portal/api/...            its API (see server/web.py). Accounts are created
                               with `python -m server.admin`.

Security (spec section 12): public endpoints are read-only except /stats and
/plan; /stats validates its schema, is rate-limited, de-duplicates by the
random device id and only accepts cross-origin posts from FYS_APP_ORIGIN.
Deploy behind HTTPS.

Usage:
    python serve.py            # http://localhost:8080
    python serve.py 3000       # custom port

Turn on the AI plan by installing requirements and setting a key:
    pip install -r requirements.txt
    set ANTHROPIC_API_KEY=...      (PowerShell: $env:ANTHROPIC_API_KEY="...")

Service workers (offline mode) only run on localhost or HTTPS, so open the
game via http://localhost, not a LAN IP or file:// URL.
"""

import datetime
import http.server
import json
import os
import re
import socketserver
import sqlite3
import sys
import threading
import time
import urllib.parse
from pathlib import Path

from server import mailer as portal_mailer
from server import web as portal_web
from server.portal import Portal, node_check

try:
    import anthropic
except ImportError:  # the AI plan is optional
    anthropic = None

ROOT = Path(__file__).resolve().parent
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
CONTENT = ROOT / "content"
STATS_DB = ROOT / "data" / "stats.db"
MAX_BODY = 16 * 1024
# The only other origin allowed to call the API (e.g. https://firstyearsim.example).
# Same-origin requests need no CORS header at all.
APP_ORIGIN = os.environ.get("FYS_APP_ORIGIN", "")
PRIVATE_DIRS = {"data", "__pycache__", "test", "tools", "server", "intake"}
RATE_LIMIT = 30  # write requests per client per minute
ROUTE = re.compile(r"(?:^|/)(institutions|stats|plan|packs/([a-z0-9_-]{1,40}))$")
DEVICE_ID = re.compile(r"^[A-Za-z0-9-]{8,64}$")
FEEDBACK = {"realistic": {"yes", "partly", "no"}, "learned": {"yes", "no"}, "recommend": {"yes", "maybe", "no"}}
MODEL = "claude-opus-5-5"

LANGUAGES = {"en": "English", "zu": "isiZulu", "xh": "isiXhosa", "af": "Afrikaans", "nso": "Sepedi", "tn": "Setswana", "st": "Sesotho"}
SYSTEM_PROMPT = """You write the closing "Semester Forecast" for University Simulator, a game \
that lets South African students rehearse university life, from first year to graduation.

Write directly to the student ("you"), warmly and without judgement: the goal is confidence, \
not fear. Sending money home has no single right answer, and needing help is normal.

Use only the facts in the forecast data you are given: the risk weeks and their causes, the \
coping pattern, the plan steps, and the named services and phone numbers. Never invent \
services, phone numbers, amounts or rules.

Write 90 to 130 words of plain text in {language}: no headings, no markdown, no lists. \
Start with the riskiest weeks and why, describe the coping pattern kindly, then give the \
plan steps as concrete actions with their week numbers. End with one encouraging sentence."""

# Two-step login is on unless PORTAL_MFA=off (for a local demo only). The session
# cookie is marked Secure unless PORTAL_INSECURE_COOKIE=1 (plain http on a LAN).
PORTAL_MFA = os.environ.get("PORTAL_MFA", "on") != "off"
PORTAL_SECURE_COOKIE = os.environ.get("PORTAL_INSECURE_COOKIE") != "1"
_portal = None


def portal():
    global _portal
    if _portal is None:
        # Email goes through SMTP when SMTP_HOST is set; otherwise to data/outbox/ (see server/mailer.py).
        _portal = Portal(ROOT / "data" / "portal.db", CONTENT, node_check(ROOT), mfa=PORTAL_MFA,
                         mailer=portal_mailer.from_env(ROOT), base_url=os.environ.get("PORTAL_URL", f"http://localhost:{PORT}"))
    return _portal


_stats_lock = threading.Lock()
_hits = {}


def ai_enabled():
    has_credentials = bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))
    return anthropic is not None and (has_credentials or os.environ.get("FYS_AI_ENABLED") == "1")


_client = None


def ai_client():
    global _client
    if _client is None:
        _client = anthropic.Anthropic(timeout=25.0, max_retries=1)
    return _client


def write_plan(payload):
    """Return AI-written forecast text, or None so the app keeps its template."""
    language = LANGUAGES.get(payload.get("lang"), "English")
    try:
        response = ai_client().beta.messages.create(
            model=MODEL,
            max_tokens=4000,
            # Short, low-stakes writing: low effort keeps it fast and cheap.
            output_config={"effort": "low"},
            # If a safety classifier declines, the API retries on Anthropic's
            # recommended fallback model instead of returning the refusal.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            system=SYSTEM_PROMPT.format(language=language),
            messages=[{"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
        )
    except anthropic.RateLimitError:
        print("AI plan: rate limited, using template")
        return None
    except anthropic.APIStatusError as e:
        print(f"AI plan: API error {e.status_code}, using template")
        return None
    except anthropic.APIConnectionError:
        print("AI plan: no connection, using template")
        return None
    except anthropic.AnthropicError as e:  # e.g. no credentials configured
        print(f"AI plan: {e.__class__.__name__}, using template")
        return None

    if response.stop_reason == "refusal":
        return None
    text = "".join(block.text for block in response.content if block.type == "text").strip()
    return text or None


def clean_plan_payload(data):
    """Keep only the anonymous forecast fields the prompt needs."""
    keys = ["lang", "institution", "course", "housing", "funding", "incomeBand", "chapter", "nextChapter", "riskWeeks",
            "copingStyle", "copingCounts", "moneyRunsOutIfLate", "moneyRunsOutOnTime", "allowanceWeeksLate",
            "spendingLeaksPerMonth", "emergencyBufferTarget", "plan", "services"]
    return {k: data.get(k) for k in keys}


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def directory():
    """The short list of institutions: one entry each, never the full packs."""
    return load(CONTENT / "institutions" / "index.json")


def institution_ids():
    return [d["id"] for d in directory()]


def list_institutions():
    core_version = load(CONTENT / "core.json").get("version", 0)
    today = datetime.date.today().isoformat()
    out = []
    for d in directory():
        expires = (d.get("licence") or {}).get("expires")
        out.append({**d, "version": core_version * 1000 + d.get("version", 0), "active": not expires or expires >= today})
    return out


# Packs are assembled from files; keep each one until a file it is built from changes.
_pack_cache = {}


def pack_stamp(inst_id):
    files = [CONTENT / "core.json", CONTENT / "institutions" / f"{inst_id}.json", CONTENT / "chapters" / "index.json"]
    files += sorted((CONTENT / "chapters").glob("*.json"))
    return max(f.stat().st_mtime for f in files)


def cached_pack(inst_id):
    if inst_id not in institution_ids():  # also keeps the id from reaching the filesystem unchecked
        return None
    stamp = pack_stamp(inst_id)
    hit = _pack_cache.get(inst_id)
    if not hit or hit[0] != stamp:
        _pack_cache[inst_id] = (stamp, build_pack(inst_id))
    return _pack_cache[inst_id][1]


def build_pack(inst_id):
    """One content pack per institution (spec section 5), or None if unknown."""
    core = load(CONTENT / "core.json")
    inst = load(CONTENT / "institutions" / f"{inst_id}.json")
    index = load(CONTENT / "chapters" / "index.json")
    chapters = [load(CONTENT / "chapters" / f"{c['id']}.json") for c in index if c.get("status") == "built"]

    cards = [dict(e, chapter=None) for e in core["events"]]
    minis = [dict(m, chapter=None) for m in core.get("minis", [])]
    for ch in chapters:
        cards += [dict(e, chapter=ch["id"]) for e in ch["events"]]
        minis += [dict(m, chapter=ch["id"]) for m in ch.get("minis", [])]
    tips = [{"card": c["id"], "choice": ch["id"], "text": ch["tip"]}
            for c in cards for ch in c.get("choices", []) if ch.get("tip")]
    support = []
    for sid, base in core["support"].items():
        own = inst.get("support", {}).get(sid, {})
        card = {**base, **own, "id": sid, "contacts": own.get("contacts", []) + base.get("contacts", [])}
        if card.get("tip"):
            tips.append({"support": sid, "text": card["tip"]})
        support.append(card)
    return {
        "institution": inst["id"],
        "version": core.get("version", 0) * 1000 + inst.get("version", 0),
        "name": inst["name"],
        "costs": inst.get("costs", {}),
        "support": support,
        "cards": cards,
        "minis": minis,
        "tips": tips,
        # The authoring files the app rebuilds its pack from.
        "source": {"core": core, "institution": inst, "chapterIndex": index, "chapters": chapters},
    }


def chapter_ids():
    return {c["id"] for c in load(CONTENT / "chapters" / "index.json")}


def clean_stats(data):
    """Validate a /stats post against its schema. Returns a record, or None."""
    device = data.get("device_id")
    chapter = data.get("chapter")
    if not isinstance(device, str) or not DEVICE_ID.match(device):
        return None
    if chapter not in chapter_ids() or not isinstance(data.get("completed"), bool):
        return None
    if set(data) - {"device_id", "institution", "chapter", "completed", "feedback"}:
        return None
    institution = data.get("institution")
    if institution is not None and institution not in institution_ids():
        return None
    feedback = data.get("feedback")
    if feedback is not None:
        if not isinstance(feedback, dict) or not feedback:
            return None
        if any(k not in FEEDBACK or v not in FEEDBACK[k] for k, v in feedback.items()):
            return None
    return {"date": datetime.date.today().isoformat(), "device_id": device, "institution": institution, "chapter": chapter,
            "completed": data["completed"], "feedback": feedback}


def stats_db():
    """One row per device and chapter, in SQLite: safe with many writers and quick to count."""
    STATS_DB.parent.mkdir(exist_ok=True)
    con = sqlite3.connect(STATS_DB, timeout=5)
    con.execute("""CREATE TABLE IF NOT EXISTS completions (
        device_id TEXT NOT NULL, chapter TEXT NOT NULL, institution TEXT, date TEXT NOT NULL, feedback TEXT,
        PRIMARY KEY (device_id, chapter))""")
    con.execute("CREATE INDEX IF NOT EXISTS by_institution ON completions (institution)")
    return con


def save_stats(record):
    """A repeat from the same device only adds feedback that was missing."""
    if not record["completed"]:
        return
    feedback = json.dumps(record["feedback"]) if record["feedback"] else None
    con = stats_db()
    try:
        with con:
            con.execute(
                """INSERT INTO completions (device_id, chapter, institution, date, feedback) VALUES (?, ?, ?, ?, ?)
                   ON CONFLICT (device_id, chapter) DO UPDATE SET
                     feedback = COALESCE(completions.feedback, excluded.feedback),
                     institution = COALESCE(completions.institution, excluded.institution)""",
                (record["device_id"], record["chapter"], record["institution"], record["date"], feedback))
    finally:
        con.close()


def stats_summary(institution=None):
    where, args = ("WHERE institution = ?", (institution,)) if institution else ("", ())
    con = stats_db()
    try:
        students = con.execute(f"SELECT COUNT(DISTINCT device_id) FROM completions {where}", args).fetchone()[0]
        by_chapter = dict(con.execute(f"SELECT chapter, COUNT(*) FROM completions {where} GROUP BY chapter", args).fetchall())
        by_institution = dict(con.execute(
            "SELECT institution, COUNT(DISTINCT device_id) FROM completions WHERE institution IS NOT NULL GROUP BY institution").fetchall())
        answers = {q: {} for q in FEEDBACK}
        clause = f"{where} {'AND' if where else 'WHERE'} feedback IS NOT NULL"
        for (raw,) in con.execute(f"SELECT feedback FROM completions {clause}", args):
            for q, a in json.loads(raw).items():
                answers[q][a] = answers[q].get(a, 0) + 1
    finally:
        con.close()
    out = {"students": students, "completions": sum(by_chapter.values()), "byChapter": by_chapter, "feedback": answers}
    if not institution:
        out["studentsByInstitution"] = by_institution
    return out


def rate_limited(client):
    now = time.time()
    with _stats_lock:
        recent = [t for t in _hits.get(client, []) if now - t < 60]
        recent.append(now)
        _hits[client] = recent
        return len(recent) > RATE_LIMIT


class Handler(http.server.SimpleHTTPRequestHandler):
    # Python's defaults miss or vary for some of these, which breaks ES modules
    # and the PWA manifest on some systems (notably Windows registry MIME types).
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".mjs": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".webmanifest": "application/manifest+json",
        ".svg": "image/svg+xml",
        ".png": "image/png",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        # Always revalidate so edits show up; the service worker handles offline caching.
        # The staff portal is never cached at all.
        self.send_header("Cache-Control", "no-store" if "/portal/" in self.path else "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        if "/portal/" in self.path:
            # The portal runs only its own scripts, cannot be framed, and is never cached.
            self.send_header("Content-Security-Policy", "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
            self.send_header("X-Frame-Options", "DENY")
        origin = self.headers.get("Origin")
        if APP_ORIGIN and origin == APP_ORIGIN:
            self.send_header("Access-Control-Allow-Origin", APP_ORIGIN)
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Vary", "Origin")
        super().end_headers()

    def cross_origin_blocked(self):
        """Browsers send Origin on cross-site posts; only the app's own domain may write."""
        origin = self.headers.get("Origin")
        if not origin:
            return False
        own = {f"http://{self.headers.get('Host')}", f"https://{self.headers.get('Host')}"}
        return origin not in own and origin != APP_ORIGIN

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def send_json(self, status, body, cookie=None):
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(data)

    def portal_api(self, method):
        """Everything under /portal/api/: the staff portal."""
        length = int(self.headers.get("Content-Length") or 0)
        if length > 512 * 1024:
            return self.send_json(413, {"error": "That is too large."})
        data = {}
        if length:
            try:
                data = json.loads(self.rfile.read(length))
            except (ValueError, UnicodeDecodeError):
                return self.send_json(400, {"error": "invalid JSON"})
        if method != "GET" and self.cross_origin_blocked():
            return self.send_json(403, {"error": "origin not allowed"})
        status, body, cookie = portal_web.handle(portal(), method, self.path.split("?")[0], self.headers, data,
                                                 self.client_address[0], secure=PORTAL_SECURE_COOKIE, stats=stats_summary)
        return self.send_json(status, body, cookie)

    def do_PUT(self):
        if "/portal/api/" in self.path:
            return self.portal_api("PUT")
        return self.send_json(404, {"error": "not found"})

    def read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        if not 0 < length <= MAX_BODY:
            return None
        try:
            return json.loads(self.rfile.read(length))
        except (ValueError, UnicodeDecodeError):
            return None

    def do_GET(self):
        path = self.path.split("?")[0]
        if "/portal/api/" in path:
            return self.portal_api("GET")
        route = ROUTE.search(path)
        if not route:
            # Never serve stored stats, the virtualenv or server code as static files.
            first = path.lstrip("/").split("/")[0]
            if first in PRIVATE_DIRS or first.startswith(".") or path.endswith(".py"):
                return self.send_json(404, {"error": "not found"})
            return super().do_GET()
        name = route.group(1)
        if name == "institutions":
            return self.send_json(200, {"institutions": list_institutions(), "features": {"ai": ai_enabled(), "stats": True}})
        if name == "stats":
            wanted = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get("institution", [None])[0]
            if wanted is not None and wanted not in institution_ids():
                return self.send_json(404, {"error": "unknown institution"})
            return self.send_json(200, stats_summary(wanted))
        if name.startswith("packs/"):
            pack = cached_pack(route.group(2))
            return self.send_json(200, pack) if pack else self.send_json(404, {"error": "unknown institution"})
        return self.send_json(405, {"error": "use POST"})

    def do_POST(self):
        if "/portal/api/" in self.path:
            return self.portal_api("POST")
        route = ROUTE.search(self.path.split("?")[0])
        name = route.group(1) if route else None
        if name not in ("stats", "plan"):
            return self.send_json(404, {"error": "not found"})
        if self.cross_origin_blocked():
            return self.send_json(403, {"error": "origin not allowed"})
        if rate_limited(self.client_address[0]):
            return self.send_json(429, {"error": "too many requests"})
        data = self.read_json()
        if data is None or not isinstance(data, dict):
            return self.send_json(400, {"error": "invalid JSON"})
        if name == "plan":
            if not ai_enabled():
                return self.send_json(503, {"error": "AI plan is not configured"})
            try:
                text = write_plan(clean_plan_payload(data))
            except Exception as e:  # e.g. no credentials found; the app keeps its template
                print(f"AI plan unavailable: {e}")
                text = None
            return self.send_json(200, {"text": text}) if text else self.send_json(502, {"error": "no plan"})
        record = clean_stats(data)
        if record is None:
            return self.send_json(400, {"error": "invalid stats"})
        save_stats(record)
        return self.send_json(200, {"ok": True})


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    # On Windows, SO_REUSEADDR lets a second server silently share a busy
    # port; leave it off there so "port in use" fails loudly instead.
    allow_reuse_address = os.name != "nt"


def open_server(port, tries=10):
    """Bind to the port, or the next free one if it's taken (e.g. an old server still running)."""
    for p in range(port, port + tries):
        try:
            return Server(("", p), Handler), p
        except OSError:
            print(f"Port {p} is busy (is another copy of serve.py still running?), trying {p + 1}...")
    sys.exit(f"No free port between {port} and {port + tries - 1}. Close the other server and try again.")


if __name__ == "__main__":
    server, port = open_server(PORT)
    with server as httpd:
        print(f"University Simulator -> http://localhost:{port}  (Ctrl+C to stop)")
        print(f"  AI-written plan: {'on' if ai_enabled() else 'off (template plan; see serve.py docstring)'}")
        print(f"  Completion stats: http://localhost:{port}/stats")
        print(f"  Staff portal:     http://localhost:{port}/portal/  (two-step login {'on' if PORTAL_MFA else 'OFF: demo only'})")
        print(f"  Portal email:     {'SMTP via ' + os.environ['SMTP_HOST'] if os.environ.get('SMTP_HOST') else 'data/outbox/ (no mail server set; links are shown on screen)'}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")
