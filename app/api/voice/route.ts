import { NextRequest, NextResponse } from "next/server";
import { requireAccount, jsonError } from "@/lib/api-helpers";
import { getVoiceProfile, saveVoiceProfile, logEvent } from "@/lib/db";
import { aiEnabled, analyzeVoice } from "@/lib/ai";

export const dynamic = "force-dynamic";

// Get the signed-in user's voice profile.
export async function GET() {
  const auth = requireAccount();
  if ("error" in auth) return auth.error;
  const profile = getVoiceProfile(auth.account.id);
  return NextResponse.json({
    profile: profile
      ? { samples: profile.samples, styleGuide: profile.style_guide, updatedAt: profile.updated_at }
      : null,
  });
}

// Save writing samples; (re)analyze them into a style guide when AI is enabled.
//   body: { samples: string }
export async function POST(req: NextRequest) {
  const auth = requireAccount();
  if ("error" in auth) return auth.error;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body");
  }

  const samples = String(body.samples ?? "").trim();
  if (!samples) return jsonError("Paste at least one of your own posts as a sample.");

  let styleGuide: string | null = null;
  if (aiEnabled()) {
    try {
      styleGuide = await analyzeVoice(samples);
    } catch (e: any) {
      // Save samples even if analysis fails; few-shot still works.
      styleGuide = null;
    }
  }

  const profile = saveVoiceProfile({
    account_id: auth.account.id,
    samples,
    style_guide: styleGuide,
  });
  logEvent(auth.account.id, "voice_saved");

  return NextResponse.json({
    profile: { samples: profile.samples, styleGuide: profile.style_guide, updatedAt: profile.updated_at },
  });
}
