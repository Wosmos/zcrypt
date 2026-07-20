"use client";

import { usePathname } from "next/navigation";
import { MarketingNav } from "@/components/marketing/nav";
import { MarketingFooter } from "@/components/marketing/footer";
import { DocsTopBar } from "@/components/docs/docs-topbar";
import { DocsFooter } from "@/components/docs/docs-footer";

/**
 * Docs pages get their own, simpler nav + footer instead of the marketing
 * site's mega-menu nav and full sitemap footer — a documentation reference
 * reads differently from a landing page. Everything else keeps the
 * marketing chrome.
 */
export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDocs = pathname?.startsWith("/docs") ?? false;

  if (isDocs) {
    return (
      <>
        <DocsTopBar />
        <main id="main-content">{children}</main>
        <DocsFooter />
      </>
    );
  }

  return (
    <>
      <MarketingNav />
      <main id="main-content">{children}</main>
      <MarketingFooter />
    </>
  );
}
