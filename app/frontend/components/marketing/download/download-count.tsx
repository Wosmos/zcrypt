import { Download } from "@/lib/icons";

/**
 * Total installs across every platform, shown on the download page.
 *
 * Below MIN_TO_SHOW this renders nothing: a proud "17 downloads" reads worse
 * than no number at all, and the counter switches itself on once the figure
 * actually helps. Fetched server-side so no client JS is spent on it, and a
 * failed or unreachable backend simply means no counter.
 */
const MIN_TO_SHOW = 100;

export async function DownloadCount() {
  const api = process.env.NEXT_PUBLIC_API_URL;
  if (!api) return null;

  let total = 0;
  try {
    const res = await fetch(`${api}/api/downloads/stats`, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const body = (await res.json()) as { total?: number };
    total = body.total ?? 0;
  } catch {
    return null;
  }

  if (total < MIN_TO_SHOW) return null;

  return (
    <p className="inline-flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
      <Download className="h-3.5 w-3.5" />
      <span>
        <strong className="font-semibold text-[var(--color-text)]">{total.toLocaleString()}</strong>{" "}
        downloads and counting
      </span>
    </p>
  );
}
