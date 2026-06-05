"use client";

import { wordDiff, removedTells, wordCount } from "../lib-diff";

// Before/after review for any humanize/rewrite action: word-level diff, the
// specific AI tells removed, and word-count delta, with accept/discard.
export default function HumanizeReview({
  before,
  after,
  onAccept,
  onDiscard,
  busy,
}: {
  before: string;
  after: string;
  onAccept: () => void;
  onDiscard: () => void;
  busy?: boolean;
}) {
  const segs = wordDiff(before, after);
  const tells = removedTells(before, after);
  const wb = wordCount(before);
  const wa = wordCount(after);

  return (
    <div className="list-item" style={{ marginTop: 14 }}>
      <div className="meta">
        <span className="pill approved">humanized — review</span>
        <span>
          {wb} → {wa} words ({wa - wb >= 0 ? "+" : ""}
          {wa - wb})
        </span>
      </div>

      <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Changes</div>
      <div className="body diff">
        {segs.map((s, i) =>
          s.type === "equal" ? (
            <span key={i}>{s.text}</span>
          ) : (
            <span key={i} className={s.type === "del" ? "diff-del" : "diff-ins"}>
              {s.text}
            </span>
          )
        )}
      </div>

      {tells.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>AI tells removed</div>
          <div className="template-grid">
            {tells.map((t) => (
              <span key={t.label} className="pill dismissed">
                {t.label}
                {t.n > 1 ? ` ×${t.n}` : ""}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="btn-row">
        <button onClick={onAccept} disabled={busy}>Use this version</button>
        <button className="ghost" onClick={onDiscard} disabled={busy}>Discard</button>
      </div>
    </div>
  );
}
