"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/ui/logo";
import { GuestGuard } from "@/components/auth/guest-guard";
import { CircuitBackground } from "@/components/ui/circuit-background";
import { Lock, Shield, Eye } from "@/lib/icons";
import { SITE_DOMAIN } from "@/lib/site";

const features = [
  { icon: Lock, titleKey: "zkTitle", descKey: "zkDesc" },
  { icon: Shield, titleKey: "securityTitle", descKey: "securityDesc" },
  { icon: Eye, titleKey: "openTitle", descKey: "openDesc" },
] as const;

const taglineKeys: Record<string, string> = {
  "/login": "login",
  "/register": "register",
  "/forgot-password": "forgot",
  "/reset-password": "reset",
  "/2fa-verify": "twoFa",
  "/magic-link": "magic",
  "/verify-email": "verify",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const t = useTranslations("auth");
  const tk = taglineKeys[pathname] ?? "fallback";
  const heading = t(`taglines.${tk}Heading`);
  const sub = t(`taglines.${tk}Sub`);

  return (
    <GuestGuard>
      <div className="flex min-h-dvh overflow-x-hidden pt-safe pb-safe px-safe">
        {/* ── Left brand panel (2.5/6) ── */}
        <div className="hidden lg:flex lg:w-[41.67%] flex-col relative bg-[rgba(5,5,7,0.92)] overflow-hidden">
          {/* Ambient glow, top-right cyan */}
          <div
            className="absolute -top-32 -end-48 w-[520px] h-[520px] rounded-full pointer-events-none"
            style={{
              background: "radial-gradient(circle, rgba(0,213,228,0.07) 0%, transparent 70%)",
            }}
          />
          {/* Ambient glow, bottom-left teal */}
          <div
            className="absolute -bottom-24 -start-36 w-[440px] h-[440px] rounded-full pointer-events-none"
            style={{
              background: "radial-gradient(circle, rgba(0,138,151,0.05) 0%, transparent 70%)",
            }}
          />

          {/* Noise texture */}
          <div
            className="absolute inset-0 opacity-[0.025] pointer-events-none"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
              backgroundSize: "128px 128px",
            }}
          />

          {/* Content */}
          <div className="relative flex flex-col flex-1 px-10 xl:px-12 py-10">
            {/* Logo */}
            <Logo size="md" href="/" />

            {/* Center tagline */}
            <div className="flex-1 flex flex-col justify-center -mt-6">
              <h2 className="text-3xl xl:text-4xl font-bold tracking-tight text-white font-heading leading-tight">
                {heading}
              </h2>
              <p className="text-[15px] text-zinc-400 mt-3 max-w-sm leading-relaxed">{sub}</p>

              {/* Trust features, minimal */}
              <div className="mt-12 space-y-4">
                {features.map((f) => (
                  <div key={f.titleKey} className="flex items-start gap-3">
                    <f.icon className="h-4 w-4 text-cyan-500/50 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[13px] font-medium text-white/80">
                        {t(`features.${f.titleKey}`)}
                      </p>
                      <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">
                        {t(`features.${f.descKey}`)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom tagline */}
            <p className="text-[11px] text-zinc-600">
              {SITE_DOMAIN} &mdash; {t("brandFooter")}
            </p>
          </div>

          {/* Right edge glow */}
          <div className="absolute end-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-cyan-500/20 to-transparent" />
        </div>

        {/* ── Right form panel (3.5/6) ── */}
        <div className="flex-1 lg:w-[58.33%] flex flex-col items-center justify-center px-6 sm:px-8 relative overflow-hidden lg:rounded-s-[2rem]">
          {/* Circuit background behind the form */}
          <div className="absolute inset-0 pointer-events-none">
            <CircuitBackground />
          </div>

          {/* Mobile-only logo */}
          <div className="lg:hidden absolute top-6 start-6 z-10">
            <Logo size="sm" href="/" />
          </div>

          <div className="w-full max-w-sm relative z-10">{children}</div>

          {/* Mobile bottom link */}
          <p className="lg:hidden absolute bottom-5 text-[11px] text-[var(--color-text-muted)]">
            <Link href="/" className="hover:text-[var(--color-text-secondary)] transition-colors">
              {SITE_DOMAIN}
            </Link>{" "}
            &mdash; {t("mobileFooter")}
          </p>
        </div>
      </div>
    </GuestGuard>
  );
}
