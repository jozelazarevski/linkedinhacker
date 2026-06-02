import { NextRequest, NextResponse } from "next/server";
import { requireAccount, jsonError } from "@/lib/api-helpers";
import { getTarget, listTargets, updateTarget, getVoiceProfile, type Target } from "@/lib/db";
import { aiEnabled, draftComment, draftConnectionNote, type Voice } from "@/lib/ai";

export const dynamic = "force-dynamic";

// Batch-draft voice-matched comments (for posts) and connection notes (for
// people) for the user's targets.
//   body: { id?: number }   -> draft just that target
//   body: {}                -> draft every 'todo' target with context (max 15)
export async function POST(req: NextRequest) {
  const auth = await requireAccount();
  if ("error" in auth) return auth.error;
  if (!aiEnabled()) return jsonError("AI drafting is disabled. Set ANTHROPIC_API_KEY.", 503);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty body = batch all */
  }

  const vp = await getVoiceProfile(auth.account.id);
  const voice: Voice | undefined = vp
    ? { samples: vp.samples, styleGuide: vp.style_guide }
    : undefined;

  let queue: Target[];
  if (body.id) {
    const t = await getTarget(Number(body.id));
    if (!t || t.account_id !== auth.account.id) return jsonError("Not found", 404);
    queue = [t];
  } else {
    queue = (await listTargets(auth.account.id))
      .filter((t) => t.status === "todo" && (t.context || "").trim())
      .slice(0, 15);
  }

  let drafted = 0;
  const errors: string[] = [];
  for (const t of queue) {
    if (!(t.context || "").trim()) {
      errors.push(`#${t.id}: needs context to draft from`);
      continue;
    }
    try {
      const draft =
        t.kind === "person"
          ? await draftConnectionNote({ personContext: t.context!, why: t.note ?? undefined, voice })
          : await draftComment({ postText: t.context!, intent: t.note ?? undefined, voice });
      await updateTarget(t.id, { draft, status: "drafted" });
      drafted++;
    } catch (e: any) {
      errors.push(`#${t.id}: ${String(e?.message ?? e)}`);
    }
  }

  return NextResponse.json({ drafted, attempted: queue.length, errors });
}
