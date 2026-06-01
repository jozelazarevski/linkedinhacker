"use client";

import { useEffect, useState } from "react";
import { api, fmtDate } from "../lib-client";

interface Summary {
  totals: {
    published: number;
    scheduled: number;
    drafts: number;
    commentsApproved: number;
    commentsPending: number;
  };
  cadenceByWeek: { week: string; count: number }[];
  lastPublishedAt: number | null;
}

export default function Analytics({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<Summary>("/api/analytics")
      .then(setData)
      .catch((e) => setErr(e.message));
  }, [refreshKey]);

  if (err) return <div className="notice error">{err}</div>;
  if (!data) return <div className="card">Loading…</div>;

  const maxWeek = Math.max(1, ...data.cadenceByWeek.map((w) => w.count));

  return (
    <>
      <div className="card">
        <h2>📊 Your activity</h2>
        <p className="sub">
          Metrics tracked by this app. LinkedIn&apos;s API does not expose per-post impressions for
          personal profiles, so growth here is measured by consistency — the single biggest driver
          of follower growth.
        </p>
        <div className="stat-grid">
          <div className="stat">
            <div className="n">{data.totals.published}</div>
            <div className="l">Published</div>
          </div>
          <div className="stat">
            <div className="n">{data.totals.scheduled}</div>
            <div className="l">Scheduled</div>
          </div>
          <div className="stat">
            <div className="n">{data.totals.drafts}</div>
            <div className="l">Drafts</div>
          </div>
          <div className="stat">
            <div className="n">{data.totals.commentsApproved}</div>
            <div className="l">Comments used</div>
          </div>
        </div>
        {data.lastPublishedAt && (
          <p className="muted" style={{ marginTop: 14 }}>
            Last published {fmtDate(data.lastPublishedAt)}
          </p>
        )}
      </div>

      <div className="card">
        <h2>📅 Posting cadence</h2>
        <p className="sub">Published posts per ISO week. Aim for a steady rhythm (3–5/week).</p>
        {data.cadenceByWeek.length === 0 && <p className="muted">No published posts yet.</p>}
        {data.cadenceByWeek.map((w) => (
          <div key={w.week} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span className="muted" style={{ width: 80, fontSize: 12 }}>
              {w.week}
            </span>
            <div
              style={{
                height: 18,
                width: `${(w.count / maxWeek) * 100}%`,
                minWidth: 24,
                background: "var(--brand)",
                borderRadius: 6,
              }}
            />
            <span style={{ fontSize: 13 }}>{w.count}</span>
          </div>
        ))}
      </div>
    </>
  );
}
