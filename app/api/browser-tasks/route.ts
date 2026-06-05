import { NextRequest, NextResponse } from "next/server";
import { requireAccount } from "../../../lib/api-helpers";
import { listPendingBrowserTasks, createBrowserTask } from "../../../lib/db";
import { jsonError } from "../../../lib/api-helpers";

function agentAuthed(req: NextRequest): boolean {
  const key = process.env.AGENT_API_KEY;
  return Boolean(key && req.headers.get("x-agent-key") === key);
}

export async function GET(req: NextRequest) {
  if (!agentAuthed(req)) {
    const auth = await requireAccount();
    if ("error" in auth) return auth.error;
    const { account } = auth;
    const tasks = await listPendingBrowserTasks(account.id);
    return NextResponse.json({ tasks });
  }
  // Agent access — look up account by agent key (agent must send account_id header)
  const accountId = Number(req.headers.get("x-account-id"));
  if (!accountId) return jsonError("x-account-id header required", 400);
  const tasks = await listPendingBrowserTasks(accountId);
  return NextResponse.json({ tasks });
}

export async function POST(req: NextRequest) {
  if (!agentAuthed(req)) {
    const auth = await requireAccount();
    if ("error" in auth) return auth.error;
    const { account } = auth;
    const { type, url, content } = await req.json().catch(() => ({}));
    if (!type || !url) return jsonError("type and url are required");
    const task = await createBrowserTask({ account_id: account.id, type, url, content });
    return NextResponse.json({ task });
  }
  const accountId = Number(req.headers.get("x-account-id"));
  const { type, url, content } = await req.json().catch(() => ({}));
  if (!accountId || !type || !url) return jsonError("account_id, type and url required", 400);
  const task = await createBrowserTask({ account_id: accountId, type, url, content });
  return NextResponse.json({ task });
}
