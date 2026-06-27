// ─── Docs Search Index ──────────────────────────────────────
// Derived from `docsNav` (lib/data.ts) so search results can never drift from
// the actual docs. One entry per documentation page; Fuse.js fuzzy-matches
// title, tags, and the page summary.

import { docsNav } from "@/lib/data";

export interface SearchEntry {
  title: string;
  section: string;
  content: string;
  href: string;
  tags: string[];
}

const STOP = new Set(["the", "and", "your", "with", "for", "a", "an", "of", "to", "in", "&"]);

function tagsFor(title: string, section: string): string[] {
  return Array.from(
    new Set(
      `${title} ${section}`
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 1 && !STOP.has(w))
    )
  );
}

export const docsSearchIndex: SearchEntry[] = docsNav.flatMap((group) =>
  group.links.map((link) => ({
    title: link.title,
    section: group.title,
    content: link.desc,
    href: link.href,
    tags: tagsFor(link.title, group.title),
  }))
);
