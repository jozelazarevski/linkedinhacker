"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "../lib-client";

interface Post {
  id: number;
  commentary: string;
  status: string;
  scheduled_at: number | null;
  published_at: number | null;
}

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function Calendar({ refreshKey }: { refreshKey: number }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  useEffect(() => {
    api<{ posts: Post[] }>("/api/posts")
      .then((d) => setPosts(d.posts))
      .catch((e) => setErr(e.message));
  }, [refreshKey]);

  // Bucket posts by local YYYY-MM-DD using their scheduled or published time.
  const byDay = useMemo(() => {
    const map: Record<string, Post[]> = {};
    for (const p of posts) {
      const t = p.published_at ?? p.scheduled_at;
      if (!t) continue;
      const d = new Date(t);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      (map[key] ||= []).push(p);
    }
    return map;
  }, [posts]);

  // Build the visible grid (weeks starting Monday).
  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const startOffset = (first.getDay() + 6) % 7; // Mon=0
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const out: { date: Date | null }[] = [];
    for (let i = 0; i < startOffset; i++) out.push({ date: null });
    for (let d = 1; d <= daysInMonth; d++) out.push({ date: new Date(year, month, d) });
    while (out.length % 7 !== 0) out.push({ date: null });
    return out;
  }, [cursor]);

  const today = new Date();
  const isToday = (d: Date) =>
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();

  function shift(months: number) {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + months, 1));
  }

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2>📅 Content calendar</h2>
        <div className="btn-row" style={{ marginTop: 0 }}>
          <button className="ghost" onClick={() => shift(-1)}>
            ‹
          </button>
          <button
            className="ghost"
            onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
          >
            Today
          </button>
          <button className="ghost" onClick={() => shift(1)}>
            ›
          </button>
        </div>
      </div>
      <p className="sub">
        {cursor.toLocaleString(undefined, { month: "long", year: "numeric" })} — scheduled &amp;
        published posts. Plan a steady rhythm.
      </p>
      {err && <div className="notice error">{err}</div>}

      <div className="cal-grid cal-head">
        {DOW.map((d) => (
          <div key={d} className="cal-dow">
            {d}
          </div>
        ))}
      </div>
      <div className="cal-grid">
        {cells.map((c, i) => {
          if (!c.date) return <div key={i} className="cal-cell empty" />;
          const key = `${c.date.getFullYear()}-${c.date.getMonth()}-${c.date.getDate()}`;
          const items = byDay[key] || [];
          return (
            <div key={i} className={`cal-cell ${isToday(c.date) ? "today" : ""}`}>
              <div className="cal-date">{c.date.getDate()}</div>
              {items.map((p) => (
                <div
                  key={p.id}
                  className={`cal-pill ${p.status}`}
                  title={p.commentary.slice(0, 200)}
                >
                  {p.status === "published" ? "✅" : "⏰"} {p.commentary.slice(0, 22)}
                  {p.commentary.length > 22 ? "…" : ""}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
