import { NextRequest, NextResponse } from "next/server";
import { requireAccount, jsonError } from "@/lib/api-helpers";
import { getTarget, updateTarget, getVoiceProfile } from "@/lib/db";
import { aiEnabled, draftCommentForUrl, type Voice } from "@/lib/ai";

export const dynamic = "force-dynamic";

// Draft a comment for a URL-only target (no post text needed).
// Used by the Batch Engage workflow.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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

  const draft = await draftCommentForUrl({
    url: target.url,
    intent: target.note ?? undefined,
    voice,
  });

  const updated = await updateTarget(id, { draft, status: "drafted" });
  return NextResponse.json({ target: updated });
}
