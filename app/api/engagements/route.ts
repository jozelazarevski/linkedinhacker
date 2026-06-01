import { NextRequest, NextResponse } from "next/server";
import { requireAccount, jsonError } from "@/lib/api-helpers";
import { createEngagement, listEngagements, logEvent, getVoiceProfile } from "@/lib/db";
import { aiEnabled, draftComment, type Voice } from "@/lib/ai";

export const dynamic = "force-dynamic";

// List the engagement (comment-reply) queue.
export async function GET() {
  const auth = requireAccount();
  if ("error" in auth) return auth.error;
  return NextResponse.json({ engagements: listEngagements(auth.account.id) });
}

// Draft a comment reply and add it to the human-approval queue.
//   body: { sourceText, sourceUrl?, intent? }
export async function POST(req: NextRequest) {
  const auth = requireAccount();
  if ("error" in auth) return auth.error;
  if (!aiEnabled()) return jsonError("AI drafting is disabled. Set ANTHROPIC_API_KEY.", 503);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body");
  }

  const sourceText = String(body.sourceText ?? "").trim();
  if (!sourceText) return jsonError("sourceText (the post you're replying to) is required");

  const vp = getVoiceProfile(auth.account.id);
  const voice: Voice | undefined = vp
    ? { samples: vp.samples, styleGuide: vp.style_guide }
    : undefined;

  try {
    const draft = await draftComment({ postText: sourceText, intent: body.intent, voice });
    const engagement = createEngagement({
      account_id: auth.account.id,
      source_text: sourceText,
      source_url: body.sourceUrl ?? null,
      draft_comment: draft,
    });
    logEvent(auth.account.id, "comment_drafted", { engagementId: engagement.id });
    return NextResponse.json({ engagement }, { status: 201 });
  } catch (err: any) {
    return jsonError(String(err?.message ?? err), 502);
  }
}
