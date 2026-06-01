import { NextRequest, NextResponse } from "next/server";
import { requireAccount, jsonError } from "@/lib/api-helpers";
import { aiEnabled, draftPosts, improvePost } from "@/lib/ai";

export const dynamic = "force-dynamic";

// Generate post drafts, or improve an existing one.
//   body: { topic, tone?, audience?, variations? }
//     -> { drafts: string[] }
//   body: { draft, instruction }
//     -> { draft: string }
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

  try {
    if (typeof body.draft === "string" && typeof body.instruction === "string") {
      const draft = await improvePost(body.draft, body.instruction);
      return NextResponse.json({ draft });
    }

    const topic = String(body.topic ?? "").trim();
    if (!topic) return jsonError("topic is required");
    const drafts = await draftPosts({
      topic,
      tone: body.tone,
      audience: body.audience,
      variations: body.variations,
    });
    return NextResponse.json({ drafts });
  } catch (err: any) {
    return jsonError(String(err?.message ?? err), 502);
  }
}
