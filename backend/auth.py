"""Auth: PBKDF2 password hashing + opaque bearer tokens (DB me stored)."""
import hashlib
import hmac
import os
import secrets

_ITERATIONS = 200_000


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _ITERATIONS)
    return f"pbkdf2$sha256${_ITERATIONS}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, algo, iters, salt_hex, dk_hex = stored.split("$")
        dk = hashlib.pbkdf2_hmac(algo, password.encode(), bytes.fromhex(salt_hex), int(iters))
        return hmac.compare_digest(dk.hex(), dk_hex)
    except Exception:
        return False


def new_token() -> str:
    return secrets.token_urlsafe(32)
