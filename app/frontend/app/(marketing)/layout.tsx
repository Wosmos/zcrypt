import { MarketingNav } from "@/components/marketing/nav";
import { MarketingFooter } from "@/components/marketing/footer";
import { CircuitBackground } from "@/components/ui/circuit-background";
import { GuestGuard } from "@/components/auth/guest-guard";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <GuestGuard>
      <CircuitBackground />
      <MarketingNav />
      <main id="main-content">{children}</main>
      <MarketingFooter />
    </GuestGuard>
  );
}
