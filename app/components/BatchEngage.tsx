"use client";

import { useState, useRef } from "react";
import { api } from "../lib-client";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BatchTarget {
  id: number;
  url: string;
  draft: string | null;
  note: string | null;
  // local UI state
  draftStatus: "pending" | "drafting" | "drafted" | "error";
  draftError?: string;
  approvalStatus: "pending" | "approved" | "skipped" | "queued";
  editedDraft: string;
}

type Stage = "import" | "draft" | "review";
type ReviewFilter = "all" | "approved" | "pending" | "skipped";

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseUrls(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && (s.startsWith("http") || s.startsWith("linkedin")));
}

function shortUrl(url: string, max = 70) {
  const u = url.replace(/^https?:\/\/(www\.)?/, "");
  return u.length > max ? u.slice(0, max) + "…" : u;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BatchEngage({ aiEnabled }: { aiEnabled: boolean }) {
  const [stage, setStage] = useState<Stage>("import");

  // Import stage
  const [rawUrls, setRawUrls] = useState("");
  const [commentGoal, setCommentGoal] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  // Draft + review stage
  const [targets, setTargets] = useState<BatchTarget[]>([]);
  const [drafting, setDrafting] = useState(false);
  const [draftIdx, setDraftIdx] = useState(0);
  const cancelRef = useRef(false);

  // Review filter
  const [filter, setFilter] = useState<ReviewFilter>("all");

  // Execute
  const [executing, setExecuting] = useState(false);
  const [execMsg, setExecMsg] = useState<string | null>(null);

  // ── Stage 1: Import ─────────────────────────────────────────────────────────

  const parsed = parseUrls(rawUrls);

  async function importUrls() {
    if (parsed.length === 0) return;
    setImporting(true);
    setImportMsg(null);
    try {
      const res = await api<{ created: number; skipped: number; targets: any[] }>(
        "/api/targets/bulk",
        {
          method: "POST",
          body: JSON.stringify({ urls: parsed, commentGoal: commentGoal.trim() || undefined }),
        }
      );
      const batchTargets: BatchTarget[] = res.targets.map((t) => ({
        id: t.id,
        url: t.url,
        draft: t.draft,
        note: t.note,
        draftStatus: t.draft ? "drafted" : "pending",
        approvalStatus: "pending",
        editedDraft: t.draft || "",
      }));
      setTargets(batchTargets);
      setImportMsg(
        `Imported ${res.created} posts${res.skipped ? ` (${res.skipped} already existed, skipped)` : ""}.`
      );
      if (res.created > 0) setStage("draft");
    } catch (e: any) {
      setImportMsg(e.message || "Import failed");
    } finally {
      setImporting(false);
    }
  }

  // ── Stage 2: Draft ──────────────────────────────────────────────────────────

  function updateTarget(id: number, patch: Partial<BatchTarget>) {
    setTargets((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  async function draftAll() {
    const pending = targets.filter((t) => t.draftStatus === "pending");
    if (pending.length === 0) return;
    setDrafting(true);
    cancelRef.current = false;
    setDraftIdx(0);

    for (let i = 0; i < pending.length; i++) {
      if (cancelRef.current) break;
      const t = pending[i];
      setDraftIdx(i + 1);
      updateTarget(t.id, { draftStatus: "drafting" });
      try {
        const res = await api<{ target: any }>(`/api/targets/${t.id}/batch-draft`, {
          method: "POST",
        });
        const draft = res.target?.draft || "";
        updateTarget(t.id, { draftStatus: "drafted", draft, editedDraft: draft });
      } catch (e: any) {
        updateTarget(t.id, {
          draftStatus: "error",
          draftError: e.message || "Draft failed",
        });
      }
    }

    setDrafting(false);
  }

  const totalDrafted = targets.filter((t) => t.draftStatus === "drafted").length;
  const totalPending = targets.filter((t) => t.draftStatus === "pending").length;
  const totalErrors = targets.filter((t) => t.draftStatus === "error").length;

  // ── Stage 3: Review ─────────────────────────────────────────────────────────

  const totalApproved = targets.filter((t) => t.approvalStatus === "approved").length;
  const totalSkipped = targets.filter((t) => t.approvalStatus === "skipped").length;
  const totalReviewPending = targets.filter((t) => t.approvalStatus === "pending").length;
  const totalQueued = targets.filter((t) => t.approvalStatus === "queued").length;

  const filtered = targets.filter((t) => {
    if (filter === "all") return true;
    if (filter === "approved") return t.approvalStatus === "approved";
    if (filter === "pending") return t.approvalStatus === "pending";
    if (filter === "skipped") return t.approvalStatus === "skipped";
    return true;
  });

  async function executeApproved() {
    const approved = targets.filter((t) => t.approvalStatus === "approved");
    if (approved.length === 0) return;
    setExecuting(true);
    setExecMsg(null);
    let queued = 0;
    let failed = 0;
    for (const t of approved) {
      try {
        await api("/api/browser-tasks", {
          method: "POST",
          body: JSON.stringify({ type: "comment", url: t.url, content: t.editedDraft }),
        });
        updateTarget(t.id, { approvalStatus: "queued" });
        queued++;
      } catch {
        failed++;
      }
    }
    setExecMsg(
      failed === 0
        ? `${queued} comments queued for the browser agent.`
        : `${queued} queued, ${failed} failed.`
    );
    setExecuting(false);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Stage indicator */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24, alignItems: "center" }}>
        {(["import", "draft", "review"] as Stage[]).map((s, i) => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {i > 0 && <span style={{ color: "var(--border)" }}>›</span>}
            <button
              className={stage === s ? "" : "ghost"}
              style={{ padding: "6px 14px", fontSize: 13 }}
              onClick={() => targets.length > 0 && setStage(s)}
              disabled={s !== "import" && targets.length === 0}
            >
              {i + 1}. {s === "import" ? "Import" : s === "draft" ? "Draft" : "Review & Execute"}
            </button>
          </div>
        ))}
      </div>

      {/* ── Stage 1: Import ─────────────────────────────────────────────────── */}
      {stage === "import" && (
        <div>
          <div className="card">
            <h2>Import LinkedIn Posts</h2>
            <p className="sub">
              Paste up to 100 LinkedIn post URLs (one per line). Use the{" "}
              <strong>Cockpit</strong> bookmarklet to collect posts as you browse LinkedIn.
            </p>

            <label>Post URLs (one per line)</label>
            <textarea
              value={rawUrls}
              onChange={(e) => setRawUrls(e.target.value)}
              rows={10}
              placeholder={"https://www.linkedin.com/posts/johndoe_activity-...\nhttps://www.linkedin.com/posts/janedoe_activity-...\n..."}
              style={{ fontFamily: "ui-monospace, monospace", fontSize: 13 }}
            />
            {rawUrls.trim() && (
              <div style={{ fontSize: 12, color: "var(--muted)", margin: "4px 0 8px" }}>
                {parsed.length} valid URL{parsed.length !== 1 ? "s" : ""} detected
              </div>
            )}

            <label>Comment goal / style (optional, applies to all)</label>
            <input
              type="text"
              value={commentGoal}
              onChange={(e) => setCommentGoal(e.target.value)}
              placeholder='e.g. "Add a thoughtful AI insight" or "Ask a smart question"'
            />

            {importMsg && (
              <div
                className={`notice ${importMsg.includes("failed") ? "error" : "info"}`}
                style={{ marginTop: 12 }}
              >
                {importMsg}
              </div>
            )}

            <div className="btn-row" style={{ marginTop: 16 }}>
              <button onClick={importUrls} disabled={importing || parsed.length === 0 || !aiEnabled}>
                {importing ? (
                  <>
                    <span className="spin" /> Importing…
                  </>
                ) : (
                  `Import ${parsed.length} post${parsed.length !== 1 ? "s" : ""} →`
                )}
              </button>
            </div>

            {!aiEnabled && (
              <div className="notice warn" style={{ marginTop: 12 }}>
                Set <code>ANTHROPIC_API_KEY</code> to enable AI drafting.
              </div>
            )}
          </div>

          <div className="notice info" style={{ marginTop: 12, fontSize: 13 }}>
            <strong>Tip:</strong> Browse LinkedIn, collect posts you want to engage with using the
            Cockpit bookmarklet, then come back and paste the URLs here.
          </div>
        </div>
      )}

      {/* ── Stage 2: Draft ──────────────────────────────────────────────────── */}
      {stage === "draft" && (
        <div>
          <div className="card">
            <h2>Draft Comments</h2>
            <p className="sub">
              {targets.length} posts imported · {totalDrafted} drafted · {totalPending} pending
              {totalErrors > 0 && ` · ${totalErrors} errors`}
            </p>

            {/* Progress bar */}
            {drafting && (
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--muted)",
                    marginBottom: 6,
                  }}
                >
                  Drafting {draftIdx} of {targets.filter((t) => t.draftStatus === "pending" || t.draftStatus === "drafting").length + draftIdx - 1}…
                </div>
                <div
                  style={{
                    height: 6,
                    background: "var(--panel-2)",
                    borderRadius: 3,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      background: "var(--brand)",
                      borderRadius: 3,
                      width: `${(totalDrafted / targets.length) * 100}%`,
                      transition: "width 0.3s",
                    }}
                  />
                </div>
              </div>
            )}

            <div className="btn-row">
              {!drafting ? (
                <button
                  onClick={draftAll}
                  disabled={totalPending === 0 || !aiEnabled}
                >
                  {totalPending === 0
                    ? "All comments drafted ✓"
                    : `Draft ${totalPending} comment${totalPending !== 1 ? "s" : ""}`}
                </button>
              ) : (
                <button
                  className="danger"
                  onClick={() => {
                    cancelRef.current = true;
                  }}
                >
                  Stop
                </button>
              )}
              {totalDrafted > 0 && (
                <button onClick={() => setStage("review")}>
                  Review {totalDrafted} draft{totalDrafted !== 1 ? "s" : ""} →
                </button>
              )}
            </div>
          </div>

          {/* Target list with status */}
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            {targets.map((t) => (
              <div
                key={t.id}
                className="list-item"
                style={{ display: "flex", alignItems: "center", gap: 12 }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <a
                    href={t.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 13, wordBreak: "break-all" }}
                  >
                    {shortUrl(t.url, 80)}
                  </a>
                  {t.draftStatus === "drafted" && t.editedDraft && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--muted)",
                        marginTop: 4,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {t.editedDraft.slice(0, 100)}…
                    </div>
                  )}
                  {t.draftStatus === "error" && (
                    <div style={{ fontSize: 12, color: "var(--red)", marginTop: 4 }}>
                      {t.draftError}
                    </div>
                  )}
                </div>
                <div style={{ flexShrink: 0 }}>
                  {t.draftStatus === "pending" && (
                    <span className="pill draft">pending</span>
                  )}
                  {t.draftStatus === "drafting" && (
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>
                      <span className="spin" style={{ marginRight: 4 }} />
                      drafting…
                    </span>
                  )}
                  {t.draftStatus === "drafted" && (
                    <span className="pill published">drafted</span>
                  )}
                  {t.draftStatus === "error" && (
                    <span className="pill failed">error</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Stage 3: Review & Execute ────────────────────────────────────────── */}
      {stage === "review" && (
        <div>
          {/* Stats + filter bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 16,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", gap: 6 }}>
              {(
                [
                  ["all", `All ${targets.length}`],
                  ["approved", `Approved ${totalApproved}`],
                  ["pending", `Pending ${totalReviewPending}`],
                  ["skipped", `Skipped ${totalSkipped}`],
                ] as [ReviewFilter, string][]
              ).map(([f, label]) => (
                <button
                  key={f}
                  className={filter === f ? "" : "ghost"}
                  style={{ padding: "6px 12px", fontSize: 13 }}
                  onClick={() => setFilter(f)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div style={{ marginLeft: "auto" }}>
              <button
                onClick={executeApproved}
                disabled={executing || totalApproved === 0}
              >
                {executing ? (
                  <>
                    <span className="spin" /> Queueing…
                  </>
                ) : (
                  `Execute ${totalApproved} approved comment${totalApproved !== 1 ? "s" : ""}`
                )}
              </button>
            </div>
          </div>

          {execMsg && (
            <div
              className={`notice ${execMsg.includes("failed") ? "warn" : "info"}`}
              style={{ marginBottom: 12 }}
            >
              {execMsg}{" "}
              {totalQueued > 0 && (
                <span>
                  Run <code>npm run browser-agent</code> locally to post them.
                </span>
              )}
            </div>
          )}

          {/* Review cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {filtered.length === 0 && (
              <div style={{ color: "var(--muted)", fontSize: 14 }}>No items in this view.</div>
            )}
            {filtered.map((t) => (
              <ReviewCard
                key={t.id}
                target={t}
                onApprove={(draft) =>
                  updateTarget(t.id, { approvalStatus: "approved", editedDraft: draft })
                }
                onSkip={() => updateTarget(t.id, { approvalStatus: "skipped" })}
                onEdit={(draft) => updateTarget(t.id, { editedDraft: draft })}
                onUnskip={() => updateTarget(t.id, { approvalStatus: "pending" })}
              />
            ))}
          </div>

          <div className="btn-row" style={{ marginTop: 24 }}>
            <button className="ghost" onClick={() => setStage("draft")}>
              ← Back to Draft
            </button>
            <button
              onClick={executeApproved}
              disabled={executing || totalApproved === 0}
            >
              {executing ? <><span className="spin" /> Queueing…</> : `Execute ${totalApproved} approved`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Review card ───────────────────────────────────────────────────────────────

function ReviewCard({
  target,
  onApprove,
  onSkip,
  onEdit,
  onUnskip,
}: {
  target: BatchTarget;
  onApprove: (draft: string) => void;
  onSkip: () => void;
  onEdit: (draft: string) => void;
  onUnskip: () => void;
}) {
  const isApproved = target.approvalStatus === "approved";
  const isSkipped = target.approvalStatus === "skipped";
  const isQueued = target.approvalStatus === "queued";

  const borderColor = isApproved
    ? "var(--green)"
    : isSkipped
    ? "var(--border)"
    : isQueued
    ? "var(--brand)"
    : "var(--border)";

  return (
    <div
      style={{
        background: "var(--panel-2)",
        border: `1px solid ${borderColor}`,
        borderRadius: 10,
        padding: 16,
        opacity: isSkipped ? 0.55 : 1,
      }}
    >
      {/* URL + status */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <a
          href={target.url}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 13, flex: 1, minWidth: 0, wordBreak: "break-all" }}
        >
          {shortUrl(target.url, 90)}
        </a>
        {isApproved && <span className="pill approved">approved</span>}
        {isSkipped && <span className="pill dismissed">skipped</span>}
        {isQueued && <span className="pill published">queued ✓</span>}
        {!isApproved && !isSkipped && !isQueued && (
          <span className="pill pending">pending</span>
        )}
      </div>

      {/* Draft textarea */}
      {!isSkipped && (
        <textarea
          value={target.editedDraft}
          onChange={(e) => onEdit(e.target.value)}
          rows={3}
          disabled={isQueued}
          style={{ fontSize: 13, marginBottom: 8 }}
          placeholder="No draft — AI drafting may still be running."
        />
      )}

      {/* Actions */}
      {!isQueued && (
        <div className="btn-row">
          {!isApproved && !isSkipped && (
            <>
              <button
                style={{ background: "var(--green)" }}
                onClick={() => onApprove(target.editedDraft)}
                disabled={!target.editedDraft?.trim()}
              >
                ✓ Approve
              </button>
              <button className="ghost" onClick={onSkip}>
                Skip
              </button>
            </>
          )}
          {isApproved && (
            <button className="ghost" onClick={onSkip}>
              Un-approve
            </button>
          )}
          {isSkipped && (
            <button className="ghost" onClick={onUnskip}>
              Restore
            </button>
          )}
        </div>
      )}
    </div>
  );
}
