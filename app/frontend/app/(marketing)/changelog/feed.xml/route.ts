import enMessages from "@/messages/site/changelog/en.json";
import { CHANGE_KINDS, RELEASES } from "@/lib/changelog";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

type Entry = { title: string; summary: string; items: Record<string, string> };

const KIND_LABEL = { new: "New", improved: "Improved", fixed: "Fixed", security: "Security" };

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function GET() {
  const entries = enMessages.changelog as unknown as Record<string, Entry>;
  const items = RELEASES.filter((r) => r.date !== null)
    .map((r) => {
      const entry = entries[r.key];
      const url = `${SITE_URL}/changelog/${r.version}`;
      const body = CHANGE_KINDS.flatMap((kind) => {
        const group = r.groups.find((g) => g.kind === kind);
        if (!group?.items.length) return [];
        const list = group.items.map((k) => `<li>${escape(entry.items[k] ?? k)}</li>`).join("");
        return [`<h3>${KIND_LABEL[kind]}</h3><ul>${list}</ul>`];
      }).join("");
      return `<item>
  <title>${escape(`zcrypt ${r.version}: ${entry.title}`)}</title>
  <link>${url}</link>
  <guid isPermaLink="true">${url}</guid>
  <pubDate>${new Date(`${r.date}T12:00:00Z`).toUTCString()}</pubDate>
  <description><![CDATA[<p>${escape(entry.summary)}</p>${body}]]></description>
</item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>zcrypt changelog</title>
  <link>${SITE_URL}/changelog</link>
  <atom:link href="${SITE_URL}/changelog/feed.xml" rel="self" type="application/rss+xml" />
  <description>Every zcrypt version in plain words.</description>
  <language>en</language>
${items}
</channel>
</rss>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
