// ─── Site Search Index ────────────────────────────────────────
// Derived from `docsNav` and `featuresNav` (lib/data.ts) so search results
// can never drift from the actual docs/features pages. One entry per page;
// Fuse.js fuzzy-matches title, tags, and the page summary. Used by both the
// docs index inline search and the site-wide Cmd+K palette.

import { docsNav, featuresNav } from "@/lib/data";

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

const featuresEntries: SearchEntry[] = featuresNav.map((f) => ({
  title: f.title,
  section: "Features",
  content: f.desc,
  href: f.href,
  tags: tagsFor(f.title, "Features"),
}));

const docsEntries: SearchEntry[] = docsNav.flatMap((group) =>
  group.links.map((link) => ({
    title: link.title,
    section: group.title,
    content: link.desc,
    href: link.href,
    tags: tagsFor(link.title, group.title),
  }))
);

export const docsSearchIndex: SearchEntry[] = [...featuresEntries, ...docsEntries];

// ─── Search ───────────────────────────────────────────────────
// Predictable word-prefix matching (NOT fuzzy). A query term matches an entry
// only when some *word* in the entry starts with it — so "rust" matches
// "Rust-powered" but never "t[rust]ed" or "re[st]ore". Every query term must
// match somewhere; results rank title matches above tag/content matches.

function toWords(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function scoreEntry(entry: SearchEntry, terms: string[]): number {
  const titleWords = toWords(entry.title);
  const contentWords = toWords(entry.content);
  const sectionWords = toWords(entry.section);
  let total = 0;

  for (const term of terms) {
    let best = 0;
    if (titleWords.includes(term)) best = 10;
    else if (titleWords.some((w) => w.startsWith(term))) best = 6;
    if (best < 5 && entry.tags.includes(term)) best = 5;
    else if (best < 3 && entry.tags.some((w) => w.startsWith(term))) best = 3;
    if (best < 2 && contentWords.some((w) => w.startsWith(term))) best = 2;
    if (best < 1 && sectionWords.some((w) => w.startsWith(term))) best = 1;
    if (best === 0) return -1; // a term matched nothing -> exclude the entry
    total += best;
  }
  return total;
}

export function searchDocs(query: string, limit = 8): SearchEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  return docsSearchIndex
    .map((item) => ({ item, score: scoreEntry(item, terms) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.item);
}
