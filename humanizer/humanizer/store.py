"""SQLite persistence for voice profiles and writing samples.

A *profile* is a named voice (default "me"). It owns many *samples* (the user's
own writing) and one distilled *style guide* (produced by analyzing the samples).
"""
import os
import sqlite3
import time
from dataclasses import dataclass
from typing import List, Optional

from .config import db_path


@dataclass
class Sample:
    id: int
    profile: str
    source: Optional[str]
    text: str
    created_at: int


@dataclass
class Profile:
    name: str
    style_guide: Optional[str]
    created_at: int
    updated_at: int


class Store:
    def __init__(self, path: Optional[str] = None):
        self.path = path or db_path()
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        self.conn = sqlite3.connect(self.path)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self._migrate()

    def _migrate(self) -> None:
        self.conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS profiles (
                name        TEXT PRIMARY KEY,
                style_guide TEXT,
                created_at  INTEGER NOT NULL,
                updated_at  INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS samples (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                profile    TEXT NOT NULL,
                source     TEXT,
                text       TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_samples_profile ON samples(profile);
            """
        )
        self.conn.commit()

    # ── profiles ──────────────────────────────────────────────────────────────
    def ensure_profile(self, name: str) -> Profile:
        now = int(time.time())
        self.conn.execute(
            "INSERT OR IGNORE INTO profiles (name, style_guide, created_at, updated_at) "
            "VALUES (?, NULL, ?, ?)",
            (name, now, now),
        )
        self.conn.commit()
        return self.get_profile(name)  # type: ignore[return-value]

    def get_profile(self, name: str) -> Optional[Profile]:
        row = self.conn.execute("SELECT * FROM profiles WHERE name = ?", (name,)).fetchone()
        if not row:
            return None
        return Profile(row["name"], row["style_guide"], row["created_at"], row["updated_at"])

    def list_profiles(self) -> List[Profile]:
        rows = self.conn.execute("SELECT * FROM profiles ORDER BY name").fetchall()
        return [Profile(r["name"], r["style_guide"], r["created_at"], r["updated_at"]) for r in rows]

    def set_style_guide(self, name: str, style_guide: str) -> None:
        self.ensure_profile(name)
        self.conn.execute(
            "UPDATE profiles SET style_guide = ?, updated_at = ? WHERE name = ?",
            (style_guide, int(time.time()), name),
        )
        self.conn.commit()

    # ── samples ───────────────────────────────────────────────────────────────
    def add_sample(self, profile: str, text: str, source: Optional[str] = None) -> Sample:
        self.ensure_profile(profile)
        now = int(time.time())
        cur = self.conn.execute(
            "INSERT INTO samples (profile, source, text, created_at) VALUES (?, ?, ?, ?)",
            (profile, source, text.strip(), now),
        )
        self.conn.commit()
        return Sample(int(cur.lastrowid), profile, source, text.strip(), now)

    def list_samples(self, profile: str) -> List[Sample]:
        rows = self.conn.execute(
            "SELECT * FROM samples WHERE profile = ? ORDER BY id", (profile,)
        ).fetchall()
        return [Sample(r["id"], r["profile"], r["source"], r["text"], r["created_at"]) for r in rows]

    def count_samples(self, profile: str) -> int:
        row = self.conn.execute(
            "SELECT COUNT(*) AS n FROM samples WHERE profile = ?", (profile,)
        ).fetchone()
        return int(row["n"])

    def clear_samples(self, profile: str) -> int:
        cur = self.conn.execute("DELETE FROM samples WHERE profile = ?", (profile,))
        self.conn.commit()
        return cur.rowcount

    def close(self) -> None:
        self.conn.close()
