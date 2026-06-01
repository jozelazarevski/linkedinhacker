import { NextRequest, NextResponse } from "next/server";
import { requireAccount, jsonError } from "@/lib/api-helpers";
import { getPost } from "@/lib/db";
import { publishPostNow } from "@/lib/publisher";

export const dynamic = "force-dynamic";

// Publish a post immediately via the official LinkedIn Posts API.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireAccount();
  if ("error" in auth) return auth.error;

  const id = Number(params.id);
  const post = getPost(id);
  if (!post || post.account_id !== auth.account.id) return jsonError("Post not found", 404);
  if (post.status === "published") return jsonError("Post is already published", 409);

  try {
    const updated = await publishPostNow(id);
    return NextResponse.json({ post: updated });
  } catch (err: any) {
    return jsonError(String(err?.message ?? err), 502);
  }
}
