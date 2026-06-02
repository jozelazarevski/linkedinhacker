// ─────────────────────────────────────────────────────────────────────────────
// A library of proven, value-first LinkedIn post frameworks.
//
// Each template has a `scaffold` (a fill-in-the-blanks starting point the user
// can edit directly) and an `aiBrief` (an instruction the AI uses to write a
// full draft in that framework's shape). These are writing structures — not
// engagement-bait gimmicks.
// ─────────────────────────────────────────────────────────────────────────────

export interface Template {
  id: string;
  name: string;
  emoji: string;
  description: string;
  scaffold: string;
  aiBrief: string;
}

export const TEMPLATES: Template[] = [
  {
    id: "lessons-learned",
    name: "Lessons learned",
    emoji: "🎓",
    description: "Share concrete takeaways from a real experience.",
    scaffold: `I spent [time/effort] doing [thing]. Here are [N] lessons I wish I'd known earlier:

1. [Lesson] — [one line of why it matters]
2. [Lesson] — [one line of why it matters]
3. [Lesson] — [one line of why it matters]

The one that changed everything: [the most important lesson].

What would you add?`,
    aiBrief:
      "Write a 'lessons learned' post: a brief setup of a real experience, then 3-5 numbered, specific lessons each with a short 'why it matters'. End with one standout lesson and a genuine question.",
  },
  {
    id: "contrarian",
    name: "Contrarian take",
    emoji: "🔥",
    description: "Challenge conventional wisdom — backed by reasoning.",
    scaffold: `Unpopular opinion: [common belief] is wrong.

Everyone says [conventional wisdom].

But here's what I've actually seen: [your evidence / experience].

[The nuance — when the common belief does or doesn't hold].

The takeaway: [what to do instead].`,
    aiBrief:
      "Write a contrarian-but-thoughtful post that challenges a common belief in the topic area. Back it with real reasoning or experience, acknowledge nuance, and give a constructive takeaway. Avoid being inflammatory or smug.",
  },
  {
    id: "story",
    name: "Story / narrative",
    emoji: "📖",
    description: "A short personal story with a professional lesson.",
    scaffold: `[A specific moment — set the scene in one line.]

[What happened — the tension or challenge.]

[The turning point.]

[What I learned, and why it matters to you.]`,
    aiBrief:
      "Write a short first-person narrative post: set a specific scene, build a small tension or challenge, reach a turning point, and close with a transferable professional lesson. Keep it human and specific, not generic.",
  },
  {
    id: "how-to",
    name: "How-to / framework",
    emoji: "🛠",
    description: "Teach a repeatable process or framework.",
    scaffold: `How to [achieve outcome] (the [N]-step process I use):

Step 1: [action] → [result]
Step 2: [action] → [result]
Step 3: [action] → [result]

Most people skip [the step people skip]. Don't.

Save this for next time you [situation].`,
    aiBrief:
      "Write an actionable how-to post teaching a clear, repeatable process or framework in the topic area. Use numbered steps with concrete actions and outcomes, and call out the step people commonly skip.",
  },
  {
    id: "myth-vs-reality",
    name: "Myth vs. reality",
    emoji: "⚖️",
    description: "Bust a common misconception with what's actually true.",
    scaffold: `Myth: [the misconception].
Reality: [what's actually true].

Why the myth persists: [reason].

What this means for you: [practical implication].`,
    aiBrief:
      "Write a 'myth vs reality' post that debunks a common misconception in the topic area, explains why the myth persists, and gives a practical implication. Be accurate and fair.",
  },
  {
    id: "before-after",
    name: "Before / after",
    emoji: "📈",
    description: "Show a transformation and the key change that drove it.",
    scaffold: `[Time ago], my [situation] looked like this:
- [pain point]
- [pain point]

Today:
- [improvement]
- [improvement]

The one change that made the difference: [the lever].

If you're stuck at the 'before', start here: [first step].`,
    aiBrief:
      "Write a before/after transformation post grounded in a realistic scenario for the topic. Contrast the 'before' pain points with 'after' improvements, name the single key change that drove it, and give the reader a first step.",
  },
  {
    id: "question",
    name: "Open question",
    emoji: "❓",
    description: "Spark genuine discussion with a real question.",
    scaffold: `A question I keep coming back to: [the question].

Here's my current thinking: [your view, briefly].

But I'm genuinely unsure about [the uncertainty].

How do you approach this?`,
    aiBrief:
      "Write a discussion-sparking post built around a genuine open question in the topic area. Share a brief honest perspective, name a real uncertainty, and invite others' views. Avoid manipulative 'comment below' engagement-bait.",
  },
  {
    id: "list-resources",
    name: "Curated list",
    emoji: "📚",
    description: "Share a useful, curated list of resources or tips.",
    scaffold: `[N] [resources/tools/tips] for [audience] that are actually worth your time:

1. [Item] — [why it's useful]
2. [Item] — [why it's useful]
3. [Item] — [why it's useful]

Which one's your favorite? Anything I missed?`,
    aiBrief:
      "Write a curated-list post of genuinely useful resources, tools, or tips for the audience in the topic area. Each item gets a one-line 'why it's useful'. Keep recommendations real and specific.",
  },
];

export function getTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
