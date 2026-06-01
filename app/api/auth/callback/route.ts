import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken, fetchUserInfo } from "@/lib/linkedin";
import { consumeOAuthState, setSession } from "@/lib/session";
import { upsertAccount, logEvent } from "@/lib/db";

export const dynamic = "force-dynamic";

// LinkedIn redirects back here with ?code & ?state after the user authorizes.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDesc = url.searchParams.get("error_description");

  const base = process.env.APP_BASE_URL || url.origin;

  if (error) {
    return NextResponse.redirect(
      `${base}/?auth_error=${encodeURIComponent(errorDesc || error)}`
    );
  }

  const expectedState = consumeOAuthState();
  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(`${base}/?auth_error=${encodeURIComponent("Invalid OAuth state")}`);
  }

  try {
    const token = await exchangeCodeForToken(code);
    const info = await fetchUserInfo(token.access_token);

    const account = upsertAccount({
      member_sub: info.sub,
      author_urn: `urn:li:person:${info.sub}`,
      name: info.name ?? ([info.given_name, info.family_name].filter(Boolean).join(" ") || null),
      email: info.email ?? null,
      picture: info.picture ?? null,
      access_token: token.access_token,
      expires_at: Date.now() + token.expires_in * 1000,
      scopes: token.scope ?? null,
    });

    setSession(account.id);
    logEvent(account.id, "signed_in");
    return NextResponse.redirect(`${base}/`);
  } catch (err: any) {
    return NextResponse.redirect(
      `${base}/?auth_error=${encodeURIComponent(String(err?.message ?? err))}`
    );
  }
}
