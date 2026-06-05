"use client";

import { detectTells } from "../lib-diff";

// Inline, non-blocking warning shown next to a draft that still reads
// AI-written — a nudge to Humanize before copying/posting it.
export default function TellHint({ text }: { text?: string | null }) {
  if (!text) return null;
  const tells = detectTells(text);
  if (!tells.length) return null;
  return (
    <div style={{ fontSize: 12, color: "var(--amber)", marginTop: 4 }}>
      ⚠ still reads AI-written ({tells.map((t) => t.label).join(", ")}) — Humanize before posting
    </div>
  );
}
