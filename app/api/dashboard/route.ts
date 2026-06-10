import { NextResponse } from "next/server";
import { requireAccount } from "@/lib/api-helpers";
import { dashboardSummary } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAccount();
  if ("error" in auth) return auth.error;
  return NextResponse.json(await dashboardSummary(auth.account.id));
}
