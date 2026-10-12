"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/ui/logo";
import { GuestGuard } from "@/components/auth/guest-guard";
import { CipherWall } from "@/components/auth/cipher-wall";
import { ConnectionBanner, ConnectionStatusPill } from "@/components/ui/connection-banner";
import { SITE_DOMAIN } from "@/lib/site";

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
      <div className="flex min-h-dvh overflow-x-hidden bg-[var(--color-bg)] pt-safe pb-safe px-safe">
        {/* The vault as our servers see it. Always dark: it is a window onto
            ciphertext, not part of the themed UI. */}
        <aside className="sticky top-0 hidden h-dvh flex-col self-start overflow-hidden bg-[#05070a] lg:flex lg:w-[46%] xl:w-[44%]">
          <div
            aria-hidden
            className="pointer-events-none absolute -start-40 top-1/3 h-[560px] w-[560px] rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(34,211,238,0.06) 0%, transparent 65%)",
            }}
          />
          <div className="relative flex h-full flex-col px-12 py-10 xl:px-16">
            <Logo size="md" href="/" />

            <div className="mt-[9vh]">
              <h1 className="font-heading text-[clamp(2.75rem,4.4vw,4.25rem)] font-bold leading-[0.98] tracking-[-0.035em] text-white">
                {heading}
              </h1>
              <p className="mt-5 max-w-[26rem] text-[17px] leading-relaxed text-zinc-400">{sub}</p>
            </div>

            <CipherWall className="-me-16 mt-auto pt-10 [@media(max-height:760px)]:hidden" />

            <p className="mt-8 text-xs text-zinc-600">
              {SITE_DOMAIN} &mdash; {t("brandFooter")}
            </p>
          </div>
        </aside>

        <main className="relative flex flex-1 flex-col items-center justify-center px-5 py-24 sm:px-10">
          <div className="absolute start-5 top-6 lg:hidden">
            <Logo size="sm" href="/" />
          </div>

          <div className="w-full max-w-[23rem]">
            <ConnectionBanner variant="inline" />
            <div className="mb-8 lg:hidden">
              <h1 className="font-heading text-[2rem] font-bold leading-tight tracking-[-0.03em] text-[var(--color-text)]">
                {heading}
              </h1>
              <p className="mt-1.5 text-sm text-[var(--color-text-muted)]">{sub}</p>
            </div>
            {children}
          </div>

          <div className="absolute inset-x-0 bottom-6 flex flex-col items-center gap-2">
            <ConnectionStatusPill />
            <p className="text-[11px] text-[var(--color-text-muted)] lg:hidden">
              <Link href="/" className="transition-colors hover:text-[var(--color-text-secondary)]">
                {SITE_DOMAIN}
              </Link>{" "}
              &mdash; {t("mobileFooter")}
            </p>
          </div>
        </main>
      </div>
    </GuestGuard>
  );
}
