import { NextRequest, NextResponse } from "next/server";
import { requireAccount, jsonError } from "@/lib/api-helpers";
import { getTarget, updateTarget, deleteTarget } from "@/lib/db";

export const dynamic = "force-dynamic";

function own(id: number, accountId: number) {
  const t = getTarget(id);
  return t && t.account_id === accountId ? t : null;
}

// Edit a target: update draft text, notes, or status (todo|drafted|done|skipped).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireAccount();
  if ("error" in auth) return auth.error;

  const id = Number(params.id);
  if (!own(id, auth.account.id)) return jsonError("Not found", 404);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body");
  }

  const fields: Record<string, unknown> = {};
  if (typeof body.draft === "string") fields.draft = body.draft;
  if (typeof body.note === "string") fields.note = body.note;
  if (typeof body.context === "string") fields.context = body.context;
  if (typeof body.tags === "string") fields.tags = body.tags.trim() || null;
  if (Number.isFinite(Number(body.priority))) fields.priority = Number(body.priority);
  if (["todo", "drafted", "done", "skipped"].includes(body.status)) fields.status = body.status;

  const target = updateTarget(id, fields as any);
  return NextResponse.json({ target });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireAccount();
  if ("error" in auth) return auth.error;

  const id = Number(params.id);
  if (!own(id, auth.account.id)) return jsonError("Not found", 404);

  deleteTarget(id, auth.account.id);
  return NextResponse.json({ ok: true });
}
