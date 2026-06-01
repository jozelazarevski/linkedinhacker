"use client";

import { useEffect, useState } from "react";
import { api, fmtDate } from "../lib-client";

interface Engagement {
  id: number;
  source_url: string | null;
  source_text: string | null;
  draft_comment: string;
  status: string;
  created_at: number;
}

export default function Engage({ aiEnabled }: { aiEnabled: boolean }) {
  const [items, setItems] = useState<Engagement[]>([]);
  const [sourceText, setSourceText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [intent, setIntent] = useState("add a genuinely useful perspective");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      const { engagements } = await api<{ engagements: Engagement[] }>("/api/engagements");
      setItems(engagements);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function draft() {
    if (!sourceText.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await api("/api/engagements", {
        method: "POST",
        body: JSON.stringify({ sourceText, sourceUrl, intent }),
      });
      setSourceText("");
      setSourceUrl("");
      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function update(id: number, fields: any) {
    try {
      await api(`/api/engagements/${id}`, { method: "PATCH", body: JSON.stringify(fields) });
      await load();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <>
      <div className="notice info">
        <strong>How engagement works here:</strong> the assistant drafts a thoughtful comment for a
        post you paste in. You review/edit it, then <strong>copy &amp; post it yourself</strong> on
        LinkedIn. We never auto-comment on other people&apos;s posts — that violates LinkedIn&apos;s
        terms and gets accounts banned.
      </div>

      {aiEnabled ? (
        <div className="card">
          <h2>💬 Draft a comment reply</h2>
          <p className="sub">Paste the post you want to respond to.</p>
          <label>The post you&apos;re replying to</label>
          <textarea
            rows={5}
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            placeholder="Paste the text of the post here…"
          />
          <div className="row">
            <div>
              <label>Link to the post (optional)</label>
              <input
                type="text"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://www.linkedin.com/posts/…"
              />
            </div>
            <div>
              <label>What should your comment do?</label>
              <select value={intent} onChange={(e) => setIntent(e.target.value)}>
                <option>add a genuinely useful perspective</option>
                <option>share a relevant personal experience</option>
                <option>ask a thoughtful question</option>
                <option>respectfully offer a different angle</option>
                <option>build on their main point with a concrete example</option>
              </select>
            </div>
          </div>
          {err && <div className="notice error">{err}</div>}
          <div className="btn-row">
            <button onClick={draft} disabled={busy || !sourceText.trim()}>
              {busy ? <span className="spin" /> : "Draft comment"}
            </button>
          </div>
        </div>
      ) : (
        <div className="notice warn">
          AI drafting is disabled. Set <code>ANTHROPIC_API_KEY</code> in <code>.env.local</code> to
          use the engagement assistant.
        </div>
      )}

      <div className="card">
        <h2>📋 Approval queue</h2>
        <p className="sub">Edit, then mark approved/used when you&apos;ve posted it.</p>
        {items.length === 0 && <p className="muted">Nothing queued yet.</p>}
        {items.map((it) => (
          <div className="list-item" key={it.id}>
            <div className="meta">
              <span className={`pill ${it.status}`}>{it.status}</span>
              <span>{fmtDate(it.created_at)}</span>
              {it.source_url && (
                <a href={it.source_url} target="_blank" rel="noreferrer">
                  view post ↗
                </a>
              )}
            </div>
            {it.source_text && (
              <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                Re: {it.source_text.slice(0, 140)}
                {it.source_text.length > 140 ? "…" : ""}
              </div>
            )}
            <textarea
              rows={3}
              defaultValue={it.draft_comment}
              onBlur={(e) => {
                if (e.target.value !== it.draft_comment) update(it.id, { draftComment: e.target.value });
              }}
            />
            <div className="btn-row">
              <button
                className="secondary"
                onClick={() => navigator.clipboard?.writeText(it.draft_comment)}
              >
                Copy
              </button>
              <button onClick={() => update(it.id, { status: "used" })}>Mark used</button>
              <button className="ghost" onClick={() => update(it.id, { status: "dismissed" })}>
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
