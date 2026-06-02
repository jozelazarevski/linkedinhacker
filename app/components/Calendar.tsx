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

interface PlanIdea {
  day: string;
  time: string;
  hook: string;
  idea: string;
}

function Planner({ onChange }: { onChange: () => void }) {
  const [themes, setThemes] = useState("");
  const [audience, setAudience] = useState("");
  const [plan, setPlan] = useState<PlanIdea[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function generate() {
    if (!themes.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const { plan } = await api<{ plan: PlanIdea[] }>("/api/ai/plan", {
        method: "POST",
        body: JSON.stringify({ themes, audience, count: 5 }),
      });
      setPlan(plan);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft(idea: PlanIdea) {
    try {
      await api("/api/posts", {
        method: "POST",
        body: JSON.stringify({ commentary: `${idea.hook}\n\n${idea.idea}` }),
      });
      setMsg(`Saved a draft for ${idea.day}. Polish it in the Compose tab.`);
      onChange();
    } catch (e: any) {
      setMsg(e.message);
    }
  }

  return (
    <div className="card">
      <h2>🗓 Plan my week</h2>
      <p className="sub">
        Generate a week of voice-matched post ideas, scheduled on high-engagement windows
        (Tue–Thu mornings). Save any as a draft to refine.
      </p>
      <label>Themes / topics to cover this week</label>
      <textarea
        rows={2}
        value={themes}
        onChange={(e) => setThemes(e.target.value)}
        placeholder="e.g. lessons from scaling our team, a hiring mistake, why we killed a feature"
      />
      <label>Audience (optional)</label>
      <input type="text" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. startup founders" />
      {msg && <div className="notice info" style={{ marginTop: 10 }}>{msg}</div>}
      <div className="btn-row">
        <button onClick={generate} disabled={busy || !themes.trim()}>
          {busy ? <span className="spin" /> : "Generate weekly plan"}
        </button>
      </div>

      {plan.map((idea, i) => (
        <div className="list-item" key={i}>
          <div className="meta">
            <span className="pill scheduled">📅 {idea.day} · {idea.time}</span>
          </div>
          <div className="body" style={{ fontWeight: 600 }}>{idea.hook}</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{idea.idea}</div>
          <div className="btn-row">
            <button className="secondary" onClick={() => saveDraft(idea)}>Save as draft</button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Calendar({
  refreshKey,
  aiEnabled,
  onChange,
}: {
  refreshKey: number;
  aiEnabled: boolean;
  onChange: () => void;
}) {
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
    <>
      {aiEnabled && <Planner onChange={onChange} />}
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
    </>
  );
}
