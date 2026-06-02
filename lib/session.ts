import { cookies } from "next/headers";
import crypto from "node:crypto";
import { getAccountById, type Account } from "./db";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal stateless session: a signed cookie containing the account id.
// The cookie value is `${accountId}.${hmac}` so it cannot be forged without the
// SESSION_SECRET. Tokens themselves never leave the server / database.
// ─────────────────────────────────────────────────────────────────────────────

const COOKIE_NAME = "lgs_session";

function secret(): string {
  return process.env.SESSION_SECRET || "insecure-dev-secret-change-me";
}

function sign(value: string): string {
  return crypto.createHmac("sha256", secret()).update(value).digest("hex");
}

export function setSession(accountId: number): void {
  const value = String(accountId);
  const token = `${value}.${sign(value)}`;
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
}

export function clearSession(): void {
  cookies().delete(COOKIE_NAME);
}

export async function getSessionAccount(): Promise<Account | null> {
  const raw = cookies().get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const [value, mac] = raw.split(".");
  if (!value || !mac) return null;
  const expected = sign(value);
  // constant-time comparison
  if (
    mac.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
  ) {
    return null;
  }
  const id = Number(value);
  if (!Number.isInteger(id)) return null;
  return (await getAccountById(id)) ?? null;
}

/** OAuth state token (CSRF protection) stored in a short-lived cookie. */
const STATE_COOKIE = "lgs_oauth_state";

export function setOAuthState(state: string): void {
  cookies().set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600, // 10 minutes
  });
}

export function consumeOAuthState(): string | null {
  const val = cookies().get(STATE_COOKIE)?.value ?? null;
  cookies().delete(STATE_COOKIE);
  return val;
}
