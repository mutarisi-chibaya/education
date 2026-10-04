"""Command-line administration for the staff portal.

    python -m server.admin create-admin <email> "<name>"      the first platform admin
    python -m server.admin demo                               demo accounts for the two demo universities
    python -m server.admin audit [institution]                print the audit log
    python -m server.admin backup                             copy the databases to data/backups/

Passwords are generated and printed once. Each person chooses their own at
first login and sets up two-step login.
"""

import datetime
import sqlite3
import sys
from pathlib import Path

from . import db
from .portal import Portal, PortalError, node_check

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "portal.db"


def portal():
    return Portal(DB, ROOT / "content", node_check(ROOT))


def create(p, email, name, role, institution=None):
    try:
        made = p.create_user(None, email, name, role, institution)
        print(f"  {role:8} {email:34} temporary password: {made['temporaryPassword']}")
    except PortalError as e:
        print(f"  {role:8} {email:34} not created: {e}")


def main(argv):
    if len(argv) >= 3 and argv[0] == "create-admin":
        create(portal(), argv[1], argv[2], "admin")
    elif argv[:1] == ["demo"]:
        p = portal()
        print("Demo accounts (each must choose a new password at first login):")
        create(p, "admin@unisim.example", "Platform Admin", "admin")
        for inst, label in (("sizwe", "Sizwe"), ("karoo-coast", "Karoo Coast")):
            create(p, f"editor@{inst.replace('-', '')}.example", f"{label} Editor", "editor", inst)
            create(p, f"reviewer@{inst.replace('-', '')}.example", f"{label} Reviewer", "reviewer", inst)
    elif argv[:1] == ["audit"]:
        portal()
        con = db.connect(DB)
        where, args = ("WHERE institution_id = ?", (argv[1],)) if len(argv) > 1 else ("", ())
        for r in con.execute(f"SELECT * FROM audit {where} ORDER BY id", args):
            when = datetime.datetime.fromtimestamp(r["at"]).strftime("%Y-%m-%d %H:%M")
            print(f"{when}  {r['user_email'] or '-':30} {r['institution_id'] or '-':14} {r['action']:20} {r['detail'] or ''}")
        con.close()
    elif argv[:1] == ["backup"]:
        # SQLite's own backup copies a database safely while the server is running.
        folder = ROOT / "data" / "backups" / datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
        folder.mkdir(parents=True)
        for name in ("portal.db", "stats.db"):
            source = ROOT / "data" / name
            if source.exists():
                src, dst = sqlite3.connect(source), sqlite3.connect(folder / name)
                src.backup(dst)
                src.close()
                dst.close()
                print(f"  {name} -> {folder / name}")
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
