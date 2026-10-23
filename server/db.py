"""The staff portal's database.

SQLite in WAL mode: one file, safe with several readers and a writer, and
enough for a pilot. Every query goes through `connect()`, and the schema is
plain SQL with numbered migrations, so moving to a hosted database later
means replacing this module, not the code that calls it.
"""

import sqlite3

MIGRATIONS = [
    # 1: accounts, sessions, drafts, published versions and the audit log
    """
    CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'reviewer')),
        institution_id TEXT,
        pw_hash TEXT NOT NULL,
        pw_salt TEXT NOT NULL,
        must_change INTEGER NOT NULL DEFAULT 1,
        totp_secret TEXT,
        totp_enabled INTEGER NOT NULL DEFAULT 0,
        failed INTEGER NOT NULL DEFAULT 0,
        locked_until REAL NOT NULL DEFAULT 0,
        disabled INTEGER NOT NULL DEFAULT 0,
        created_at REAL NOT NULL
    );
    CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        csrf TEXT NOT NULL,
        mfa_ok INTEGER NOT NULL DEFAULT 0,
        created_at REAL NOT NULL,
        expires_at REAL NOT NULL
    );
    CREATE TABLE packs (
        institution_id TEXT PRIMARY KEY,
        draft TEXT NOT NULL,
        rev INTEGER NOT NULL DEFAULT 1,
        state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'submitted')),
        updated_by INTEGER REFERENCES users (id),
        updated_at REAL,
        submitted_by INTEGER REFERENCES users (id),
        submitted_at REAL,
        review_note TEXT
    );
    CREATE TABLE versions (
        institution_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        pack TEXT NOT NULL,
        submitted_by TEXT,
        approved_by TEXT,
        published_at REAL NOT NULL,
        PRIMARY KEY (institution_id, version)
    );
    CREATE TABLE audit (
        id INTEGER PRIMARY KEY,
        at REAL NOT NULL,
        user_email TEXT,
        institution_id TEXT,
        action TEXT NOT NULL,
        detail TEXT,
        ip TEXT
    );
    CREATE INDEX audit_by_institution ON audit (institution_id, id);
    CREATE INDEX sessions_by_user ON sessions (user_id);
    -- The audit log is append-only: no row is ever changed or removed.
    CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT, 'the audit log cannot be changed'); END;
    CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT, 'the audit log cannot be changed'); END;
    """,
    # 2: single-use links for invitations and password resets
    """
    CREATE TABLE tokens (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        purpose TEXT NOT NULL CHECK (purpose IN ('invite', 'reset')),
        expires_at REAL NOT NULL,
        used INTEGER NOT NULL DEFAULT 0
    );
    """,
    # 3: a locked account stays locked until its password is reset, so the timed lock goes
    """
    ALTER TABLE users DROP COLUMN locked_until;
    """,
    # 4: single-use backup codes for two-step login
    """
    CREATE TABLE recovery_codes (
        user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        code_hash TEXT NOT NULL,
        used INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, code_hash)
    );
    """,
    # 5: a read-only viewer role, for judges and demos. SQLite can't change a CHECK, so the
    #    table is rebuilt (with foreign keys off, see migrate) and every row is kept.
    """
    CREATE TABLE users_new (
        id INTEGER PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'reviewer', 'viewer')),
        institution_id TEXT,
        pw_hash TEXT NOT NULL,
        pw_salt TEXT NOT NULL,
        must_change INTEGER NOT NULL DEFAULT 1,
        totp_secret TEXT,
        totp_enabled INTEGER NOT NULL DEFAULT 0,
        failed INTEGER NOT NULL DEFAULT 0,
        disabled INTEGER NOT NULL DEFAULT 0,
        created_at REAL NOT NULL
    );
    INSERT INTO users_new (id, email, name, role, institution_id, pw_hash, pw_salt, must_change, totp_secret, totp_enabled, failed, disabled, created_at)
        SELECT id, email, name, role, institution_id, pw_hash, pw_salt, must_change, totp_secret, totp_enabled, failed, disabled, created_at FROM users;
    DROP TABLE users;
    ALTER TABLE users_new RENAME TO users;
    """,
    # 6: an institution asks our team for a card of its own (only we write cards)
    """
    CREATE TABLE card_requests (
        id INTEGER PRIMARY KEY,
        institution_id TEXT NOT NULL,
        user_email TEXT NOT NULL,
        text TEXT NOT NULL,
        at REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'declined')),
        answered_by TEXT,
        answered_at REAL
    );
    CREATE INDEX card_requests_by_institution ON card_requests (institution_id, id);
    """,
]


def connect(path):
    con = sqlite3.connect(path, timeout=10)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    con.execute("PRAGMA journal_mode = WAL")
    return con


def migrate(path):
    """Bring the database up to the latest schema. Safe to run on every start."""
    con = connect(path)
    try:
        done = con.execute("PRAGMA user_version").fetchone()[0]
        # A migration may rebuild a table others point to: with foreign keys on, dropping
        # the old table would delete every session and code that refers to it.
        con.execute("PRAGMA foreign_keys = OFF")
        for number, sql in enumerate(MIGRATIONS, start=1):
            if number > done:
                con.executescript(f"BEGIN; {sql} PRAGMA user_version = {number}; COMMIT;")
        broken = con.execute("PRAGMA foreign_key_check").fetchall()
        if broken:
            raise RuntimeError(f"database migration left {len(broken)} broken references")
    finally:
        con.close()
