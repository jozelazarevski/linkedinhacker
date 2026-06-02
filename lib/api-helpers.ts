import { NextResponse } from "next/server";
import { getSessionAccount } from "./session";
import type { Account } from "./db";

/** Returns the signed-in account or a 401 response. */
export async function requireAccount(): Promise<{ account: Account } | { error: NextResponse }> {
  const account = await getSessionAccount();
  if (!account) {
    return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }
  return { account };
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
