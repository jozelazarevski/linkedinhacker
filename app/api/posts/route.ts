import { NextRequest, NextResponse } from "next/server";
import { requireAccount, jsonError } from "@/lib/api-helpers";
import { createPost, listPosts } from "@/lib/db";

export const dynamic = "force-dynamic";

// List all posts for the signed-in account.
export async function GET() {
  const auth = requireAccount();
  if ("error" in auth) return auth.error;
  return NextResponse.json({ posts: listPosts(auth.account.id) });
}

// Create a draft, schedule, or publish-immediately post.
//   body: { commentary, visibility?, scheduledAt? (epoch ms), status? }
export async function POST(req: NextRequest) {
  const auth = requireAccount();
  if ("error" in auth) return auth.error;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body");
  }

  const commentary = String(body.commentary ?? "").trim();
  if (!commentary) return jsonError("commentary is required");
  if (commentary.length > 3000) return jsonError("commentary exceeds 3000 characters");

  const visibility = body.visibility === "CONNECTIONS" ? "CONNECTIONS" : "PUBLIC";

  let status = "draft";
  let scheduledAt: number | null = null;

  if (body.scheduledAt) {
    const t = Number(body.scheduledAt);
    if (!Number.isFinite(t)) return jsonError("scheduledAt must be an epoch ms timestamp");
    scheduledAt = t;
    status = "scheduled";
  }

  const post = createPost({
    account_id: auth.account.id,
    commentary,
    visibility,
    status,
    scheduled_at: scheduledAt,
  });

  return NextResponse.json({ post }, { status: 201 });
}
