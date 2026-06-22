"""Central settings and paths. Reads .env if present."""
from __future__ import annotations

import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:  # noqa: BLE001
    pass

PROJECT_ROOT = Path(__file__).resolve().parents[2]
PACKS_DIR = PROJECT_ROOT / "packs"
DATA_DIR = PROJECT_ROOT / "data"
SESSIONS_DIR = DATA_DIR / "sessions"

DEFAULT_PACK = os.getenv("CONTEXT_PACK", "example-pack")

# Multilingual default so English + Hindi/Urdu meetings transcribe correctly.
# Use a ".en" model only for purely English meetings.
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "small")
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
WHISPER_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "")


def llm_configured() -> bool:
    if LLM_PROVIDER == "openai":
        return bool(os.getenv("OPENAI_API_KEY"))
    if LLM_PROVIDER == "anthropic":
        return bool(os.getenv("ANTHROPIC_API_KEY"))
    return False
