import { NextRequest, NextResponse } from "next/server";
import { requireAccount, jsonError } from "@/lib/api-helpers";
import { getTarget, updateTarget, getVoiceProfile } from "@/lib/db";
import { aiEnabled, draftComment, draftCommentForUrl, type Voice } from "@/lib/ai";

export const dynamic = "force-dynamic";

/**
 * Draft a comment for a target in the Batch Engage workflow.
 *
 * - If the target has context (post text captured from the feed) →
 *   uses draftComment() for a topically relevant, in-voice comment.
 * - If no post text is available → falls back to draftCommentForUrl()
 *   which generates a strong starting point from the URL alone.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAccount();
  if ("error" in auth) return auth.error;
  if (!aiEnabled()) return jsonError("AI drafting is disabled. Set ANTHROPIC_API_KEY.", 503);

  const id = Number(params.id);
  const target = await getTarget(id);
  if (!target || target.account_id !== auth.account.id) return jsonError("Not found", 404);
  if (!target.url) return jsonError("Target has no URL");

  const vp = await getVoiceProfile(auth.account.id);
  const voice: Voice | undefined = vp
    ? { samples: vp.samples, styleGuide: vp.style_guide }
    : undefined;

  const postText = target.context?.trim();

  const draft = postText
    ? await draftComment({
        postText,
        intent: target.note ?? undefined,
        voice,
      })
    : await draftCommentForUrl({
        url: target.url,
        intent: target.note ?? undefined,
        voice,
      });

  const updated = await updateTarget(id, { draft, status: "drafted" });
  return NextResponse.json({ target: updated, hadPostText: Boolean(postText) });
}
