"use client";

import { useEffect, useState } from "react";
import { api, fmtDate } from "../lib-client";
import HumanizeReview from "./HumanizeReview";
import TellHint from "./TellHint";

type AugLevel = "light" | "medium" | "heavy";

interface Target {
  id: number;
  kind: string; // post | person
  url: string | null;
  name: string | null;
  context: string | null;
  draft: string | null;
  note: string | null;
  tags: string | null;
  priority: number;
  status: string; // todo | drafted | done | skipped
  created_at: number;
}

const DAILY_GOAL = 10;

export default function Cockpit({ aiEnabled }: { aiEnabled: boolean }) {
  const [targets, setTargets] = useState<Target[]>([]);
  const [engagedToday, setEngagedToday] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sprint, setSprint] = useState(false);

  // Add-target form
  const [kind, setKind] = useState<"post" | "person">("post");
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [context, setContext] = useState("");
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");

  // Filtering
  const [tagFilter, setTagFilter] = useState("");
  const [origin, setOrigin] = useState("");

  // Humanize
  const [hzLevel, setHzLevel] = useState<AugLevel>("medium");
  const [hzBusy, setHzBusy] = useState<number | null>(null);
  const [review, setReview] = useState<{ id: number; before: string; after: string } | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const bookmarklet =
    `javascript:(function(){var t=encodeURIComponent((window.getSelection&&getSelection().toString())||'');` +
    `var u=encodeURIComponent(location.href);window.open('${origin}/capture?kind=post&url='+u+'&text='+t,` +
    `'lgs','width=480,height=420');})();`;

  async function load() {
    try {
      const d = await api<{ targets: Target[]; engagedToday: number }>("/api/targets");
      setTargets(d.targets);
      setEngagedToday(d.engagedToday);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function add() {
    if (!url.trim() && !context.trim()) {
      setErr("Add a URL or paste some context.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api("/api/targets", {
        method: "POST",
        body: JSON.stringify({ kind, url, name, context, note, tags }),
      });
      setUrl("");
      setName("");
      setContext("");
      setNote("");
      setTags("");
      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function draftAll() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const r = await api<{ drafted: number; attempted: number; errors: string[] }>(
        "/api/targets/draft",
        { method: "POST", body: JSON.stringify({}) }
      );
      setMsg(`Drafted ${r.drafted}/${r.attempted} in your voice.${r.errors.length ? " Some skipped (need context)." : ""}`);
      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function draftOne(id: number) {
    setBusy(true);
    setErr(null);
    try {
      await api("/api/targets/draft", { method: "POST", body: JSON.stringify({ id }) });
      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: number, fields: any) {
    try {
      await api(`/api/targets/${id}`, { method: "PATCH", body: JSON.stringify(fields) });
      await load();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function humanizeItem(id: number, draft: string) {
    setHzBusy(id);
    setErr(null);
    try {
      const { draft: out } = await api<{ draft: string }>("/api/ai/draft", {
        method: "POST",
        body: JSON.stringify({ humanize: draft, level: hzLevel }),
      });
      setReview({ id, before: draft, after: out });
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setHzBusy(null);
    }
  }

  async function acceptHumanize() {
    if (!review) return;
    await patch(review.id, { draft: review.after });
    setReview(null);
  }

  async function remove(id: number) {
    if (!confirm("Remove this target?")) return;
    await api(`/api/targets/${id}`, { method: "DELETE" });
    await load();
  }

  const allTags = Array.from(
    new Set(
      targets
        .flatMap((t) => (t.tags || "").split(","))
        .map((s) => s.trim())
        .filter(Boolean)
    )
  ).sort();

  const visible = targets.filter((t) => {
    if (sprint && !(t.status === "todo" || t.status === "drafted")) return false;
    if (tagFilter && !(t.tags || "").split(",").map((s) => s.trim()).includes(tagFilter)) return false;
    return true;
  });
  const todoCount = targets.filter((t) => t.status === "todo" || t.status === "drafted").length;
  const pct = Math.min(100, Math.round((engagedToday / DAILY_GOAL) * 100));

  return (
    <>
      <div className="notice info">
        <strong>How the cockpit works:</strong> save posts &amp; people you want to engage with, let
        the assistant batch-draft voice-matched comments and connection notes, then{" "}
        <strong>copy each one and post it yourself on LinkedIn</strong> (the “Open” link takes you
        straight there). You stay in control of the final click — that&apos;s what keeps your account
        safe and your engagement genuine.
      </div>

      {origin && (
        <div className="card">
          <h2>🔖 Quick capture</h2>
          <p className="sub">
            Drag this button to your bookmarks bar. While scrolling LinkedIn, select a post&apos;s
            text and click it to drop that post straight into your queue.
          </p>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href={bookmarklet} className="bookmarklet" onClick={(e) => e.preventDefault()}>
            ➕ Add to Growth Studio
          </a>
        </div>
      )}

      <div className="card">
        <h2>🎯 Daily engagement sprint</h2>
        <p className="sub">
          {engagedToday} / {DAILY_GOAL} engaged today · {todoCount} in your queue
        </p>
        <div style={{ height: 12, background: "var(--panel-2)", borderRadius: 999, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "var(--green)" }} />
        </div>
        <div className="btn-row">
          {aiEnabled && (
            <button onClick={draftAll} disabled={busy}>
              {busy ? <span className="spin" /> : "✨ Draft all to-do (in my voice)"}
            </button>
          )}
          <button className="secondary" onClick={() => setSprint((s) => !s)}>
            {sprint ? "Show all" : "Sprint mode (hide done)"}
          </button>
        </div>
      </div>

      <div className="card">
        <h2>➕ Add a target</h2>
        <div className="btn-row" style={{ marginTop: 0 }}>
          <button className={kind === "post" ? "" : "ghost"} onClick={() => setKind("post")}>
            💬 Post to comment on
          </button>
          <button className={kind === "person" ? "" : "ghost"} onClick={() => setKind("person")}>
            🤝 Person to connect with
          </button>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <div>
            <label>{kind === "post" ? "Link to the post" : "Link to their profile"}</label>
            <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.linkedin.com/…" />
          </div>
          <div>
            <label>{kind === "post" ? "Author (optional)" : "Their name"}</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <label>{kind === "post" ? "Paste the post text (so the draft is relevant)" : "Their headline / about (so the note is personal)"}</label>
        <textarea rows={4} value={context} onChange={(e) => setContext(e.target.value)} />
        <div className="row">
          <div>
            <label>{kind === "post" ? "What should your comment do? (optional)" : "Why connect? (optional)"}</label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === "post" ? "e.g. build on their point with an example" : "e.g. we both work in fintech infra"} />
          </div>
          <div>
            <label>Tags (optional, comma-separated)</label>
            <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. fintech, founders" />
          </div>
        </div>
        {err && <div className="notice error" style={{ marginTop: 10 }}>{err}</div>}
        {msg && <div className="notice info" style={{ marginTop: 10 }}>{msg}</div>}
        <div className="btn-row">
          <button onClick={add} disabled={busy}>Add to queue</button>
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <h2 style={{ margin: 0 }}>📋 Queue</h2>
          <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            {aiEnabled && (
              <label style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                humanize
                <select value={hzLevel} onChange={(e) => setHzLevel(e.target.value as AugLevel)} style={{ width: "auto", padding: "4px 8px" }}>
                  <option value="light">light</option>
                  <option value="medium">medium</option>
                  <option value="heavy">heavy</option>
                </select>
              </label>
            )}
            {allTags.length > 0 && (
              <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} style={{ width: "auto", minWidth: 140 }}>
                <option value="">All tags</option>
                {allTags.map((tg) => (
                  <option key={tg} value={tg}>{tg}</option>
                ))}
              </select>
            )}
          </div>
        </div>
        <p className="sub">⭐ a target to push it to the top of your sprint.</p>
        {visible.length === 0 && <p className="muted">Nothing here yet. Add a target above.</p>}
        {visible.map((t) => (
          <div className="list-item" key={t.id}>
            <div className="meta">
              <button
                className="ghost"
                title={t.priority > 0 ? "Remove priority" : "Mark priority"}
                style={{ padding: "2px 8px", borderColor: t.priority > 0 ? "var(--amber)" : "var(--border)" }}
                onClick={() => patch(t.id, { priority: t.priority > 0 ? 0 : 1 })}
              >
                {t.priority > 0 ? "⭐" : "☆"}
              </button>
              <span className="pill draft">{t.kind === "person" ? "🤝 connect" : "💬 comment"}</span>
              <span className={`pill ${t.status === "done" ? "approved" : t.status === "skipped" ? "dismissed" : t.status === "drafted" ? "scheduled" : "pending"}`}>
                {t.status}
              </span>
              {t.name && <span>{t.name}</span>}
              {(t.tags || "").split(",").map((s) => s.trim()).filter(Boolean).map((tg) => (
                <span key={tg} className="pill draft">#{tg}</span>
              ))}
              <span>{fmtDate(t.created_at)}</span>
              {t.url && <a href={t.url} target="_blank" rel="noreferrer">Open on LinkedIn ↗</a>}
            </div>
            {t.context && (
              <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                {t.context.slice(0, 160)}{t.context.length > 160 ? "…" : ""}
              </div>
            )}

            {t.draft ? (
              <textarea
                key={t.draft}
                rows={t.kind === "person" ? 3 : 3}
                defaultValue={t.draft}
                onBlur={(e) => { if (e.target.value !== t.draft) patch(t.id, { draft: e.target.value }); }}
              />
            ) : (
              <p className="muted" style={{ fontSize: 13 }}>No draft yet.</p>
            )}
            {aiEnabled && <TellHint text={t.draft} />}

            <div className="btn-row">
              {aiEnabled && (
                <button className="secondary" onClick={() => draftOne(t.id)} disabled={busy || !(t.context || "").trim()}>
                  {t.draft ? "Redraft" : "Draft"}
                </button>
              )}
              {t.draft && (
                <button className="secondary" onClick={() => navigator.clipboard?.writeText(t.draft!)}>
                  Copy
                </button>
              )}
              {aiEnabled && t.draft && (
                <button className="secondary" onClick={() => humanizeItem(t.id, t.draft!)} disabled={hzBusy === t.id}>
                  {hzBusy === t.id ? <span className="spin" /> : "🧑 Humanize"}
                </button>
              )}
              {t.status !== "done" && <button onClick={() => patch(t.id, { status: "done" })}>✅ Done</button>}
              {t.status !== "skipped" && <button className="ghost" onClick={() => patch(t.id, { status: "skipped" })}>Skip</button>}
              <button className="danger" onClick={() => remove(t.id)}>Delete</button>
            </div>
            {review && review.id === t.id && (
              <HumanizeReview
                before={review.before}
                after={review.after}
                onAccept={acceptHumanize}
                onDiscard={() => setReview(null)}
              />
            )}
          </div>
        ))}
      </div>
    </>
  );
}
