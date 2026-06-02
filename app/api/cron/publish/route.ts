import { NextRequest, NextResponse } from "next/server";
import { runDuePosts } from "@/lib/publisher";

export const dynamic = "force-dynamic";

// Serverless-friendly replacement for the long-running worker.
// On Vercel this is invoked by a Cron Job (see vercel.json). Protected by
// CRON_SECRET so randoms can't trigger publishing.
//
// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically when
// the env var is set. You can also call it manually with ?key=<CRON_SECRET>.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    const key = new URL(req.url).searchParams.get("key");
    if (auth !== `Bearer ${secret}` && key !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await runDuePosts();
  return NextResponse.json({ ok: true, ...result, ranAt: new Date().toISOString() });
}
