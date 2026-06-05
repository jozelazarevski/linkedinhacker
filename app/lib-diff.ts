"use client";

// Before/after diff + AI-tell detection for the humanize feature.
// Pure client-side: we already have both the original and rewritten text.

export type Seg = { type: "equal" | "del" | "ins"; text: string };

const TOKEN = /\s+|\w+|[^\w\s]/g;

function tokenize(s: string): string[] {
  return s.match(TOKEN) ?? [];
}

/** Word-level diff via LCS. Fine for short posts (≤ a few thousand tokens). */
export function wordDiff(before: string, after: string): Seg[] {
  const a = tokenize(before);
  const b = tokenize(after);
  const n = a.length;
  const m = b.length;

  // LCS length table.
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const raw: Seg[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      raw.push({ type: "equal", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      raw.push({ type: "del", text: a[i++] });
    } else {
      raw.push({ type: "ins", text: b[j++] });
    }
  }
  while (i < n) raw.push({ type: "del", text: a[i++] });
  while (j < m) raw.push({ type: "ins", text: b[j++] });

  // Merge consecutive segments of the same type.
  const out: Seg[] = [];
  for (const seg of raw) {
    const last = out[out.length - 1];
    if (last && last.type === seg.type) last.text += seg.text;
    else out.push({ ...seg });
  }
  return out;
}

// Curated AI-tell markers: [label, regex].
const TELL_PATTERNS: [string, RegExp][] = [
  ['"delve"', /\bdelv(?:e|es|ed|ing)\b/gi],
  ['"leverage" (verb)', /\bleverag(?:e|es|ed|ing)\b/gi],
  ['"unlock"', /\bunlock(?:s|ed|ing)?\b/gi],
  ['"game-changer"', /\bgame[- ]chang(?:er|ers|ing)\b/gi],
  ["\"in today's fast-paced world\"", /in today'?s fast[- ]paced world/gi],
  ['"testament to"', /\btestament to\b/gi],
  ["\"it's not just X, it's Y\"", /not just\b[\s\S]{0,60}?\bit'?s\b/gi],
  ['"cutting-edge"', /\bcutting[- ]edge\b/gi],
  ['"the landscape"', /\bthe landscape\b/gi],
  ['"seamless(ly)"', /\bseamless(?:ly)?\b/gi],
  ['"elevate"', /\belevat(?:e|es|ed|ing)\b/gi],
  ['"robust"', /\brobust\b/gi],
  ['"thrilled/excited to"', /\b(?:thrilled|excited) to\b/gi],
  ['"dive into / deep dive"', /\b(?:deep dive|div(?:e|ing) into)\b/gi],
  ['"realm"', /\brealm\b/gi],
  ['"tapestry"', /\btapestry\b/gi],
  ['"foster"', /\bfoster(?:s|ed|ing)?\b/gi],
  ['"underscore"', /\bunderscor(?:e|es|ed|ing)\b/gi],
  ['"pivotal"', /\bpivotal\b/gi],
  ['"in conclusion"', /\bin conclusion\b/gi],
  ['"navigate"', /\bnavigat(?:e|es|ed|ing)\b/gi],
  ['"resonate"', /\bresonat(?:e|es|ed|ing)\b/gi],
];

function count(re: RegExp, s: string): number {
  return (s.match(re) ?? []).length;
}

/** AI tells whose count dropped from before → after. */
export function removedTells(before: string, after: string): { label: string; n: number }[] {
  const out: { label: string; n: number }[] = [];
  for (const [label, re] of TELL_PATTERNS) {
    const nb = count(re, before);
    const na = count(re, after);
    if (nb > na) out.push({ label, n: nb - na });
  }
  return out;
}

/** AI tells currently present in a piece of text (for the publish safety check). */
export function detectTells(text: string): { label: string; n: number }[] {
  const out: { label: string; n: number }[] = [];
  for (const [label, re] of TELL_PATTERNS) {
    const n = count(re, text);
    if (n > 0) out.push({ label, n });
  }
  return out;
}

export function wordCount(s: string): number {
  return (s.match(/\w+/g) ?? []).length;
}
