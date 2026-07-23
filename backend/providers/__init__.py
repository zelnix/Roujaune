"""Provider registry bootstrap. Importing this package registers all providers."""
from . import garmin  # noqa: F401  (registers Garmin Connect)
from . import native  # noqa: F401  (registers Apple Health + Health Connect)
from .base import PROVIDERS, get_provider  # noqa: F401
