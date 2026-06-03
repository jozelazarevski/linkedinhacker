"""Load writing samples from files, directories, or raw text."""
import os
from typing import List, Tuple

TEXT_EXTS = {".txt", ".md", ".markdown", ".text"}


def from_text(text: str, split: bool = False) -> List[str]:
    """Turn raw text into one or more samples.

    If ``split`` is set, break on lines containing only ``---`` or on blank-line
    gaps, so a user can paste several posts at once.
    """
    text = text.strip()
    if not text:
        return []
    if not split:
        return [text]
    # Split on a literal '---' delimiter line first; fall back to blank-line gaps.
    if "\n---\n" in f"\n{text}\n":
        chunks = [c.strip() for c in text.replace("\r\n", "\n").split("\n---\n")]
    else:
        chunks = [c.strip() for c in text.replace("\r\n", "\n").split("\n\n\n")]
    return [c for c in chunks if c]


def from_path(path: str, split: bool = False) -> List[Tuple[str, str]]:
    """Read a file or a directory tree of text files.

    Returns a list of ``(source, text)`` tuples — one per sample.
    """
    out: List[Tuple[str, str]] = []
    if os.path.isfile(path):
        out.extend((path, t) for t in _read_file(path, split))
    elif os.path.isdir(path):
        for root, _dirs, files in os.walk(path):
            for name in sorted(files):
                if os.path.splitext(name)[1].lower() in TEXT_EXTS:
                    fp = os.path.join(root, name)
                    out.extend((fp, t) for t in _read_file(fp, split))
    else:
        raise FileNotFoundError(path)
    return out


def _read_file(path: str, split: bool) -> List[str]:
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        return from_text(fh.read(), split=split)
