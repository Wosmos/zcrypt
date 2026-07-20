import { CircuitBackground } from "@/components/ui/circuit-background";
import { GuestGuard } from "@/components/auth/guest-guard";
import { DesktopRedirect } from "@/components/guards/desktop-redirect";
import { DocsSearchProvider } from "@/components/docs/docs-search";
import { SiteChrome } from "@/components/layout/site-chrome";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DesktopRedirect>
      <GuestGuard>
        {/* Cmd+K search palette works everywhere — docs and features alike. */}
        <DocsSearchProvider>
          <CircuitBackground />
          <SiteChrome>{children}</SiteChrome>
        </DocsSearchProvider>
      </GuestGuard>
    </DesktopRedirect>
  );
}
