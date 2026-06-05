import { NextRequest, NextResponse } from "next/server";
import { requireAccount, jsonError } from "@/lib/api-helpers";
import { createTarget, listTargets } from "@/lib/db";

export const dynamic = "force-dynamic";

function agentAuthed(req: NextRequest): boolean {
  const key = process.env.AGENT_API_KEY;
  return Boolean(key && req.headers.get("x-agent-key") === key);
}

/**
 * Bulk-create engagement targets.
 *
 * Accepts two formats:
 *   { urls: string[], commentGoal?: string }
 *     — plain URL list (no post text; AI will draft a generic comment)
 *
 *   { posts: Array<{ url: string; text: string }>, commentGoal?: string }
 *     — URL + post text captured from the feed (AI drafts topically relevant comment)
 *
 * Already-existing URLs for this account are skipped (no duplicates).
 * Agent calls must include x-agent-key and x-account-id headers.
 */
export async function POST(req: NextRequest) {
  let accountId: number;

  if (agentAuthed(req)) {
    accountId = Number(req.headers.get("x-account-id"));
    if (!accountId) return jsonError("x-account-id header required", 400);
  } else {
    const auth = await requireAccount();
    if ("error" in auth) return auth.error;
    accountId = auth.account.id;
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body");
  }

  // Normalise to [{url, text?}] regardless of input format
  type RawItem = { url: string; text?: string };
  let items: RawItem[] = [];

  if (Array.isArray(body.posts)) {
    // Rich format: [{url, text}]
    for (const p of body.posts) {
      if (typeof p?.url === "string" && p.url.trim()) {
        items.push({ url: p.url.trim(), text: typeof p.text === "string" ? p.text.trim() : undefined });
      }
    }
  } else if (Array.isArray(body.urls)) {
    // Plain URL list
    for (const u of body.urls) {
      if (typeof u === "string" && u.trim()) items.push({ url: u.trim() });
    }
  }

  if (items.length === 0) return jsonError("Provide urls or posts array");
  if (items.length > 150) return jsonError("Maximum 150 items per batch");

  const commentGoal: string | undefined =
    typeof body.commentGoal === "string" && body.commentGoal.trim()
      ? body.commentGoal.trim()
      : undefined;

  // Deduplicate within the request
  const seen = new Set<string>();
  items = items.filter(({ url }) => {
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  });

  // Skip URLs already stored for this account
  const existing = await listTargets(accountId);
  const existingUrls = new Set(existing.map((t) => t.url).filter(Boolean));
  const toCreate = items.filter(({ url }) => !existingUrls.has(url));
  const skipped = items.length - toCreate.length;

  const created = [];
  for (const { url, text } of toCreate) {
    const target = await createTarget({
      account_id: accountId,
      kind: "post",
      url,
      // Store post text as context so AI can write a topically relevant comment
      context: text ?? null,
      // Store user's comment goal as note (used as intent during drafting)
      note: commentGoal ?? null,
    });
    created.push(target);
  }

  return NextResponse.json({ created: created.length, skipped, targets: created });
}
