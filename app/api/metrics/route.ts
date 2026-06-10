import { NextRequest, NextResponse } from "next/server";
import { requireAccount, jsonError } from "@/lib/api-helpers";
import { getPost, upsertPostMetrics, addFollowerSnapshot } from "@/lib/db";

export const dynamic = "force-dynamic";

// Record outcome metrics you read off LinkedIn.
//   body: { type: "post", postId, impressions?, reactions?, comments?, reposts? }
//   body: { type: "followers", followers }
export async function POST(req: NextRequest) {
  const auth = await requireAccount();
  if ("error" in auth) return auth.error;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body");
  }

  if (body.type === "followers") {
    const followers = Number(body.followers);
    if (!Number.isFinite(followers) || followers < 0) return jsonError("followers must be a non-negative number");
    await addFollowerSnapshot(auth.account.id, followers);
    return NextResponse.json({ ok: true });
  }

  if (body.type === "post") {
    const postId = Number(body.postId);
    const post = await getPost(postId);
    if (!post || post.account_id !== auth.account.id) return jsonError("Post not found", 404);
    await upsertPostMetrics({
      post_id: postId,
      impressions: Number(body.impressions) || 0,
      reactions: Number(body.reactions) || 0,
      comments: Number(body.comments) || 0,
      reposts: Number(body.reposts) || 0,
    });
    return NextResponse.json({ ok: true });
  }

  return jsonError("Unknown metric type");
}
