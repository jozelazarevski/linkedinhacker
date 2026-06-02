import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { buildAuthUrl, isConfigured } from "@/lib/linkedin";
import { setOAuthState } from "@/lib/session";

export const dynamic = "force-dynamic";

// Kick off the LinkedIn OAuth flow.
export async function GET() {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "LinkedIn OAuth is not configured. See .env.example." },
      { status: 500 }
    );
  }
  const state = crypto.randomBytes(16).toString("hex");
  setOAuthState(state);
  return NextResponse.redirect(buildAuthUrl(state));
}
