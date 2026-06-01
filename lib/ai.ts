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

export interface Voice {
  samples?: string | null; // the user's own example posts
  styleGuide?: string | null; // distilled description of their style
}

export interface PostDraftOptions {
  topic: string;
  tone?: string; // e.g. "professional", "conversational", "bold"
  audience?: string; // e.g. "early-stage founders"
  variations?: number; // how many distinct drafts
  framework?: string; // optional structural brief from a template
  voice?: Voice; // optional: write in the user's own voice
}

// Tells of generic AI prose to actively avoid, so drafts read human.
const AI_TELLS =
  "Avoid AI-cliché phrasing and structure: no 'in today's fast-paced world', 'delve', 'navigate the landscape', " +
  "'game-changer', 'unlock', 'leverage' (as a verb), 'testament to', 'it's not just X, it's Y' constructions, " +
  "robotic three-part lists with identical rhythm, overuse of em-dashes, hollow motivational sign-offs, " +
  "and emoji sprinkled at the start of every line. Write like a specific human, not a content engine.";

/** Builds the system addendum that makes the model write in the user's voice. */
function voicePrompt(voice?: Voice): string {
  if (!voice || (!voice.samples && !voice.styleGuide)) {
    return `Write in a natural, human voice. ${AI_TELLS}`;
  }
  const parts = [
    "You are writing in the USER'S OWN voice. Match their style closely:",
    "sentence length and rhythm, vocabulary, level of formality, punctuation habits,",
    "capitalization, formatting, and how (or whether) they use emoji and hashtags.",
    "The goal is that a reader who knows them would believe they wrote it themselves.",
    AI_TELLS,
  ];
  if (voice.styleGuide) {
    parts.push(`\nTheir style, summarized:\n${voice.styleGuide}`);
  }
  if (voice.samples) {
    parts.push(
      `\nHere are real posts they wrote — imitate this voice, not the topics:\n"""\n${voice.samples}\n"""`
    );
  }
  return parts.join(" ");
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
    "\n\n" + voicePrompt(opts.voice),
  ].join(" ");

  const user = [
    `Write ${n} distinct LinkedIn post drafts.`,
    `Topic: ${opts.topic}`,
    opts.tone ? `Tone: ${opts.tone}` : "",
    opts.audience ? `Target audience: ${opts.audience}` : "",
    opts.framework ? `Structure each draft as follows: ${opts.framework}` : "",
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
export async function improvePost(
  draft: string,
  instruction: string,
  voice?: Voice
): Promise<string> {
  const msg = await client().messages.create({
    model: MODEL,
    max_tokens: 1500,
    system:
      "You are an expert LinkedIn editor. Improve the user's post per their instruction while keeping their authentic voice. Return only the revised post.\n\n" +
      voicePrompt(voice),
    messages: [
      {
        role: "user",
        content: `Instruction: ${instruction}\n\nPost:\n${draft}`,
      },
    ],
  });
  return textOf(msg);
}

/**
 * Rewrite AI-sounding (or any) text so it reads like the user wrote it. If a
 * voice profile is provided, it matches that specific voice; otherwise it just
 * strips the robotic AI tells and makes it sound like a real person.
 */
export async function humanizeText(text: string, voice?: Voice): Promise<string> {
  const msg = await client().messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: [
      "You rewrite text so it reads as genuinely human-written, never AI-generated.",
      "Preserve the meaning, facts, and intent. Keep roughly the same length.",
      "Strip every trace of generic AI prose and make it sound like a real person talking.",
      AI_TELLS,
      "\n" + voicePrompt(voice),
      "\nReturn only the rewritten text.",
    ].join(" "),
    messages: [{ role: "user", content: text }],
  });
  return textOf(msg);
}

/**
 * Analyze the user's example posts and produce a concise, reusable style guide
 * describing their voice. Stored and reused to keep all generation on-voice.
 */
export async function analyzeVoice(samples: string): Promise<string> {
  const msg = await client().messages.create({
    model: MODEL,
    max_tokens: 700,
    system:
      "You are a writing-style analyst. Read the sample posts and describe the author's voice as a concise, " +
      "actionable style guide another writer could follow. Cover: typical sentence length & rhythm, formality, " +
      "vocabulary & recurring phrases, punctuation/formatting habits, emoji & hashtag usage, opening-hook style, " +
      "and overall personality. Be specific and brief (bullet points). Do not quote the samples verbatim.",
    messages: [
      { role: "user", content: `Sample posts written by me:\n"""\n${samples}\n"""` },
    ],
  });
  return textOf(msg);
}

function textOf(msg: Anthropic.Message): string {
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
  voice?: Voice;
}): Promise<string> {
  const msg = await client().messages.create({
    model: MODEL,
    max_tokens: 400,
    system: [
      "You help a professional write genuine, value-adding comments on other people's LinkedIn posts.",
      "A good comment adds a specific insight, a relevant experience, or a thoughtful question —",
      "it is NOT generic praise ('Great post!'), flattery, or self-promotion.",
      "Keep it to 1-3 sentences, conversational, and authentic. Return only the comment text.",
      "\n" + voicePrompt(opts.voice),
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
