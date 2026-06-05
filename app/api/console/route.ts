import { NextRequest, NextResponse } from "next/server";
import { requireAccount } from "../../../lib/api-helpers";
import {
  parseConsoleCommand,
  draftPosts,
  draftComment,
  type Voice,
} from "../../../lib/ai";
import {
  createPost,
  createEngagement,
  createBrowserTask,
  getVoiceProfile,
} from "../../../lib/db";
import { jsonError } from "../../../lib/api-helpers";

export async function POST(req: NextRequest) {
  const auth = await requireAccount();
  if ("error" in auth) return auth.error;
  const { account } = auth;

  const body = await req.json().catch(() => ({}));
  const { command, history = [] } = body as {
    command?: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  };

  if (!command?.trim()) return jsonError("command is required");

  const voiceRec = await getVoiceProfile(account.id);
  const voice: Voice | undefined = voiceRec
    ? { samples: voiceRec.samples, styleGuide: voiceRec.style_guide }
    : undefined;

  const parsed = await parseConsoleCommand(command, history, voice);

  switch (parsed.action) {
    case "create_post": {
      const drafts = await draftPosts({
        topic: parsed.topic || command,
        tone: parsed.tone,
        variations: 1,
        voice,
      });
      const draft = drafts[0] || "";
      const post = await createPost({
        account_id: account.id,
        commentary: draft,
        status: "draft",
      });
      return NextResponse.json({
        message: parsed.response,
        card: { type: "post_draft", postId: post.id, draft, published: false },
      });
    }

    case "comment_post": {
      if (!parsed.url) {
        return NextResponse.json({
          message:
            "I need a LinkedIn post URL to comment on. Please share the URL.",
        });
      }
      const comment = await draftComment({
        postText: parsed.commentGoal || parsed.topic || command,
        intent: parsed.commentGoal,
        voice,
      });
      const engagement = await createEngagement({
        account_id: account.id,
        source_url: parsed.url,
        source_text: parsed.commentGoal ?? undefined,
        draft_comment: comment,
      });
      return NextResponse.json({
        message: parsed.response,
        card: {
          type: "comment_draft",
          engagementId: engagement.id,
          url: parsed.url,
          comment,
          opened: false,
        },
      });
    }

    case "like_post": {
      if (!parsed.url) {
        return NextResponse.json({
          message:
            "I need a LinkedIn post URL to like. Please share the URL.",
        });
      }
      const task = await createBrowserTask({
        account_id: account.id,
        type: "like",
        url: parsed.url,
      });
      return NextResponse.json({
        message: parsed.response,
        card: {
          type: "browser_task",
          taskId: task.id,
          taskType: "like",
          url: parsed.url,
          status: "pending",
        },
      });
    }

    case "open_url": {
      return NextResponse.json({
        message: parsed.response,
        card: {
          type: "open_url",
          url: parsed.url || "https://www.linkedin.com",
        },
      });
    }

    case "clarify": {
      return NextResponse.json({
        message: parsed.clarifyQuestion || parsed.response,
      });
    }

    default: {
      return NextResponse.json({ message: parsed.response });
    }
  }
}
