"""Product limits shared across services (values fixed by the design spec)."""

from datetime import timedelta

MAX_BODY_LENGTH = 4096
EDIT_WINDOW = timedelta(hours=24)
DELETE_FOR_EVERYONE_WINDOW = timedelta(hours=24)
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_VOICE_MS = 5 * 60 * 1000
WAVEFORM_BARS = 64
SIGNED_URL_TTL_SECONDS = 3600
LINK_CODE_TTL = timedelta(minutes=5)
MAX_PINS = 3
MAX_ALBUM_SIZE = 10
POLL_MIN_OPTIONS, POLL_MAX_OPTIONS = 2, 10
VOICE_MAX_MS = 5 * 60 * 1000
WAVEFORM_BARS = 64

# Off, 30 s, 5 m, 1 h, 8 h, 1 d, 1 w, 4 w
DISAPPEARING_OPTIONS = (0, 30, 300, 3600, 28800, 86400, 604800, 2419200)

USERNAME_PATTERN = r"^[a-z][a-z0-9_]{2,31}\.\d{2}$"

# Colour-initials avatar palette (assigned by user id).
AVATAR_COLORS = (
    "#5e6bd6", "#3d8f6e", "#b8562f", "#8a5bc7", "#2f7fa8", "#b0436b",
    "#6f7d2c", "#c26a1b", "#4a6fa5", "#9c4f91", "#2e8a87", "#a84a4a",
)
