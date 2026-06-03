"""Offline tests — exercise everything that does not call the Anthropic API."""
import os
import tempfile

from humanizer.ingest import from_text
from humanizer.retrieval import TfidfIndex, most_relevant
from humanizer.store import Store
from humanizer.engine import build_voice_corpus, voice_system


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


if __name__ == "__main__":
    test_from_text_split()
    test_retrieval_ranks_relevant_first()
    test_store_roundtrip()
    test_voice_system_has_cache_breakpoint()
    print("All offline tests passed.")
