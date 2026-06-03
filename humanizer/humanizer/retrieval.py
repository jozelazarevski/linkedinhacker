"""Lightweight TF-IDF retrieval (pure stdlib, no heavy deps).

Used to pick the handful of the user's own samples most relevant to a given task,
so we can add them as targeted few-shot examples *after* the cached system prefix.
"""
import math
import re
from collections import Counter
from typing import List, Sequence, Tuple

_TOKEN = re.compile(r"[a-z0-9']+")


def _tokenize(text: str) -> List[str]:
    return _TOKEN.findall(text.lower())


class TfidfIndex:
    def __init__(self, docs: Sequence[str]):
        self.docs = list(docs)
        self._tokens = [_tokenize(d) for d in self.docs]
        df: Counter = Counter()
        for toks in self._tokens:
            for term in set(toks):
                df[term] += 1
        n = max(1, len(self.docs))
        # Smoothed IDF.
        self.idf = {t: math.log((n + 1) / (c + 1)) + 1.0 for t, c in df.items()}
        self._vecs = [self._vectorize(toks) for toks in self._tokens]

    def _vectorize(self, toks: Sequence[str]) -> dict:
        tf = Counter(toks)
        total = max(1, len(toks))
        vec = {t: (cnt / total) * self.idf.get(t, 0.0) for t, cnt in tf.items()}
        norm = math.sqrt(sum(v * v for v in vec.values())) or 1.0
        return {t: v / norm for t, v in vec.items()}

    def rank(self, query: str, k: int = 3) -> List[Tuple[int, float]]:
        """Return up to ``k`` ``(doc_index, score)`` pairs, most similar first."""
        if not self.docs:
            return []
        qvec = self._vectorize(_tokenize(query))
        scored: List[Tuple[int, float]] = []
        for i, dvec in enumerate(self._vecs):
            # Cosine similarity over the smaller vector.
            small, big = (qvec, dvec) if len(qvec) < len(dvec) else (dvec, qvec)
            score = sum(val * big.get(term, 0.0) for term, val in small.items())
            scored.append((i, score))
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:k]


def most_relevant(samples: Sequence[str], query: str, k: int = 3) -> List[str]:
    """Convenience: return the texts of the top-k most relevant samples."""
    if not samples:
        return []
    index = TfidfIndex(samples)
    return [samples[i] for i, score in index.rank(query, k) if score > 0]
