// ─────────────────────────────────────────────────────────────────────────────
// LinkedIn official API client.
//
// Uses only documented, sanctioned endpoints:
//   - OAuth 2.0 (3-legged) authorization code flow
//   - OpenID Connect /userinfo for member identity
//   - REST Posts API (/rest/posts) to publish on the authenticated member's behalf
//
// We deliberately do NOT scrape, automate liking/commenting on third-party
// content, or follow/unfollow — those violate LinkedIn's User Agreement and
// get accounts restricted or banned.
// ─────────────────────────────────────────────────────────────────────────────

const OAUTH_BASE = "https://www.linkedin.com/oauth/v2";
const API_BASE = "https://api.linkedin.com";

export interface LinkedInConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string;
  apiVersion: string;
}

export function getConfig(): LinkedInConfig {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "LinkedIn OAuth is not configured. Set LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET and LINKEDIN_REDIRECT_URI in .env.local"
    );
  }
  return {
    clientId,
    clientSecret,
    redirectUri,
    scopes: process.env.LINKEDIN_SCOPES || "openid profile email w_member_social",
    apiVersion: process.env.LINKEDIN_API_VERSION || "202401",
  };
}

export function isConfigured(): boolean {
  return Boolean(
    process.env.LINKEDIN_CLIENT_ID &&
      process.env.LINKEDIN_CLIENT_SECRET &&
      process.env.LINKEDIN_REDIRECT_URI
  );
}

/** Build the LinkedIn authorization URL the user is redirected to. */
export function buildAuthUrl(state: string): string {
  const cfg = getConfig();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    state,
    scope: cfg.scopes,
  });
  return `${OAUTH_BASE}/authorization?${params.toString()}`;
}

export interface TokenResponse {
  access_token: string;
  expires_in: number; // seconds
  scope?: string;
  token_type?: string;
  id_token?: string;
}

/** Exchange an authorization code for an access token. */
export async function exchangeCodeForToken(code: string): Promise<TokenResponse> {
  const cfg = getConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: cfg.redirectUri,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });

  const res = await fetch(`${OAUTH_BASE}/accessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }
  return (await res.json()) as TokenResponse;
}

export interface UserInfo {
  sub: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  picture?: string;
  email_verified?: boolean;
}

/** Fetch the authenticated member's identity via OpenID Connect. */
export async function fetchUserInfo(accessToken: string): Promise<UserInfo> {
  const res = await fetch(`${API_BASE}/v2/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`userinfo failed (${res.status}): ${text}`);
  }
  return (await res.json()) as UserInfo;
}

export interface PublishResult {
  urn: string; // e.g. urn:li:share:... from the x-restli-id header
}

/**
 * Publish a text post on the authenticated member's behalf using the official
 * Posts API. `authorUrn` must be `urn:li:person:{sub}`.
 */
export async function publishTextPost(opts: {
  accessToken: string;
  authorUrn: string;
  commentary: string;
  visibility?: "PUBLIC" | "CONNECTIONS";
  apiVersion?: string;
}): Promise<PublishResult> {
  const apiVersion = opts.apiVersion || process.env.LINKEDIN_API_VERSION || "202401";

  const payload = {
    author: opts.authorUrn,
    commentary: opts.commentary,
    visibility: opts.visibility || "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };

  const res = await fetch(`${API_BASE}/rest/posts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      "LinkedIn-Version": apiVersion,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Post publish failed (${res.status}): ${text}`);
  }

  // The created post URN is returned in the x-restli-id response header.
  const urn = res.headers.get("x-restli-id") || res.headers.get("x-linkedin-id") || "";
  return { urn };
}
