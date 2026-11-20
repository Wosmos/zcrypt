import { revalidatePath, revalidateTag } from "next/cache";
import { RELEASE_CACHE_TAG } from "@/lib/releases";

// Called by the release workflow once a release is published, so the download
// page shows it right away instead of after the one-day safety revalidate.
// Web only (.web.tsx): the native static export has no server.

function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function POST(request: Request): Response {
  const secret = process.env.RELEASE_HOOK_SECRET;
  if (!secret) return Response.json({ error: "release hook not configured" }, { status: 503 });
  const auth = request.headers.get("authorization") ?? "";
  if (!sameSecret(auth, `Bearer ${secret}`)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  revalidateTag(RELEASE_CACHE_TAG, { expire: 0 });
  revalidatePath("/download");
  return Response.json({ revalidated: true });
}
