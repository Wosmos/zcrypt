import { MarketingNav } from "@/components/marketing/nav";
import { MarketingFooter } from "@/components/marketing/footer";
import { CircuitBackground } from "@/components/ui/circuit-background";
import { GuestGuard } from "@/components/auth/guest-guard";
import { DesktopRedirect } from "@/components/guards/desktop-redirect";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DesktopRedirect>
      <GuestGuard>
        <CircuitBackground />
        <MarketingNav />
        <main id="main-content">{children}</main>
        <MarketingFooter />
      </GuestGuard>
    </DesktopRedirect>
  );
}
