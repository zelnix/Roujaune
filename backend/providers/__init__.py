"""Provider registry bootstrap. Importing this package registers all providers."""
from . import garmin  # noqa: F401  (registers Garmin Connect)
from . import strava  # noqa: F401  (registers Strava)
from . import google_fit  # noqa: F401  (registers Google Fit)
from . import native  # noqa: F401  (registers Apple Health)
from .base import PROVIDERS, get_provider  # noqa: F401
