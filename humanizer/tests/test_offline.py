"""Offline tests — exercise everything that does not call the Anthropic API."""
import os
import tempfile

from humanizer.ingest import from_text
from humanizer.retrieval import TfidfIndex, most_relevant
from humanizer.store import Store
from humanizer.engine import build_voice_corpus, voice_system, AUGMENTATION_LEVELS, _level_directive
from humanizer import diff


def test_from_text_split():
    assert from_text("one post", split=False) == ["one post"]
    multi = "post one\n---\npost two\n---\npost three"
    assert from_text(multi, split=True) == ["post one", "post two", "post three"]


def test_retrieval_ranks_relevant_first():
    docs = [
        "kubernetes pods and container orchestration at scale",
        "my favorite sourdough bread recipe and baking tips",
        "scaling postgres connections and database pooling",
    ]
    idx = TfidfIndex(docs)
    ranked = idx.rank("how do I scale my database connections", k=3)
    assert ranked[0][0] == 2  # the postgres/database doc ranks first
    rel = most_relevant(docs, "sourdough baking", k=1)
    assert rel and "bread" in rel[0]


def test_store_roundtrip():
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "t.db")
        s = Store(path)
        s.add_sample("me", "Hello, this is how I write.", source="inline")
        s.add_sample("me", "Short. Punchy. Mine.", source="inline")
        assert s.count_samples("me") == 2
        s.set_style_guide("me", "Casual, short sentences.")
        p = s.get_profile("me")
        assert p is not None and p.style_guide == "Casual, short sentences."
        names = [pr.name for pr in s.list_profiles()]
        assert "me" in names
        assert s.clear_samples("me") == 2
        s.close()


def test_voice_system_has_cache_breakpoint():
    samples = ["A sample sentence I wrote.", "Another thing I said once."]
    corpus = build_voice_corpus(samples)
    blocks = voice_system("Concise and dry.", corpus, "Rewrite in voice.")
    # The last system block must carry the cache_control breakpoint.
    assert blocks[-1]["cache_control"] == {"type": "ephemeral"}
    assert "Concise and dry." in blocks[-1]["text"]
    assert "sample sentence" in blocks[-1]["text"]


def test_word_diff_marks_changes():
    out = diff.word_diff("we are thrilled to unlock value", "we built a thing", color=False)
    assert "[-" in out and "{+" in out  # has deletions and insertions in plain mode


def test_removed_tells_detects_and_clears():
    before = "In today's fast-paced world we leverage cutting-edge tools to delve into data."
    after = "We use good tools to dig into the data."
    removed = dict(diff.removed_tells(before, after))
    assert '"delve"' in removed
    assert '"leverage" (verb)' in removed
    assert '"cutting-edge"' in removed
    # A report renders without error and mentions the removals.
    report = diff.report(before, after, color=False)
    assert "AI tells removed" in report and "delve" in report


def test_levels_distinct():
    assert set(AUGMENTATION_LEVELS) == {"light", "medium", "heavy"}
    assert "LIGHT" in _level_directive("light")
    assert "HEAVY" in _level_directive("heavy")
    # Unknown level falls back to the default (medium).
    assert _level_directive("bogus") == AUGMENTATION_LEVELS["medium"]


if __name__ == "__main__":
    test_from_text_split()
    test_retrieval_ranks_relevant_first()
    test_store_roundtrip()
    test_voice_system_has_cache_breakpoint()
    test_word_diff_marks_changes()
    test_removed_tells_detects_and_clears()
    test_levels_distinct()
    print("All offline tests passed.")
