import { NextRequest, NextResponse } from "next/server";
import { requireAccount, jsonError } from "@/lib/api-helpers";
import { aiEnabled, suggestNextPosts, type Voice } from "@/lib/ai";
import { getVoiceProfile, listPosts } from "@/lib/db";

export const dynamic = "force-dynamic";

// Suggest the user's next posts, informed by their voice and recent posts.
//   body: { count?, audience? }  -> { ideas: NextPostIdea[] }
export async function POST(req: NextRequest) {
  const auth = await requireAccount();
  if ("error" in auth) return auth.error;
  if (!aiEnabled()) return jsonError("AI is disabled. Set ANTHROPIC_API_KEY.", 503);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* optional body */
  }

  const vp = await getVoiceProfile(auth.account.id);
  const voice: Voice | undefined = vp ? { samples: vp.samples, styleGuide: vp.style_guide } : undefined;

  // Prefer published posts as context; fall back to any posts.
  const posts = await listPosts(auth.account.id);
  const published = posts.filter((p) => p.status === "published").map((p) => p.commentary);
  const recentPosts = (published.length ? published : posts.map((p) => p.commentary)).slice(0, 10);

  try {
    const ideas = await suggestNextPosts({
      voice,
      recentPosts,
      audience: body.audience,
      count: body.count,
    });
    return NextResponse.json({ ideas });
  } catch (err: any) {
    return jsonError(String(err?.message ?? err), 502);
  }
}
