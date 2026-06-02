"use client";

import { useEffect, useState } from "react";
import { api, fmtDate } from "../lib-client";

interface Post {
  id: number;
  commentary: string;
  visibility: string;
  status: string;
  scheduled_at: number | null;
  published_at: number | null;
  linkedin_urn: string | null;
  error: string | null;
  created_at: number;
}

export default function Posts({ refreshKey, onChange }: { refreshKey: number; onChange: () => void }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { posts } = await api<{ posts: Post[] }>("/api/posts");
      setPosts(posts);
      setErr(null);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  async function publishNow(id: number) {
    setBusyId(id);
    setErr(null);
    try {
      await api(`/api/posts/${id}/publish`, { method: "POST" });
      await load();
      onChange();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: number) {
    if (!confirm("Delete this post?")) return;
    setBusyId(id);
    try {
      await api(`/api/posts/${id}`, { method: "DELETE" });
      await load();
      onChange();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <div className="card">Loading…</div>;

  return (
    <div className="card">
      <h2>🗂 Your posts</h2>
      <p className="sub">Drafts, scheduled posts, and published history.</p>
      {err && <div className="notice error">{err}</div>}
      {posts.length === 0 && <p className="muted">No posts yet. Head to Compose to create one.</p>}

      {posts.map((p) => (
        <div className="list-item" key={p.id}>
          <div className="meta">
            <span className={`pill ${p.status}`}>{p.status}</span>
            <span>{p.visibility === "CONNECTIONS" ? "Connections" : "Public"}</span>
            {p.status === "scheduled" && p.scheduled_at && <span>⏰ {fmtDate(p.scheduled_at)}</span>}
            {p.status === "published" && p.published_at && <span>✅ {fmtDate(p.published_at)}</span>}
            {p.status === "draft" && <span>created {fmtDate(p.created_at)}</span>}
          </div>
          <div className="body">{p.commentary}</div>
          {p.error && <div className="notice error" style={{ marginTop: 8 }}>{p.error}</div>}

          {p.status !== "published" && (
            <div className="btn-row">
              <button onClick={() => publishNow(p.id)} disabled={busyId === p.id}>
                {busyId === p.id ? <span className="spin" /> : "Publish now"}
              </button>
              <button className="danger" onClick={() => remove(p.id)} disabled={busyId === p.id}>
                Delete
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
