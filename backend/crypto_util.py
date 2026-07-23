"""Symmetric encryption for provider OAuth tokens (never store tokens in plaintext)."""
import os
import logging
from typing import Optional
from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)

_key = os.environ.get("ENCRYPTION_KEY", "").strip()
_cipher: Optional[Fernet] = None
if _key:
    try:
        _cipher = Fernet(_key.encode())
    except Exception as e:  # invalid key -> encryption disabled, tokens won't be stored
        logger.error(f"Invalid ENCRYPTION_KEY, token encryption disabled: {e}")


def encryption_ready() -> bool:
    return _cipher is not None


def encrypt_token(token: Optional[str]) -> Optional[str]:
    if not token or _cipher is None:
        return None
    return _cipher.encrypt(token.encode()).decode()


def decrypt_token(blob: Optional[str]) -> Optional[str]:
    if not blob or _cipher is None:
        return None
    try:
        return _cipher.decrypt(blob.encode()).decode()
    except Exception:
        return None
