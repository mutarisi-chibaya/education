"""Passwords, one-time codes and tokens for the staff portal. Standard library only."""

import base64
import hashlib
import hmac
import secrets
import struct
import time

# scrypt parameters: about 16 MB and tens of milliseconds per check.
SCRYPT = {"n": 2 ** 14, "r": 8, "p": 1, "dklen": 32}
MIN_PASSWORD = 12
TOTP_STEP = 30


def hash_password(password, salt=None):
    """Return (hash_hex, salt_hex)."""
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, **SCRYPT)
    return digest.hex(), salt.hex()


def verify_password(password, hash_hex, salt_hex):
    digest, _ = hash_password(password, bytes.fromhex(salt_hex))
    return hmac.compare_digest(digest, hash_hex)


def password_problem(password):
    """None if the password is acceptable, else what is wrong with it."""
    if len(password) < MIN_PASSWORD:
        return f"Use at least {MIN_PASSWORD} characters."
    if password.lower() in {"password1234", "123456789012", "qwertyuiopas"} or len(set(password)) < 5:
        return "That password is too easy to guess."
    return None


def new_password():
    """A temporary password for a new account; the user must change it at first login."""
    return secrets.token_urlsafe(12)


def new_token():
    return secrets.token_urlsafe(32)


def token_hash(token):
    """Only the hash of a session token is stored, so a copied database cannot be used to log in."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


# ---- backup codes: single-use, for signing in when the authenticator app is out of reach ----

CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no 0/O or 1/I/L, so a code can be copied from paper


def new_recovery_codes(count=8):
    return ["-".join("".join(secrets.choice(CODE_ALPHABET) for _ in range(5)) for _ in range(2)) for _ in range(count)]


def recovery_hash(code):
    """Stored like session tokens: only as a hash. Spaces and lower case in what was typed are forgiven."""
    return token_hash("".join((code or "").split()).upper())


# ---- time-based one-time codes (RFC 6238), as used by authenticator apps ----

def new_totp_secret():
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii")


def totp(secret, at=None):
    counter = int((at if at is not None else time.time()) // TOTP_STEP)
    mac = hmac.new(base64.b32decode(secret), struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = mac[-1] & 0x0F
    code = (struct.unpack(">I", mac[offset:offset + 4])[0] & 0x7FFFFFFF) % 1_000_000
    return f"{code:06d}"


def verify_totp(secret, code, at=None):
    """Accept the current code and the ones either side, to allow for clock drift."""
    if not isinstance(code, str) or not code.isdigit() or len(code) != 6:
        return False
    now = at if at is not None else time.time()
    return any(hmac.compare_digest(totp(secret, now + drift * TOTP_STEP), code) for drift in (-1, 0, 1))


def totp_uri(secret, email, issuer="University Simulator"):
    """What an authenticator app needs to add the account."""
    from urllib.parse import quote
    return f"otpauth://totp/{quote(issuer)}:{quote(email)}?secret={secret}&issuer={quote(issuer)}"
