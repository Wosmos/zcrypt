import { buildLlmsTxt } from "@/lib/llms-txt";

// Serves /llms.txt — the standard LLM-friendly overview (see llmstxt.org).
// Content is shared with /llm.txt via lib/llms-txt.
export const dynamic = "force-static";

export function GET(): Response {
  return new Response(buildLlmsTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
