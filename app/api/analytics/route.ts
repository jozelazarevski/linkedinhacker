import { NextResponse } from "next/server";
import { requireAccount } from "@/lib/api-helpers";
import { analyticsSummary } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAccount();
  if ("error" in auth) return auth.error;
  return NextResponse.json(await analyticsSummary(auth.account.id));
}
