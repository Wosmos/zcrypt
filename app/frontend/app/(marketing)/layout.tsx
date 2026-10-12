import "@/components/marketing/landing/base.css";
import { GrainBackground } from "@/components/ui/grain-background";
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
          <GrainBackground />
          <SiteChrome>{children}</SiteChrome>
        </DocsSearchProvider>
      </DesktopRedirect>
    </SiteI18nProvider>
  );
}
