import { NextRequest, NextResponse } from "next/server";
import { requireAccount, jsonError } from "@/lib/api-helpers";
import { getPost, updatePost, deletePost } from "@/lib/db";

export const dynamic = "force-dynamic";

async function ownPost(id: number, accountId: number) {
  const post = await getPost(id);
  if (!post || post.account_id !== accountId) return null;
  return post;
}

// Update a draft/scheduled post (edit text, reschedule, change visibility).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAccount();
  if ("error" in auth) return auth.error;

  const id = Number(params.id);
  const post = await ownPost(id, auth.account.id);
  if (!post) return jsonError("Post not found", 404);
  if (post.status === "published") return jsonError("Published posts cannot be edited", 409);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body");
  }

  const fields: Record<string, unknown> = {};
  if (typeof body.commentary === "string") {
    const c = body.commentary.trim();
    if (!c) return jsonError("commentary cannot be empty");
    fields.commentary = c;
  }
  if (body.visibility === "PUBLIC" || body.visibility === "CONNECTIONS") {
    fields.visibility = body.visibility;
  }
  if ("scheduledAt" in body) {
    if (body.scheduledAt === null) {
      fields.scheduled_at = null;
      fields.status = "draft";
    } else {
      const t = Number(body.scheduledAt);
      if (!Number.isFinite(t)) return jsonError("scheduledAt must be an epoch ms timestamp");
      fields.scheduled_at = t;
      fields.status = "scheduled";
    }
  }

  const updated = await updatePost(id, fields as any);
  return NextResponse.json({ post: updated });
}

// Delete a draft/scheduled post.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAccount();
  if ("error" in auth) return auth.error;

  const id = Number(params.id);
  const post = await ownPost(id, auth.account.id);
  if (!post) return jsonError("Post not found", 404);

  await deletePost(id, auth.account.id);
  return NextResponse.json({ ok: true });
}
