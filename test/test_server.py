"""Tests for the public server (serve.py): what it serves, and the completion counts.

Run: python -m unittest discover -s test -p "test_*.py"
"""

import http.client
import json
import shutil
import sys
import tempfile
import threading
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import serve  # noqa: E402

DEVICE = "test-device-0001"


class ServerCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp())
        cls.real_db = serve.STATS_DB
        serve.STATS_DB = cls.tmp / "stats.db"  # never the real counts
        serve.Handler.log_message = lambda *args: None  # keep the test output readable
        cls.httpd = serve.Server(("127.0.0.1", 0), serve.Handler)
        cls.port = cls.httpd.server_address[1]
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        serve.STATS_DB = cls.real_db
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def setUp(self):
        serve._hits.clear()

    def request(self, method, path, body=None, headers=None):
        con = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        data = json.dumps(body).encode("utf-8") if body is not None else None
        con.request(method, path, body=data, headers={"Content-Type": "application/json", **(headers or {})} if data else (headers or {}))
        res = con.getresponse()
        raw = res.read()
        con.close()
        return res.status, raw

    def post_stats(self, **fields):
        return self.request("POST", "/stats", {"device_id": DEVICE, "chapter": "first_term", "completed": True, **fields})


class StaticFiles(ServerCase):
    def test_the_app_and_the_portal_are_served(self):
        for path in ("/", "/index.html", "/sw.js", "/manifest.webmanifest", "/js/main.js", "/css/app.css",
                     "/content/core.json", "/i18n/en.json", "/icons/icon.svg", "/portal/", "/portal/portal.js"):
            self.assertEqual(self.request("GET", path)[0], 200, path)

    def test_nothing_else_in_the_repository_can_be_fetched(self):
        (ROOT / "data").mkdir(exist_ok=True)
        probe = ROOT / "data" / "probe-for-tests.txt"
        probe.write_text("private", encoding="utf-8")
        try:
            private = ["/data/probe-for-tests.txt", "/serve.py", "/server/auth.py", "/tools/pack-check.mjs", "/test/test_server.py",
                       "/README.md", "/docs/risks.md", "/package.json", "/intake/README.md", "/.gitignore", "/.git/config"]
            # The same files, spelled the ways that used to get past the check.
            tricks = ["/Data/probe-for-tests.txt", "/DATA/probe-for-tests.txt", "/%64ata/probe-for-tests.txt",
                      "/js/../data/probe-for-tests.txt", "/js/%2e%2e/data/probe-for-tests.txt", "//data/probe-for-tests.txt",
                      "/Serve.py", "/%73erve.py", "/SERVER/auth.py"]
            for path in private + tricks:
                for method in ("GET", "HEAD"):
                    status, raw = self.request(method, path)
                    self.assertEqual(status, 404, f"{method} {path}")
                    self.assertNotIn(b"private", raw)
        finally:
            probe.unlink()


class PublicApi(ServerCase):
    def test_institutions_lists_each_one_with_its_version(self):
        status, raw = self.request("GET", "/institutions")
        info = json.loads(raw)
        self.assertEqual(status, 200)
        self.assertEqual(info["features"], {"stats": True})
        self.assertTrue(all(i["version"] > 0 for i in info["institutions"]))
        status, raw = self.request("GET", "/packs/sizwe")
        self.assertEqual(json.loads(raw)["version"], next(i["version"] for i in info["institutions"] if i["id"] == "sizwe"),
                         "the short list tells a phone whether it already has the latest pack")
        self.assertEqual(self.request("GET", "/packs/nowhere")[0], 404)

    def test_a_completion_is_counted_once_per_device_and_chapter(self):
        before = json.loads(self.request("GET", "/stats")[1])["completions"]
        for _ in range(3):  # the app sends again until the server answers
            self.assertEqual(self.post_stats(institution="sizwe")[0], 200)
        after = json.loads(self.request("GET", "/stats")[1])
        self.assertEqual(after["completions"], before + 1)
        self.assertEqual(json.loads(self.request("GET", "/stats?institution=sizwe")[1])["students"], 1)

    def test_malformed_and_cross_site_posts_are_refused(self):
        self.assertEqual(self.post_stats(chapter="not-a-chapter")[0], 400)
        self.assertEqual(self.post_stats(device_id="x")[0], 400)
        self.assertEqual(self.post_stats(name="A Student")[0], 400, "no field beyond the schema is accepted")
        self.assertEqual(self.post_stats(institution="nowhere")[0], 400)
        self.assertEqual(self.post_stats(feedback={"learned": "perhaps"})[0], 400)
        status, _ = self.request("POST", "/stats", {"device_id": DEVICE, "chapter": "first_term", "completed": True},
                                 headers={"Origin": "https://elsewhere.example"})
        self.assertEqual(status, 403)
        self.assertEqual(self.request("POST", "/plan", {"lang": "en"})[0], 404, "there is no AI endpoint")

    def test_one_device_is_limited_but_a_shared_address_is_not(self):
        # A lecture hall on campus Wi-Fi: many devices, one address.
        for n in range(40):
            self.assertEqual(self.post_stats(device_id=f"hall-device-{n:04d}")[0], 200)
        # One device posting over and over is stopped.
        answers = [self.post_stats(device_id="noisy-device-0001")[0] for _ in range(serve.DEVICE_LIMIT + 2)]
        self.assertEqual(answers[-1], 429)


if __name__ == "__main__":
    unittest.main()
