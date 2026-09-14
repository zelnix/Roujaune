"""Shared pytest setup for the backend test suite.

Loads backend/.env at COLLECTION time (before any test module in this
directory is imported), so individual test files can read live credentials
(ADMIN_LOGIN_EMAIL/PASSWORD, HWG_SERVICE_TOKEN, etc.) from the environment
via `os.environ.get(...)` instead of hardcoding secrets as string literals.

Why this file exists: the 2026-06 security audit found several test files
with the live admin password (and an old, since-rotated HWG service token)
hardcoded as plain string constants — safe to run, but a real credential
leak risk on a public repo (anyone reading the source gets the value, and
it persists in git history forever). This conftest is the permanent fix:
pytest always imports the nearest conftest.py before collecting sibling
test modules, so as long as this file loads the .env at import time (not
inside a fixture function), the environment is populated before any test
module's top-level `os.environ.get(...)` constants are evaluated.
"""
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
