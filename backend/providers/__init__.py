"""Provider registry bootstrap. Importing this package registers all providers.

Note: the Google Fit cloud/REST API is deprecated by Google (developers are
directed to Android Health Connect), so we no longer register the `google_fit`
OAuth provider. Google Health data now flows through the native **Health
Connect** provider (see `native.py`), which reads/writes Google Fit & Samsung
Health on-device.
"""
from . import native  # noqa: F401  (registers Apple Health + Health Connect)
from .base import PROVIDERS, get_provider  # noqa: F401
