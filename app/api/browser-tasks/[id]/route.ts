import { NextRequest, NextResponse } from "next/server";
import { requireAccount } from "../../../../lib/api-helpers";
import { getBrowserTask, updateBrowserTask } from "../../../../lib/db";
import { jsonError } from "../../../../lib/api-helpers";

function agentAuthed(req: NextRequest): boolean {
  const key = process.env.AGENT_API_KEY;
  return Boolean(key && req.headers.get("x-agent-key") === key);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  const task = await getBrowserTask(id);
  if (!task) return jsonError("Not found", 404);

  if (!agentAuthed(req)) {
    const auth = await requireAccount();
    if ("error" in auth) return auth.error;
    const { account } = auth;
    if (task.account_id !== account.id) return jsonError("Not found", 404);
  }

  const { status, error } = await req.json().catch(() => ({}));
  const updated = await updateBrowserTask(id, { status, error });
  return NextResponse.json({ task: updated });
}
