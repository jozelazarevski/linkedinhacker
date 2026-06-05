import { NextRequest, NextResponse } from "next/server";
import { requireAccount, jsonError } from "@/lib/api-helpers";
import { createTarget, listTargets } from "@/lib/db";

export const dynamic = "force-dynamic";

// Bulk-create engagement targets from a list of LinkedIn post URLs.
//   body: { urls: string[], commentGoal?: string }
// Already-existing URLs (for this account) are skipped.
export async function POST(req: NextRequest) {
  const auth = await requireAccount();
  if ("error" in auth) return auth.error;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body");
  }

  const rawUrls: unknown[] = Array.isArray(body.urls) ? body.urls : [];
  if (rawUrls.length === 0) return jsonError("urls array is required");
  if (rawUrls.length > 150) return jsonError("Maximum 150 URLs per batch");

  const commentGoal: string | undefined =
    typeof body.commentGoal === "string" && body.commentGoal.trim()
      ? body.commentGoal.trim()
      : undefined;

  // Deduplicate and validate
  const seen = new Set<string>();
  const validUrls: string[] = [];
  for (const u of rawUrls) {
    if (typeof u !== "string") continue;
    const trimmed = u.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    validUrls.push(trimmed);
  }

  if (validUrls.length === 0) return jsonError("No valid URLs found");

  // Skip URLs already in the database for this account
  const existing = await listTargets(auth.account.id);
  const existingUrls = new Set(existing.map((t) => t.url).filter(Boolean));

  const toCreate = validUrls.filter((u) => !existingUrls.has(u));
  const skipped = validUrls.length - toCreate.length;

  const created = [];
  for (const url of toCreate) {
    const target = await createTarget({
      account_id: auth.account.id,
      kind: "post",
      url,
      // Store commentGoal as note so the draft route can use it as intent
      note: commentGoal ?? null,
    });
    created.push(target);
  }

  return NextResponse.json({ created: created.length, skipped, targets: created });
}
