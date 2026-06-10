import { NextRequest, NextResponse } from "next/server";
import { requireAccount, jsonError } from "@/lib/api-helpers";
import { aiEnabled, generateHooks, type Voice } from "@/lib/ai";
import { getVoiceProfile, logEvent } from "@/lib/db";

export const dynamic = "force-dynamic";

// Generate voice-matched opening-line variants for a draft.
//   body: { draft, count? }  -> { hooks: HookVariant[] }
export async function POST(req: NextRequest) {
  const auth = await requireAccount();
  if ("error" in auth) return auth.error;
  if (!aiEnabled()) return jsonError("AI is disabled. Set ANTHROPIC_API_KEY.", 503);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body");
  }

  const draft = String(body.draft ?? "").trim();
  if (!draft) return jsonError("Write a draft first — I'll craft hooks for it.");

  const vp = await getVoiceProfile(auth.account.id);
  const voice: Voice | undefined = vp ? { samples: vp.samples, styleGuide: vp.style_guide } : undefined;

  try {
    const hooks = await generateHooks({ draft, voice, count: body.count });
    await logEvent(auth.account.id, "hooks_generated", { count: hooks.length });
    return NextResponse.json({ hooks });
  } catch (err: any) {
    return jsonError(String(err?.message ?? err), 502);
  }
}
