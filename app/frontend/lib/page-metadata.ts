import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";

export function pageMetadata(opts: {
  title: string;
  description: string;
  path: string;
  absolute?: boolean;
  keywords?: string[];
  feedPath?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogType?: "website" | "article";
  twitterTitle?: string;
  twitterDescription?: string;
}): Metadata {
  const url = `${SITE_URL}${opts.path}`;
  const ogTitle = opts.ogTitle ?? (opts.absolute ? opts.title : `${opts.title} | zcrypt`);
  const ogDescription = opts.ogDescription ?? opts.description;
  return {
    title: opts.absolute ? { absolute: opts.title } : opts.title,
    description: opts.description,
    ...(opts.keywords && { keywords: opts.keywords }),
    alternates: {
      canonical: url,
      ...(opts.feedPath && { types: { "application/rss+xml": `${SITE_URL}${opts.feedPath}` } }),
    },
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      url,
      ...(opts.ogType && { type: opts.ogType }),
    },
    twitter: {
      card: "summary_large_image",
      title: opts.twitterTitle ?? ogTitle,
      description: opts.twitterDescription ?? ogDescription,
    },
  };
}
