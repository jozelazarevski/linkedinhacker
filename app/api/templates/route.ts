import { NextResponse } from "next/server";
import { TEMPLATES } from "@/lib/templates";

// Public list of post frameworks for the Compose tab. (No auth needed — these
// are static writing structures, not user data.)
export async function GET() {
  return NextResponse.json({
    templates: TEMPLATES.map((t) => ({
      id: t.id,
      name: t.name,
      emoji: t.emoji,
      description: t.description,
      scaffold: t.scaffold,
      aiBrief: t.aiBrief,
    })),
  });
}
