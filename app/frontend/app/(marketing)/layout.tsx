import "@/components/marketing/landing/base.css";
import { CircuitBackground } from "@/components/ui/circuit-background";
import { DesktopRedirect } from "@/components/guards/desktop-redirect";
import { DocsSearchProvider } from "@/components/docs/docs-search";
import { SiteChrome } from "@/components/layout/site-chrome";
import { SiteI18nProvider } from "@/components/i18n/site-i18n-provider";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <SiteI18nProvider>
      <DesktopRedirect>
        {/* Cmd+K search palette works everywhere, docs and features alike. */}
        <DocsSearchProvider>
          <CircuitBackground />
          <SiteChrome>{children}</SiteChrome>
        </DocsSearchProvider>
      </DesktopRedirect>
    </SiteI18nProvider>
  );
}
