"use client";

import { useState, useRef, useEffect } from "react";
import { api } from "../lib-client";

type ActionCard =
  | { type: "post_draft"; postId: number; draft: string; published: boolean }
  | { type: "comment_draft"; engagementId: number; url: string; comment: string; opened: boolean }
  | { type: "browser_task"; taskId: number; taskType: string; url: string; status: string }
  | { type: "open_url"; url: string };

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  card?: ActionCard;
}

const WELCOME: Message = {
  id: "welcome",
  role: "assistant",
  content: [
    "LinkedIn Console ready. What would you like to do?",
    "",
    "Examples:",
    '• "Write a post about AI trends in 2026"',
    '• "Comment on https://linkedin.com/posts/... saying I found this insightful"',
    '• "Like the post at https://linkedin.com/posts/..."',
    '• "Draft a bold post about leadership lessons"',
  ].join("\n"),
  timestamp: Date.now(),
};

export default function Console({
  aiEnabled,
  tokenExpired,
}: {
  aiEnabled: boolean;
  tokenExpired: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const history = messages
    .filter((m) => m.id !== "welcome")
    .map((m) => ({ role: m.role, content: m.content }));

  async function send() {
    const cmd = input.trim();
    if (!cmd || loading) return;
    setInput("");
    setErr(null);

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: cmd,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const result = await api<{ message: string; card?: ActionCard }>("/api/console", {
        method: "POST",
        body: JSON.stringify({ command: cmd, history }),
      });
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: result.message,
          timestamp: Date.now(),
          card: result.card,
        },
      ]);
    } catch (e: any) {
      setErr(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function patchCard(msgId: string, patch: Partial<ActionCard>) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.card ? { ...m, card: { ...m.card, ...patch } as ActionCard } : m
      )
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 180px)",
        minHeight: 480,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 0 14px",
          borderBottom: "1px solid var(--border)",
          marginBottom: 16,
          flexShrink: 0,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>🖥️ Command Console</h2>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--muted)" }}>
            Natural language → LinkedIn posts, comments &amp; likes
          </p>
        </div>
        <a
          href="https://www.linkedin.com/feed/"
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 13, color: "var(--muted)" }}
        >
          Open LinkedIn ↗
        </a>
      </div>

      {!aiEnabled && (
        <div className="notice warn" style={{ marginBottom: 12, flexShrink: 0 }}>
          AI is disabled — set <code>ANTHROPIC_API_KEY</code> to enable the console.
        </div>
      )}
      {tokenExpired && (
        <div className="notice error" style={{ marginBottom: 12, flexShrink: 0 }}>
          Your LinkedIn token has expired. Sign in again to publish posts.
        </div>
      )}

      {/* Message list */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          paddingRight: 4,
        }}
      >
        {messages.map((msg) => (
          <Bubble key={msg.id} msg={msg} onPatch={(p) => patchCard(msg.id, p)} />
        ))}

        {loading && (
          <div style={{ display: "flex" }}>
            <div
              style={{
                background: "var(--panel-2)",
                border: "1px solid var(--border)",
                borderRadius: "14px 14px 14px 4px",
                padding: "10px 14px",
                fontSize: 14,
                color: "var(--muted)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span className="spin" /> Thinking…
            </div>
          </div>
        )}

        {err && (
          <div style={{ display: "flex" }}>
            <div
              style={{
                background: "rgba(226,97,106,0.12)",
                border: "1px solid rgba(226,97,106,0.4)",
                borderRadius: "14px 14px 14px 4px",
                padding: "10px 14px",
                fontSize: 14,
                color: "var(--red)",
              }}
            >
              {err}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "flex-end",
          marginTop: 16,
          paddingTop: 16,
          borderTop: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Type a command… (Enter to send, Shift+Enter for newline)"
          rows={2}
          disabled={loading || !aiEnabled}
          style={{
            flex: 1,
            resize: "none",
            fontFamily: "ui-monospace, monospace",
            fontSize: 14,
          }}
        />
        <button
          onClick={send}
          disabled={loading || !input.trim() || !aiEnabled}
          style={{ height: 56, minWidth: 72, flexShrink: 0 }}
        >
          {loading ? <span className="spin" /> : "Send"}
        </button>
      </div>
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function Bubble({
  msg,
  onPatch,
}: {
  msg: Message;
  onPatch: (p: Partial<ActionCard>) => void;
}) {
  const isUser = msg.role === "user";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-end" : "flex-start",
        gap: 4,
      }}
    >
      <div
        style={{
          maxWidth: "84%",
          background: isUser ? "var(--brand)" : "var(--panel-2)",
          border: "1px solid var(--border)",
          borderRadius: isUser ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
          padding: "10px 14px",
        }}
      >
        <div style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{msg.content}</div>
        {msg.card && <CardView card={msg.card} onPatch={onPatch} />}
      </div>
      <div style={{ fontSize: 11, color: "var(--muted)" }}>
        {new Date(msg.timestamp).toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </div>
    </div>
  );
}

// ── Action cards ──────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 10,
};

function CardView({
  card,
  onPatch,
}: {
  card: ActionCard;
  onPatch: (p: Partial<ActionCard>) => void;
}) {
  if (card.type === "post_draft") return <PostDraftCard card={card} onPatch={onPatch} />;
  if (card.type === "comment_draft") return <CommentDraftCard card={card} onPatch={onPatch} />;
  if (card.type === "browser_task") return <BrowserTaskCard card={card} />;
  if (card.type === "open_url")
    return (
      <div style={cardStyle}>
        <a href={card.url} target="_blank" rel="noreferrer">
          <button className="secondary" style={{ width: "100%" }}>
            Open on LinkedIn ↗
          </button>
        </a>
      </div>
    );
  return null;
}

function PostDraftCard({
  card,
  onPatch,
}: {
  card: Extract<ActionCard, { type: "post_draft" }>;
  onPatch: (p: Partial<ActionCard>) => void;
}) {
  const [draft, setDraft] = useState(card.draft);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function publish() {
    setBusy(true);
    setStatus(null);
    try {
      await api(`/api/posts/${card.postId}`, {
        method: "PATCH",
        body: JSON.stringify({ commentary: draft }),
      });
      await api(`/api/posts/${card.postId}/publish`, { method: "POST" });
      setStatus("Published!");
      onPatch({ published: true } as any);
    } catch (e: any) {
      setStatus(e.message || "Publish failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
        Draft post · {draft.length} chars
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={6}
        disabled={card.published}
        style={{ fontSize: 13, marginBottom: 4 }}
      />
      <div
        style={{
          fontSize: 11,
          color: draft.length > 2800 ? "var(--red)" : "var(--muted)",
          textAlign: "right",
          marginBottom: 8,
        }}
      >
        {draft.length} / 3000
      </div>
      {status && (
        <div
          className={`notice ${status === "Published!" ? "info" : "error"}`}
          style={{ margin: "0 0 8px", fontSize: 12 }}
        >
          {status}
        </div>
      )}
      <div className="btn-row">
        {card.published ? (
          <span className="pill published">Published ✓</span>
        ) : (
          <button onClick={publish} disabled={busy || !draft.trim()}>
            {busy ? (
              <>
                <span className="spin" /> Publishing…
              </>
            ) : (
              "Publish to LinkedIn"
            )}
          </button>
        )}
        <button className="ghost" onClick={() => navigator.clipboard.writeText(draft)}>
          Copy text
        </button>
      </div>
    </div>
  );
}

function CommentDraftCard({
  card,
  onPatch,
}: {
  card: Extract<ActionCard, { type: "comment_draft" }>;
  onPatch: (p: Partial<ActionCard>) => void;
}) {
  const [comment, setComment] = useState(card.comment);
  const [btnLabel, setBtnLabel] = useState("Copy & Open LinkedIn");

  function copyAndOpen() {
    navigator.clipboard.writeText(comment);
    setBtnLabel("Copied! Paste into LinkedIn →");
    onPatch({ opened: true } as any);
    window.open(card.url, "_blank");
    setTimeout(() => setBtnLabel("Copy & Open LinkedIn"), 4000);
  }

  const short = card.url.length > 60 ? card.url.slice(0, 60) + "…" : card.url;

  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
        Comment draft for:{" "}
        <a href={card.url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
          {short}
        </a>
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={3}
        style={{ fontSize: 13 }}
      />
      <div className="btn-row" style={{ marginTop: 8 }}>
        <button onClick={copyAndOpen}>{btnLabel}</button>
        <button className="ghost" onClick={() => navigator.clipboard.writeText(comment)}>
          Copy only
        </button>
      </div>
      {card.opened && (
        <div className="notice info" style={{ marginTop: 8, fontSize: 12 }}>
          Comment copied — paste it into the LinkedIn comment field.
        </div>
      )}
    </div>
  );
}

function BrowserTaskCard({ card }: { card: Extract<ActionCard, { type: "browser_task" }> }) {
  const emoji = card.taskType === "like" ? "👍" : "💬";
  const label = card.taskType === "like" ? "Like post" : "Comment";
  const short = card.url.length > 70 ? card.url.slice(0, 70) + "…" : card.url;

  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 13, marginBottom: 6 }}>
        {emoji} {label} queued{" "}
        <span className={`pill ${card.status}`}>{card.status}</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
        <a href={card.url} target="_blank" rel="noreferrer">
          {short}
        </a>
      </div>
      <div className="btn-row">
        <a href={card.url} target="_blank" rel="noreferrer">
          <button className="secondary">Open on LinkedIn ↗</button>
        </a>
      </div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 10 }}>
        Run <code>npm run browser-agent</code> locally to auto-execute this action.
      </div>
    </div>
  );
}
