import { NextRequest, NextResponse } from "next/server";
import { requireAccount, jsonError } from "@/lib/api-helpers";
import { getEngagement, updateEngagement, logEvent } from "@/lib/db";

export const dynamic = "force-dynamic";

// Update a queued comment: edit the text or change status
// (pending | approved | dismissed | used).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAccount();
  if ("error" in auth) return auth.error;

  const id = Number(params.id);
  const eng = await getEngagement(id);
  if (!eng || eng.account_id !== auth.account.id) return jsonError("Not found", 404);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body");
  }

  const fields: Record<string, unknown> = {};
  if (typeof body.draftComment === "string") fields.draft_comment = body.draftComment;
  if (["pending", "approved", "dismissed", "used"].includes(body.status)) {
    fields.status = body.status;
    if (body.status === "approved" || body.status === "used") {
      await logEvent(auth.account.id, "comment_approved", { engagementId: id });
    }
  }

  const updated = await updateEngagement(id, fields as any);
  return NextResponse.json({ engagement: updated });
}
