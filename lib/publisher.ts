import { getAccountById, getPost, updatePost, logEvent, listDuePosts, type Post } from "./db";
import { publishTextPost } from "./linkedin";

// ─────────────────────────────────────────────────────────────────────────────
// Shared publishing logic, used both by the manual "Publish now" API route and
// by the background scheduler worker.
// ─────────────────────────────────────────────────────────────────────────────

export async function publishPostNow(postId: number): Promise<Post> {
  const post = getPost(postId);
  if (!post) throw new Error(`Post ${postId} not found`);

  const account = getAccountById(post.account_id);
  if (!account) throw new Error(`Account for post ${postId} not found`);

  if (account.expires_at <= Date.now()) {
    const updated = updatePost(postId, {
      status: "failed",
      error: "Access token expired — please sign in to LinkedIn again.",
    })!;
    throw new Error(updated.error!);
  }

  try {
    const result = await publishTextPost({
      accessToken: account.access_token,
      authorUrn: account.author_urn,
      commentary: post.commentary,
      visibility: post.visibility === "CONNECTIONS" ? "CONNECTIONS" : "PUBLIC",
    });

    const updated = updatePost(postId, {
      status: "published",
      published_at: Date.now(),
      linkedin_urn: result.urn || null,
      error: null,
    })!;
    logEvent(account.id, "post_published", { postId, urn: result.urn });
    return updated;
  } catch (err: any) {
    const updated = updatePost(postId, {
      status: "failed",
      error: String(err?.message ?? err),
    })!;
    logEvent(account.id, "post_publish_failed", { postId, error: updated.error });
    throw err;
  }
}

/** Publish every scheduled post whose time has arrived. Returns a summary. */
export async function runDuePosts(now = Date.now()): Promise<{
  attempted: number;
  published: number;
  failed: number;
}> {
  const due = listDuePosts(now);
  let published = 0;
  let failed = 0;

  for (const post of due) {
    try {
      await publishPostNow(post.id);
      published++;
    } catch {
      failed++;
    }
  }

  return { attempted: due.length, published, failed };
}
