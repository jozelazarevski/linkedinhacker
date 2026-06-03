"""Claude-powered voice engine: analyze a writing style, then rewrite/generate
text in that voice.

Prompt-caching strategy
-----------------------
The expensive, reused part of every request is the *voice context* — the
distilled style guide plus a corpus of the user's own writing. We put that in a
**byte-stable** system prompt with a ``cache_control`` breakpoint on the last
block, so it is written to cache once and read cheaply on every subsequent call.

Anything that varies per request (the text to rewrite, the brief, a few
task-relevant samples chosen by retrieval) goes in the **user turn**, *after* the
cached prefix — so it never invalidates the cache.
"""
from typing import List, Optional, Sequence

from .config import MODEL
from .retrieval import most_relevant

# Concrete "AI tells" to strip — keeps output reading human, not machine.
AI_TELLS = (
    "Avoid generic AI phrasing and structure: no 'in today's fast-paced world', "
    "'delve', 'navigate the landscape', 'game-changer', 'unlock', 'leverage' as a verb, "
    "'testament to', 'it's not just X, it's Y' constructions, robotic three-part lists "
    "with identical rhythm, em-dash overuse, or hollow motivational sign-offs. Write like "
    "a specific human, not a content engine."
)

# Keep the cached corpus a fixed size so the prefix stays byte-stable across calls
# and comfortably exceeds the ~4096-token minimum cacheable prefix for Opus.
_CORPUS_CHAR_BUDGET = 14000
_ANALYZE_SAMPLE_BUDGET = 16000


def _client():
    # Imported lazily so non-API commands (train, profile) work without the SDK
    # installed or an API key present.
    import anthropic

    return anthropic.Anthropic()


def _text_of(message) -> str:
    parts = [b.text for b in message.content if getattr(b, "type", None) == "text"]
    return "\n".join(parts).strip()


# ── building the cached voice context ────────────────────────────────────────

def build_voice_corpus(samples: Sequence[str], max_chars: int = _CORPUS_CHAR_BUDGET) -> str:
    """Deterministically concatenate samples into a stable corpus block."""
    out: List[str] = []
    used = 0
    for s in samples:  # samples come from the store ordered by id → stable
        s = s.strip()
        if not s:
            continue
        block = f"---\n{s}\n"
        if used + len(block) > max_chars and out:
            break
        out.append(block)
        used += len(block)
    return "".join(out).strip()


def voice_system(style_guide: Optional[str], corpus: str, task_instruction: str) -> list:
    """Build the system blocks, with the voice context cached.

    ``task_instruction`` is a short, stable description of the job (rewrite /
    generate / humanize) — stable text keeps the cache valid.
    """
    header = (
        "You write in one specific person's voice. Match their style exactly: sentence "
        "length and rhythm, vocabulary, level of formality, punctuation and capitalization "
        "habits, and how (or whether) they use emoji and hashtags. A reader who knows them "
        "should believe they wrote it. " + AI_TELLS + " " + task_instruction
    )
    voice_parts = []
    if style_guide:
        voice_parts.append("# The author's style, summarized\n" + style_guide.strip())
    if corpus:
        voice_parts.append("# Authentic samples written by the author (imitate this voice)\n" + corpus)
    voice_text = "\n\n".join(voice_parts) or "(No samples provided yet — write naturally and human.)"

    return [
        {"type": "text", "text": header},
        # Cache breakpoint: caches the header + voice context together.
        {"type": "text", "text": voice_text, "cache_control": {"type": "ephemeral"}},
    ]


def _relevant_block(samples: Sequence[str], query: str, k: int = 2) -> str:
    rel = most_relevant(samples, query, k=k)
    if not rel:
        return ""
    joined = "\n---\n".join(r.strip() for r in rel)
    return (
        "For reference, here are a few of my posts most related to this task — "
        "match this voice, not the topic:\n\"\"\"\n" + joined + "\n\"\"\"\n\n"
    )


# ── public operations ────────────────────────────────────────────────────────

def analyze_style(samples: Sequence[str]) -> str:
    """Distill the user's writing style into a concise, reusable style guide."""
    corpus = build_voice_corpus(samples, max_chars=_ANALYZE_SAMPLE_BUDGET)
    if not corpus:
        raise ValueError("No samples to analyze. Add some writing first.")

    msg = _client().messages.create(
        model=MODEL,
        max_tokens=2000,
        thinking={"type": "adaptive"},
        output_config={"effort": "high"},
        system=(
            "You are a writing-style analyst. Read the author's samples and produce a concise, "
            "actionable style guide another writer could follow to imitate them. Cover: typical "
            "sentence length & rhythm, formality, vocabulary & recurring phrases, "
            "punctuation/formatting habits, emoji & hashtag usage, opening-hook style, and overall "
            "personality. Be specific and brief (bullet points). Do not quote the samples verbatim."
        ),
        messages=[{"role": "user", "content": f"My writing samples:\n{corpus}"}],
    )
    return _text_of(msg)


def rewrite(
    style_guide: Optional[str],
    samples: Sequence[str],
    text: str,
    instruction: Optional[str] = None,
    effort: str = "low",
):
    """Rewrite ``text`` so it reads as if the user wrote it."""
    corpus = build_voice_corpus(samples)
    system = voice_system(
        style_guide,
        corpus,
        "Rewrite the user's text in their voice, preserving meaning and intent. Return ONLY the "
        "rewritten text — no preamble, no explanation.",
    )
    ref = _relevant_block(samples, text)
    extra = f"\nAlso: {instruction}\n" if instruction else ""
    user = f"{ref}Rewrite this in my voice:{extra}\n\n{text}"
    return _client().messages.create(
        model=MODEL,
        max_tokens=4096,
        thinking={"type": "adaptive"},
        output_config={"effort": effort},
        system=system,
        messages=[{"role": "user", "content": user}],
    )


def humanize(style_guide: Optional[str], samples: Sequence[str], text: str, effort: str = "low"):
    """Strip AI tells from ``text`` and make it sound like the user."""
    corpus = build_voice_corpus(samples)
    system = voice_system(
        style_guide,
        corpus,
        "Rewrite the user's text so it reads as genuinely human-written — never AI-generated — and "
        "in their voice. Preserve meaning, facts, and length. Return ONLY the rewritten text.",
    )
    ref = _relevant_block(samples, text)
    user = f"{ref}Rewrite this to sound fully human and in my voice:\n\n{text}"
    return _client().messages.create(
        model=MODEL,
        max_tokens=4096,
        thinking={"type": "adaptive"},
        output_config={"effort": effort},
        system=system,
        messages=[{"role": "user", "content": user}],
    )


def generate(style_guide: Optional[str], samples: Sequence[str], brief: str, effort: str = "low"):
    """Write something new from a brief, in the user's voice."""
    corpus = build_voice_corpus(samples)
    system = voice_system(
        style_guide,
        corpus,
        "Write new text from the user's brief, in their voice. Return ONLY the finished text.",
    )
    ref = _relevant_block(samples, brief)
    user = f"{ref}Write this in my voice:\n\n{brief}"
    return _client().messages.create(
        model=MODEL,
        max_tokens=4096,
        thinking={"type": "adaptive"},
        output_config={"effort": effort},
        system=system,
        messages=[{"role": "user", "content": user}],
    )


def result_text(message) -> str:
    """Extract the assistant's text from a Messages API response."""
    return _text_of(message)


def cache_stats(message) -> str:
    """Human-readable cache usage line for --verbose output."""
    u = message.usage
    return (
        f"tokens: input={u.input_tokens} "
        f"cache_write={getattr(u, 'cache_creation_input_tokens', 0)} "
        f"cache_read={getattr(u, 'cache_read_input_tokens', 0)} "
        f"output={u.output_tokens}"
    )
