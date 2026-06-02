import { NextResponse } from "next/server";
import { getSessionAccount } from "@/lib/session";
import { isConfigured } from "@/lib/linkedin";
import { aiEnabled } from "@/lib/ai";

export const dynamic = "force-dynamic";

// Returns the current session + capability flags for the UI.
export async function GET() {
  const account = await getSessionAccount();
  return NextResponse.json({
    configured: isConfigured(),
    aiEnabled: aiEnabled(),
    account: account
      ? {
          name: account.name,
          email: account.email,
          picture: account.picture,
          tokenExpiresAt: account.expires_at,
          tokenExpired: account.expires_at <= Date.now(),
        }
      : null,
  });
}
