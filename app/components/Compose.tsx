"use client";

import { useEffect, useState } from "react";
import { api, localInputToMs } from "../lib-client";
import { detectTells } from "../lib-diff";
import HumanizeReview from "./HumanizeReview";
import Voice from "./Voice";

const MAX = 3000;
type AugLevel = "light" | "medium" | "heavy";

interface Template {
  id: string;
  name: string;
  emoji: string;
  description: string;
  scaffold: string;
  aiBrief: string;
}

interface NextPostIdea {
  hook: string;
  angle: string;
  rationale: string;
  format: string;
}

export default function Compose({
  aiEnabled,
  tokenExpired,
  onChange,
}: {
  aiEnabled: boolean;
  tokenExpired: boolean;
  onChange: () => void;
}) {
  const [text, setText] = useState("");
  const [visibility, setVisibility] = useState<"PUBLIC" | "CONNECTIONS">("PUBLIC");
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  // AI controls
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("conversational");
  const [audience, setAudience] = useState("");
  const [drafts, setDrafts] = useState<string[]>([]);
  const [aiBusy, setAiBusy] = useState(false);

  // Humanize controls + review (before/after diff)
  const [level, setLevel] = useState<AugLevel>("medium");
  const [review, setReview] = useState<{ before: string; after: string } | null>(null);
  const [publishWarn, setPublishWarn] = useState<
    { action: "publish" | "schedule"; tells: { label: string; n: number }[] } | null
  >(null);

  // Next-post suggestion engine
  const [suggestions, setSuggestions] = useState<NextPostIdea[]>([]);
  const [suggestBusy, setSuggestBusy] = useState(false);

  // Templates
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState("");

  useEffect(() => {
    api<{ templates: Template[] }>("/api/templates")
      .then((d) => setTemplates(d.templates))
      .catch(() => setTemplates([]));
  }, []);

  const selectedTemplate = templates.find((t) => t.id === templateId);

  async function generate() {
    setAiBusy(true);
    setMsg(null);
    try {
      const { drafts } = await api<{ drafts: string[] }>("/api/ai/draft", {
        method: "POST",
        body: JSON.stringify({
          topic,
          tone,
          audience,
          variations: 3,
          framework: selectedTemplate?.aiBrief,
        }),
      });
      setDrafts(drafts);
    } catch (e: any) {
      setMsg({ kind: "error", text: e.message });
    } finally {
      setAiBusy(false);
    }
  }

  async function improve(instruction: string) {
    if (!text.trim()) return;
    setAiBusy(true);
    setMsg(null);
    try {
      const { draft } = await api<{ draft: string }>("/api/ai/draft", {
        method: "POST",
        body: JSON.stringify({ draft: text, instruction }),
      });
      setText(draft);
    } catch (e: any) {
      setMsg({ kind: "error", text: e.message });
    } finally {
      setAiBusy(false);
    }
  }

  async function humanize() {
    if (!text.trim()) return;
    setAiBusy(true);
    setMsg(null);
    try {
      const before = text;
      const { draft } = await api<{ draft: string }>("/api/ai/draft", {
        method: "POST",
        body: JSON.stringify({ humanize: before, level }),
      });
      // Show a before/after review instead of silently replacing.
      setReview({ before, after: draft });
    } catch (e: any) {
      setMsg({ kind: "error", text: e.message });
    } finally {
      setAiBusy(false);
    }
  }

  function acceptReview() {
    if (review) setText(review.after);
    setReview(null);
    setMsg({ kind: "info", text: "Applied the humanized version." });
  }

  async function suggest() {
    setSuggestBusy(true);
    setMsg(null);
    try {
      const { ideas } = await api<{ ideas: NextPostIdea[] }>("/api/ai/suggest", {
        method: "POST",
        body: JSON.stringify({ count: 5 }),
      });
      setSuggestions(ideas);
    } catch (e: any) {
      setMsg({ kind: "error", text: e.message });
    } finally {
      setSuggestBusy(false);
    }
  }

  async function save(action: "draft" | "schedule" | "publish", override = false) {
    if (!text.trim()) {
      setMsg({ kind: "error", text: "Write something first." });
      return;
    }
    // Safety check: warn (don't block) if the post still reads AI-written before
    // it goes out. Drafts are exempt.
    if (!override && aiEnabled && (action === "publish" || action === "schedule")) {
      const tells = detectTells(text);
      if (tells.length > 0) {
        setPublishWarn({ action, tells });
        return;
      }
    }
    setPublishWarn(null);
    setBusy(true);
    setMsg(null);
    try {
      const scheduledAt = action === "schedule" ? localInputToMs(when) : null;
      if (action === "schedule" && !scheduledAt) {
        setMsg({ kind: "error", text: "Pick a date & time to schedule." });
        setBusy(false);
        return;
      }
      const { post } = await api<{ post: { id: number } }>("/api/posts", {
        method: "POST",
        body: JSON.stringify({ commentary: text, visibility, scheduledAt }),
      });

      if (action === "publish") {
        await api(`/api/posts/${post.id}/publish`, { method: "POST" });
        setMsg({ kind: "info", text: "Published to LinkedIn 🎉" });
      } else if (action === "schedule") {
        setMsg({ kind: "info", text: `Scheduled for ${new Date(scheduledAt!).toLocaleString()}` });
      } else {
        setMsg({ kind: "info", text: "Saved as draft." });
      }
      setText("");
      setWhen("");
      setDrafts([]);
      onChange();
    } catch (e: any) {
      setMsg({ kind: "error", text: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {tokenExpired && (
        <div className="notice warn">
          Your LinkedIn token has expired. Publishing will fail until you sign in again.
        </div>
      )}

      <Voice aiEnabled={aiEnabled} />

      {aiEnabled && (
        <div className="card">
          <h2>💡 What to post next</h2>
          <p className="sub">
            Suggestions based on your voice and recent posts. Click one to start composing.
          </p>
          <div className="btn-row" style={{ marginTop: 0 }}>
            <button onClick={suggest} disabled={suggestBusy}>
              {suggestBusy ? <span className="spin" /> : "Suggest next posts"}
            </button>
          </div>
          {suggestions.map((s, i) => (
            <div className="list-item" key={i}>
              <div className="meta">
                <span className="pill scheduled">{s.format || "idea"}</span>
              </div>
              <div className="body" style={{ fontWeight: 600 }}>{s.hook}</div>
              {s.angle && (
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{s.angle}</div>
              )}
              {s.rationale && (
                <div className="muted" style={{ fontSize: 12, marginTop: 6, fontStyle: "italic" }}>
                  Why: {s.rationale}
                </div>
              )}
              <div className="btn-row">
                <button
                  className="secondary"
                  onClick={() => {
                    setText(`${s.hook}\n\n${s.angle}`.trim());
                    setSuggestions([]);
                    setMsg({ kind: "info", text: "Loaded the idea below — refine, humanize, then publish." });
                  }}
                >
                  Use this idea
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {templates.length > 0 && (
        <div className="card">
          <h2>🧩 Post templates</h2>
          <p className="sub">
            Start from a proven framework. Insert the scaffold to fill in yourself
            {aiEnabled ? ", or let the AI write a draft in this shape." : "."}
          </p>
          <div className="template-grid">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`template-chip ${templateId === t.id ? "active" : ""}`}
                onClick={() => setTemplateId(templateId === t.id ? "" : t.id)}
                title={t.description}
              >
                <span style={{ fontSize: 18 }}>{t.emoji}</span> {t.name}
              </button>
            ))}
          </div>
          {selectedTemplate && (
            <div className="list-item" style={{ marginTop: 14 }}>
              <div className="muted" style={{ marginBottom: 8 }}>
                {selectedTemplate.description}
              </div>
              <div className="body" style={{ fontSize: 13 }}>
                {selectedTemplate.scaffold}
              </div>
              <div className="btn-row">
                <button
                  className="secondary"
                  onClick={() => {
                    setText(selectedTemplate.scaffold);
                    setMsg({ kind: "info", text: `Inserted the "${selectedTemplate.name}" scaffold below — edit away.` });
                  }}
                >
                  Insert scaffold
                </button>
                {aiEnabled && (
                  <span className="muted" style={{ alignSelf: "center", fontSize: 12 }}>
                    ↓ This framework will shape AI generation.
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {aiEnabled && (
        <div className="card">
          <h2>✨ AI draft assistant</h2>
          <p className="sub">
            Describe what you want to post about. The assistant writes value-first drafts — no
            engagement-bait.
            {selectedTemplate && (
              <>
                {" "}
                Using the <strong>{selectedTemplate.name}</strong> framework.
              </>
            )}
          </p>
          <label>Topic / idea</label>
          <textarea
            rows={2}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. 3 lessons from migrating our monolith to services"
          />
          <div className="row">
            <div>
              <label>Tone</label>
              <select value={tone} onChange={(e) => setTone(e.target.value)}>
                <option>conversational</option>
                <option>professional</option>
                <option>bold / contrarian</option>
                <option>storytelling</option>
                <option>educational</option>
              </select>
            </div>
            <div>
              <label>Audience (optional)</label>
              <input
                type="text"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="e.g. engineering leaders"
              />
            </div>
          </div>
          <div className="btn-row">
            <button onClick={generate} disabled={aiBusy || !topic.trim()}>
              {aiBusy ? <span className="spin" /> : "Generate 3 drafts"}
            </button>
          </div>

          {drafts.length > 0 && (
            <div style={{ marginTop: 16 }}>
              {drafts.map((d, i) => (
                <div className="list-item" key={i}>
                  <div className="body">{d}</div>
                  <div className="btn-row">
                    <button className="secondary" onClick={() => setText(d)}>
                      Use this draft
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card">
        <h2>📝 Compose</h2>
        <p className="sub">Publish now, schedule for later, or save as a draft.</p>

        <label>Post text</label>
        <textarea
          rows={8}
          value={text}
          maxLength={MAX}
          onChange={(e) => setText(e.target.value)}
          placeholder="Share something useful…"
        />
        <div className="charcount">
          {text.length} / {MAX}
        </div>

        {aiEnabled && text.trim() && (
          <div className="btn-row">
            <button className="ghost" disabled={aiBusy} onClick={() => improve("Make the hook stronger")}>
              ↑ Stronger hook
            </button>
            <button className="ghost" disabled={aiBusy} onClick={() => improve("Make it more concise")}>
              ✂ More concise
            </button>
            <button className="ghost" disabled={aiBusy} onClick={() => improve("Add a clear call to discussion at the end without being spammy")}>
              💬 Add CTA
            </button>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <button className="ghost" disabled={aiBusy} onClick={humanize} title="Rewrite to remove AI tells and match your trained voice">
                🧑 Humanize / match my voice
              </button>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as AugLevel)}
                title="How aggressively to rewrite"
                style={{ width: "auto", padding: "6px 8px", fontSize: 12 }}
              >
                <option value="light">light</option>
                <option value="medium">medium</option>
                <option value="heavy">heavy</option>
              </select>
            </span>
            {aiBusy && <span className="spin" />}
          </div>
        )}

        {review && (
          <HumanizeReview
            before={review.before}
            after={review.after}
            onAccept={acceptReview}
            onDiscard={() => setReview(null)}
          />
        )}

        <div className="row" style={{ marginTop: 12 }}>
          <div>
            <label>Visibility</label>
            <select value={visibility} onChange={(e) => setVisibility(e.target.value as any)}>
              <option value="PUBLIC">Public (anyone)</option>
              <option value="CONNECTIONS">Connections only</option>
            </select>
          </div>
          <div>
            <label>Schedule for (optional)</label>
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
        </div>

        {msg && <div className={`notice ${msg.kind}`} style={{ marginTop: 14 }}>{msg.text}</div>}

        {publishWarn && (
          <div className="notice warn" style={{ marginTop: 14 }}>
            <strong>This still reads a bit AI-written.</strong> Detected:{" "}
            {publishWarn.tells.map((t) => t.label).join(", ")}.
            <div className="btn-row">
              <button
                onClick={() => {
                  setPublishWarn(null);
                  humanize();
                }}
                disabled={aiBusy}
              >
                🧑 Humanize first
              </button>
              <button
                className="ghost"
                onClick={() => save(publishWarn.action, true)}
                disabled={busy}
              >
                {publishWarn.action === "publish" ? "Publish anyway" : "Schedule anyway"}
              </button>
              <button className="ghost" onClick={() => setPublishWarn(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="btn-row">
          <button onClick={() => save("publish")} disabled={busy}>
            {busy ? <span className="spin" /> : "Publish now"}
          </button>
          <button className="secondary" onClick={() => save("schedule")} disabled={busy || !when}>
            Schedule
          </button>
          <button className="ghost" onClick={() => save("draft")} disabled={busy}>
            Save draft
          </button>
        </div>
      </div>
    </>
  );
}
