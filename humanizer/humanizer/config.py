"""Configuration: model, database location, and .env loading."""
import os

# Best-effort .env loading (optional dependency).
try:  # pragma: no cover - trivial
    from dotenv import load_dotenv

    load_dotenv()
except Exception:  # pragma: no cover
    pass


# Default model. Opus 4.8 is the most capable Claude model; override with
# HUMANIZER_MODEL=claude-sonnet-4-6 for faster/cheaper bulk rewriting.
MODEL = os.environ.get("HUMANIZER_MODEL", "claude-opus-4-8")


def db_path() -> str:
    explicit = os.environ.get("HUMANIZER_DB")
    if explicit:
        return explicit
    home = os.path.expanduser("~")
    return os.path.join(home, ".humanizer", "humanizer.db")


def has_api_key() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))
