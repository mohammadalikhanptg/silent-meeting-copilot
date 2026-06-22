"""Context pack loader. Missing files never crash the app."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

PACK_FILES = [
    "case_context", "red_lines", "response_bank", "meeting_strategy",
    "business_context", "people_and_entities", "evidence_summary", "do_not_say",
]


@dataclass
class ContextPack:
    name: str
    path: Path
    files: dict
    responses: dict
    missing: list


def parse_response_bank(text: str) -> dict:
    """Parse '## key' sections with '- line' items into {key: [lines]}."""
    responses: dict = {}
    current = None
    for line in text.splitlines():
        s = line.strip()
        if s.startswith("## "):
            current = s[3:].strip()
            responses[current] = []
        elif current and s.startswith("- "):
            responses[current].append(s[2:].strip())
    return responses


def load_pack(packs_dir: Path, name: str) -> ContextPack:
    path = packs_dir / name
    files: dict = {}
    missing: list = []
    for key in PACK_FILES:
        fp = path / f"{key}.md"
        if fp.exists():
            try:
                files[key] = fp.read_text(encoding="utf-8")
            except Exception:  # noqa: BLE001
                missing.append(f"{key}.md (unreadable)")
        else:
            missing.append(f"{key}.md")
    responses = parse_response_bank(files.get("response_bank", ""))
    return ContextPack(name=name, path=path, files=files,
                       responses=responses, missing=missing)
