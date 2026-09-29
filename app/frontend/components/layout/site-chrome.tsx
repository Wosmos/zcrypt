"use client";

import { usePathname } from "next/navigation";
import { MarketingNav } from "@/components/marketing/nav";
import { MarketingFooter } from "@/components/marketing/footer";
import { DocsTopBar } from "@/components/docs/docs-topbar";
import { DocsFooter } from "@/components/docs/docs-footer";

/**
 * Docs pages get their own, simpler nav + footer instead of the marketing
 * site's mega-menu nav and full sitemap footer: a documentation reference
 * reads differently from a landing page. Everything else keeps the
 * marketing chrome.
 */
export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDocs = pathname?.startsWith("/docs") ?? false;

  if (isDocs) {
    return (
      <>
        <a
          href="#main-content"
          className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3 focus-visible:z-[100] focus-visible:rounded-full focus-visible:bg-[var(--color-surface)] focus-visible:px-4 focus-visible:py-2.5 focus-visible:text-sm focus-visible:font-semibold focus-visible:text-[var(--color-text)] focus-visible:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        >
          Skip to content
        </a>
        <DocsTopBar />
        <main id="main-content">{children}</main>
        <DocsFooter />
      </>
    );
  }

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3 focus-visible:z-[100] focus-visible:rounded-full focus-visible:bg-[var(--color-surface)] focus-visible:px-4 focus-visible:py-2.5 focus-visible:text-sm focus-visible:font-semibold focus-visible:text-[var(--color-text)] focus-visible:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
      >
        Skip to content
      </a>
      <MarketingNav />
      <main id="main-content" className="pv2">
        {children}
      </main>
      <MarketingFooter />
    </>
  );
}
