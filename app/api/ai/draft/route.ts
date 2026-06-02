import { NextRequest, NextResponse } from "next/server";
import { requireAccount, jsonError } from "@/lib/api-helpers";
import { aiEnabled, draftPosts, improvePost, humanizeText, type Voice } from "@/lib/ai";
import { getVoiceProfile } from "@/lib/db";

export const dynamic = "force-dynamic";

// Generate post drafts, improve one, or humanize one — all in the user's voice.
//   body: { topic, tone?, audience?, variations?, framework? }  -> { drafts: string[] }
//   body: { draft, instruction }                                -> { draft: string }
//   body: { humanize: string }                                  -> { draft: string }
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

  // Load the user's saved voice so everything sounds like them.
  const vp = getVoiceProfile(auth.account.id);
  const voice: Voice | undefined = vp
    ? { samples: vp.samples, styleGuide: vp.style_guide }
    : undefined;

  try {
    if (typeof body.humanize === "string") {
      const draft = await humanizeText(body.humanize, voice);
      return NextResponse.json({ draft });
    }

    if (typeof body.draft === "string" && typeof body.instruction === "string") {
      const draft = await improvePost(body.draft, body.instruction, voice);
      return NextResponse.json({ draft });
    }

    const topic = String(body.topic ?? "").trim();
    if (!topic) return jsonError("topic is required");
    const drafts = await draftPosts({
      topic,
      tone: body.tone,
      audience: body.audience,
      variations: body.variations,
      framework: typeof body.framework === "string" ? body.framework : undefined,
      voice,
    });
    return NextResponse.json({ drafts });
  } catch (err: any) {
    return jsonError(String(err?.message ?? err), 502);
  }
}
