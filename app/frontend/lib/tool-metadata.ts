/**
 * Build the Next.js `Metadata` for a marketing tool landing page (pad / send /
 * transfer), which all share one identical shape: title + description + keywords,
 * a canonical URL, an Open Graph block, and a summary_large_image Twitter card.
 * `path` (e.g. "/pad") drives both the canonical and OG url. `ogTitle` /
 * `ogDescription` default to the page title/description when omitted.
 */
import type { Metadata } from "next";

const SITE_ORIGIN = "https://zcrypt.cloud";

export function toolMetadata(opts: {
  title: string;
  description: string;
  keywords: string[];
  path: string;
  ogTitle?: string;
  ogDescription?: string;
}): Metadata {
  const url = `${SITE_ORIGIN}${opts.path}`;
  const ogTitle = opts.ogTitle ?? opts.title;
  const ogDescription = opts.ogDescription ?? opts.description;
  return {
    title: opts.title,
    description: opts.description,
    keywords: opts.keywords,
    alternates: { canonical: url },
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      url,
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: ogDescription,
    },
  };
}
