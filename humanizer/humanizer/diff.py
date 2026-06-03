"""Before/after diff rendering and AI-tell detection.

Shows what the humanizer changed (word-level), and which specific "AI tells"
were present in the input and removed in the output.
"""
import difflib
import re
import sys
from typing import List, Tuple

RESET = "\033[0m"
RED = "\033[31m"
GREEN = "\033[32m"
STRIKE = "\033[9m"
BOLD = "\033[1m"
DIM = "\033[2m"

# Curated markers of generic AI prose. Each is (friendly label, regex).
# Detection is informational — it reports which tells the rewrite removed.
TELL_PATTERNS: List[Tuple[str, str]] = [
    ('"delve"', r"\bdelv(?:e|es|ed|ing)\b"),
    ('"leverage" (verb)', r"\bleverag(?:e|es|ed|ing)\b"),
    ('"unlock"', r"\bunlock(?:s|ed|ing)?\b"),
    ('"game-changer/changing"', r"\bgame[- ]chang(?:er|ers|ing)\b"),
    ('"in today\'s fast-paced world"', r"in today'?s fast[- ]paced world"),
    ('"testament to"', r"\btestament to\b"),
    ('"it\'s not just X, it\'s Y"', r"not just\b.{0,60}?\bit'?s\b"),
    ('"cutting-edge"', r"\bcutting[- ]edge\b"),
    ('"the landscape"', r"\bthe landscape\b"),
    ('"seamless(ly)"', r"\bseamless(?:ly)?\b"),
    ('"elevate"', r"\belevat(?:e|es|ed|ing)\b"),
    ('"robust"', r"\brobust\b"),
    ('"thrilled/excited to"', r"\b(?:thrilled|excited) to\b"),
    ('"dive into / deep dive"', r"\b(?:deep dive|div(?:e|ing) into)\b"),
    ('"realm"', r"\brealm\b"),
    ('"tapestry"', r"\btapestry\b"),
    ('"foster"', r"\bfoster(?:s|ed|ing)?\b"),
    ('"underscore"', r"\bunderscor(?:e|es|ed|ing)\b"),
    ('"pivotal"', r"\bpivotal\b"),
    ('"in conclusion"', r"\bin conclusion\b"),
    ('"navigate"', r"\bnavigat(?:e|es|ed|ing)\b"),
    ('"resonate"', r"\bresonat(?:e|es|ed|ing)\b"),
]


def supports_color(stream=sys.stderr) -> bool:
    return bool(getattr(stream, "isatty", lambda: False)())


_TOKEN = re.compile(r"\s+|\w+|[^\w\s]")


def _tokenize(s: str) -> List[str]:
    # Keep whitespace and punctuation as their own tokens so the diff reads naturally.
    return _TOKEN.findall(s)


def _mark(text: str, kind: str, color: bool) -> str:
    if not text:
        return ""
    if color:
        return (f"{RED}{STRIKE}{text}{RESET}" if kind == "del" else f"{GREEN}{text}{RESET}")
    return f"[-{text}-]" if kind == "del" else f"{{+{text}+}}"


def word_diff(before: str, after: str, color: bool = None) -> str:
    """Inline word-level diff: removed text struck through, added text highlighted."""
    if color is None:
        color = supports_color()
    a, b = _tokenize(before), _tokenize(after)
    sm = difflib.SequenceMatcher(a=a, b=b, autojunk=False)
    out: List[str] = []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            out.append("".join(a[i1:i2]))
        elif tag == "delete":
            out.append(_mark("".join(a[i1:i2]), "del", color))
        elif tag == "insert":
            out.append(_mark("".join(b[j1:j2]), "ins", color))
        elif tag == "replace":
            out.append(_mark("".join(a[i1:i2]), "del", color))
            out.append(_mark("".join(b[j1:j2]), "ins", color))
    return "".join(out)


def removed_tells(before: str, after: str) -> List[Tuple[str, int]]:
    """AI tells whose count dropped from before → after."""
    found: List[Tuple[str, int]] = []
    for label, pat in TELL_PATTERNS:
        nb = len(re.findall(pat, before, re.IGNORECASE))
        na = len(re.findall(pat, after, re.IGNORECASE))
        if nb > na:
            found.append((label, nb - na))
    return found


def emdash_delta(before: str, after: str) -> int:
    return before.count("—") - after.count("—")


def _words(s: str) -> int:
    return len(re.findall(r"\w+", s))


def report(before: str, after: str, color: bool = None) -> str:
    """A human-readable change report for --diff output."""
    if color is None:
        color = supports_color()
    head = (lambda s: f"{BOLD}{s}{RESET}") if color else (lambda s: s)
    lines = [head("── changes ──"), word_diff(before, after, color=color), ""]

    tells = removed_tells(before, after)
    if tells:
        lines.append(head("AI tells removed:"))
        for label, n in tells:
            lines.append(f"  • {label}" + (f" (×{n})" if n > 1 else ""))
    else:
        lines.append("AI tells removed: none detected in the input")

    dash = emdash_delta(before, after)
    if dash > 0:
        lines.append(f"  • em-dashes: {dash} removed")

    wb, wa = _words(before), _words(after)
    lines.append("")
    lines.append(f"length: {wb} → {wa} words ({wa - wb:+d})")
    return "\n".join(lines)
