import { buildLlmsTxt } from "@/lib/llms-txt";

// Serves /llm.txt — an alias of /llms.txt for the singular filename some tools
// and users expect. Content is shared via lib/llms-txt.
export const dynamic = "force-static";

export function GET(): Response {
  return new Response(buildLlmsTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
