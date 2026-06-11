"use client";

import { useEffect, useState } from "react";
import { api, fmtDate } from "../lib-client";

interface Metrics {
  post_id: number;
  impressions: number;
  reactions: number;
  comments: number;
  reposts: number;
}
interface PostRow {
  id: number;
  commentary: string;
  published_at: number | null;
  metrics: Metrics | null;
}
interface Dash {
  totals: {
    published: number;
    measuredPosts: number;
    totalImpressions: number;
    totalReactions: number;
    totalComments: number;
    avgReactions: number;
    streakWeeks: number;
    humanizePasses: number;
    hooksGenerated: number;
    commentsUsed: number;
    latestFollowers: number | null;
    followerGrowth: number;
  };
  followers: { followers: number; recorded_at: number }[];
  topPosts: PostRow[];
  publishedPosts: PostRow[];
  byFormat: Insight[];
  byHook: Insight[];
}
interface Insight {
  key: string;
  count: number;
  measured: number;
  avgReactions: number;
  avgImpressions: number;
}

export default function Dashboard({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<Dash | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [followerInput, setFollowerInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setData(await api<Dash>("/api/dashboard"));
      setErr(null);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  async function recordFollowers() {
    const n = Number(followerInput);
    if (!Number.isFinite(n) || n < 0) return;
    setBusy(true);
    try {
      await api("/api/metrics", { method: "POST", body: JSON.stringify({ type: "followers", followers: n }) });
      setFollowerInput("");
      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveMetrics(postId: number, m: Partial<Metrics>) {
    try {
      await api("/api/metrics", {
        method: "POST",
        body: JSON.stringify({ type: "post", postId, ...m }),
      });
      await load();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  if (err) return <div className="notice error">{err}</div>;
  if (!data) return <div className="card">Loading…</div>;

  const t = data.totals;
  const maxF = Math.max(1, ...data.followers.map((f) => f.followers));

  return (
    <>
      <div className="notice info">
        <strong>Honest tracking:</strong> LinkedIn&apos;s API doesn&apos;t expose impressions,
        reactions, or follower counts for personal profiles — so the dashboard auto-tracks what the
        app can measure and lets you <strong>record the rest</strong> (numbers you read off LinkedIn)
        to chart real growth over time.
      </div>

      <div className="card">
        <h2>📈 Success dashboard</h2>
        <div className="stat-grid">
          <div className="stat">
            <div className="n">{t.latestFollowers ?? "—"}</div>
            <div className="l">Followers {t.followerGrowth ? `(${t.followerGrowth >= 0 ? "+" : ""}${t.followerGrowth})` : ""}</div>
          </div>
          <div className="stat">
            <div className="n">{t.streakWeeks}</div>
            <div className="l">Week streak</div>
          </div>
          <div className="stat">
            <div className="n">{t.published}</div>
            <div className="l">Published</div>
          </div>
          <div className="stat">
            <div className="n">{t.totalImpressions || "—"}</div>
            <div className="l">Impressions</div>
          </div>
          <div className="stat">
            <div className="n">{t.totalReactions || "—"}</div>
            <div className="l">Reactions</div>
          </div>
          <div className="stat">
            <div className="n">{t.avgReactions || "—"}</div>
            <div className="l">Avg reactions/post</div>
          </div>
          <div className="stat">
            <div className="n">{t.commentsUsed}</div>
            <div className="l">Comments used</div>
          </div>
          <div className="stat">
            <div className="n">{t.hooksGenerated}</div>
            <div className="l">Hooks generated</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>👥 Follower growth</h2>
        <p className="sub">Record your follower count whenever you check it — it charts over time.</p>
        <div className="row" style={{ maxWidth: 360 }}>
          <input
            type="text"
            inputMode="numeric"
            value={followerInput}
            onChange={(e) => setFollowerInput(e.target.value)}
            placeholder="today's follower count"
          />
          <button onClick={recordFollowers} disabled={busy || !followerInput.trim()} style={{ flex: "0 0 auto" }}>
            Record
          </button>
        </div>
        <div style={{ marginTop: 14 }}>
          {data.followers.length < 2 && (
            <p className="muted">Add at least two readings on different days to see the trend.</p>
          )}
          {data.followers.map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span className="muted" style={{ width: 90, fontSize: 12 }}>{fmtDate(f.recorded_at)}</span>
              <div
                style={{
                  height: 16,
                  width: `${(f.followers / maxF) * 100}%`,
                  minWidth: 24,
                  background: "var(--brand)",
                  borderRadius: 6,
                }}
              />
              <span style={{ fontSize: 13 }}>{f.followers}</span>
            </div>
          ))}
        </div>
      </div>

      {data.topPosts.length > 0 && (
        <div className="card">
          <h2>🏆 Top posts</h2>
          <p className="sub">Your best performers by reactions — study what worked.</p>
          {data.topPosts.map((p) => (
            <div className="list-item" key={p.id}>
              <div className="meta">
                <span className="pill approved">{p.metrics?.reactions ?? 0} reactions</span>
                {p.metrics?.impressions ? <span>{p.metrics.impressions} impressions</span> : null}
                {p.published_at && <span>{fmtDate(p.published_at)}</span>}
              </div>
              <div className="body" style={{ fontSize: 14 }}>
                {p.commentary.slice(0, 200)}
                {p.commentary.length > 200 ? "…" : ""}
              </div>
            </div>
          ))}
        </div>
      )}

      {(data.byFormat.length > 0 || data.byHook.length > 0) && (
        <div className="card">
          <h2>🔬 What&apos;s working</h2>
          <p className="sub">
            Avg reactions by format and hook style, for posts you&apos;ve tagged and measured. Lean
            into the winners.
          </p>
          <div className="row" style={{ alignItems: "flex-start" }}>
            <InsightList title="By format" items={data.byFormat} />
            <InsightList title="By hook style" items={data.byHook} />
          </div>
        </div>
      )}

      <div className="card">
        <h2>✍️ Record post metrics</h2>
        <p className="sub">
          Enter the numbers from each post&apos;s LinkedIn analytics. They feed the totals and top
          posts above.
        </p>
        {data.publishedPosts.length === 0 && <p className="muted">No published posts yet.</p>}
        {data.publishedPosts.slice(0, 15).map((p) => (
          <MetricRow key={p.id} post={p} onSave={(m) => saveMetrics(p.id, m)} />
        ))}
      </div>
    </>
  );
}

function InsightList({ title, items }: { title: string; items: Insight[] }) {
  const measured = items.filter((i) => i.measured > 0);
  const max = Math.max(1, ...measured.map((i) => i.avgReactions));
  return (
    <div>
      <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{title}</div>
      {measured.length === 0 && (
        <p className="muted" style={{ fontSize: 12 }}>Tag posts (use a template, suggestion, or hook) and record their reactions to see this.</p>
      )}
      {measured.map((it) => (
        <div key={it.key} style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 2 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>{it.key}</span>
            <span><strong>{it.avgReactions}</strong> <span className="muted" style={{ fontSize: 11 }}>avg · {it.measured}p</span></span>
          </div>
          <div style={{ height: 8, background: "var(--panel-2)", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ width: `${(it.avgReactions / max) * 100}%`, height: "100%", background: "var(--green)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function MetricRow({ post, onSave }: { post: PostRow; onSave: (m: Partial<Metrics>) => void }) {
  const m = post.metrics;
  const [impressions, setImpressions] = useState(String(m?.impressions ?? ""));
  const [reactions, setReactions] = useState(String(m?.reactions ?? ""));
  const [comments, setComments] = useState(String(m?.comments ?? ""));
  const [reposts, setReposts] = useState(String(m?.reposts ?? ""));
  const [saved, setSaved] = useState(false);

  const num = (s: string) => (s.trim() === "" ? 0 : Math.max(0, parseInt(s, 10) || 0));

  return (
    <div className="list-item">
      <div className="body" style={{ fontSize: 13, marginBottom: 8 }}>
        {post.commentary.slice(0, 120)}
        {post.commentary.length > 120 ? "…" : ""}
      </div>
      <div className="metric-row">
        <label className="metric-field">
          impressions
          <input type="text" inputMode="numeric" value={impressions} onChange={(e) => setImpressions(e.target.value)} />
        </label>
        <label className="metric-field">
          reactions
          <input type="text" inputMode="numeric" value={reactions} onChange={(e) => setReactions(e.target.value)} />
        </label>
        <label className="metric-field">
          comments
          <input type="text" inputMode="numeric" value={comments} onChange={(e) => setComments(e.target.value)} />
        </label>
        <label className="metric-field">
          reposts
          <input type="text" inputMode="numeric" value={reposts} onChange={(e) => setReposts(e.target.value)} />
        </label>
        <button
          className="secondary"
          onClick={() => {
            onSave({
              impressions: num(impressions),
              reactions: num(reactions),
              comments: num(comments),
              reposts: num(reposts),
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 1500);
          }}
        >
          {saved ? "Saved ✓" : "Save"}
        </button>
      </div>
    </div>
  );
}
