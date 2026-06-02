import { NextRequest, NextResponse } from "next/server";
import { requireAccount, jsonError } from "@/lib/api-helpers";
import { aiEnabled, generateWeeklyPlan, type Voice } from "@/lib/ai";
import { getVoiceProfile } from "@/lib/db";

export const dynamic = "force-dynamic";

// Generate a week of voice-matched post ideas with suggested days/times.
//   body: { themes, count?, audience? }  -> { plan: PlanIdea[] }
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

  const themes = String(body.themes ?? "").trim();
  if (!themes) return jsonError("Describe the themes/topics you want to cover.");

  const vp = getVoiceProfile(auth.account.id);
  const voice: Voice | undefined = vp ? { samples: vp.samples, styleGuide: vp.style_guide } : undefined;

  try {
    const plan = await generateWeeklyPlan({ themes, count: body.count, audience: body.audience, voice });
    return NextResponse.json({ plan });
  } catch (err: any) {
    return jsonError(String(err?.message ?? err), 502);
  }
}
