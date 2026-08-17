"""Provider registry bootstrap. Importing this package registers all providers."""
from . import google_fit  # noqa: F401  (registers Google Fit)
from . import native  # noqa: F401  (registers Apple Health)
from .base import PROVIDERS, get_provider  # noqa: F401
