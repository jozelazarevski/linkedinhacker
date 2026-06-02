import { NextRequest, NextResponse } from "next/server";
import { requireAccount, jsonError } from "@/lib/api-helpers";
import { createTarget, listTargets, countEngagedToday } from "@/lib/db";

export const dynamic = "force-dynamic";

// List engagement targets + today's progress.
export async function GET() {
  const auth = requireAccount();
  if ("error" in auth) return auth.error;
  return NextResponse.json({
    targets: listTargets(auth.account.id),
    engagedToday: countEngagedToday(auth.account.id),
  });
}

// Add a target (a post to comment on, or a person to connect with).
//   body: { kind: 'post'|'person', url?, name?, context?, note? }
export async function POST(req: NextRequest) {
  const auth = requireAccount();
  if ("error" in auth) return auth.error;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body");
  }

  const kind = body.kind === "person" ? "person" : "post";
  if (!String(body.url ?? "").trim() && !String(body.context ?? "").trim()) {
    return jsonError("Provide at least a URL or some context for the target.");
  }

  const target = createTarget({
    account_id: auth.account.id,
    kind,
    url: body.url ?? null,
    name: body.name ?? null,
    context: body.context ?? null,
    note: body.note ?? null,
    tags: typeof body.tags === "string" ? body.tags.trim() || null : null,
    priority: Number.isFinite(Number(body.priority)) ? Number(body.priority) : 0,
  });
  return NextResponse.json({ target }, { status: 201 });
}
