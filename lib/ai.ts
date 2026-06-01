import Anthropic from "@anthropic-ai/sdk";

// ─────────────────────────────────────────────────────────────────────────────
// AI drafting via the Anthropic API. Used to:
//   - generate / improve LinkedIn post drafts
//   - draft thoughtful comment replies for HUMAN review (never auto-posted)
//
// If ANTHROPIC_API_KEY is unset, these functions throw a friendly error and the
// UI degrades gracefully (manual composing still works).
// ─────────────────────────────────────────────────────────────────────────────

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("AI drafting is disabled. Set ANTHROPIC_API_KEY in .env.local to enable it.");
  }
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

export interface PostDraftOptions {
  topic: string;
  tone?: string; // e.g. "professional", "conversational", "bold"
  audience?: string; // e.g. "early-stage founders"
  variations?: number; // how many distinct drafts
}

/** Generate one or more LinkedIn post drafts about a topic. */
export async function draftPosts(opts: PostDraftOptions): Promise<string[]> {
  const n = Math.min(Math.max(opts.variations ?? 3, 1), 5);
  const sys = [
    "You are an expert LinkedIn ghostwriter who helps professionals grow an authentic audience.",
    "Write posts that are genuinely valuable, specific, and human — not clickbait or engagement-bait.",
    "Guidelines: strong first line (the hook), short punchy paragraphs, concrete examples or a personal angle,",
    "a clear takeaway, and at most 3 relevant hashtags at the end. Avoid spammy phrasing, fake urgency,",
    "and 'comment X below' manipulation. Keep each post under 1,300 characters.",
  ].join(" ");

  const user = [
    `Write ${n} distinct LinkedIn post drafts.`,
    `Topic: ${opts.topic}`,
    opts.tone ? `Tone: ${opts.tone}` : "",
    opts.audience ? `Target audience: ${opts.audience}` : "",
    "",
    "Return ONLY the posts, each separated by a line containing exactly '---'. No preamble, no numbering.",
  ]
    .filter(Boolean)
    .join("\n");

  const msg = await client().messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: sys,
    messages: [{ role: "user", content: user }],
  });

  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  return text
    .split(/^\s*---\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Improve / rewrite an existing draft according to an instruction. */
export async function improvePost(draft: string, instruction: string): Promise<string> {
  const msg = await client().messages.create({
    model: MODEL,
    max_tokens: 1500,
    system:
      "You are an expert LinkedIn editor. Improve the user's post per their instruction while keeping their authentic voice. Return only the revised post.",
    messages: [
      {
        role: "user",
        content: `Instruction: ${instruction}\n\nPost:\n${draft}`,
      },
    ],
  });
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/**
 * Draft a thoughtful comment reply to someone else's post. This is for the
 * human-in-the-loop engagement queue: the user reviews/edits and posts it
 * themselves. We never auto-post to third-party content.
 */
export async function draftComment(opts: {
  postText: string;
  intent?: string; // e.g. "add a supportive insight", "ask a thoughtful question"
}): Promise<string> {
  const msg = await client().messages.create({
    model: MODEL,
    max_tokens: 400,
    system: [
      "You help a professional write genuine, value-adding comments on other people's LinkedIn posts.",
      "A good comment adds a specific insight, a relevant experience, or a thoughtful question —",
      "it is NOT generic praise ('Great post!'), flattery, or self-promotion.",
      "Keep it to 1-3 sentences, conversational, and authentic. Return only the comment text.",
    ].join(" "),
    messages: [
      {
        role: "user",
        content: [
          opts.intent ? `Goal of my comment: ${opts.intent}` : "Goal: add a genuinely useful perspective.",
          "",
          "The post I'm responding to:",
          opts.postText,
        ].join("\n"),
      },
    ],
  });
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
