"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { GuestGuard } from "@/components/auth/guest-guard";
import { AuthPanel } from "@/components/auth/auth-panel";
import { useAuthScene } from "@/components/auth/auth-scene";
import { LogoIcon } from "@/components/ui/logo";
import { ConnectionBanner, ConnectionStatusPill } from "@/components/ui/connection-banner";

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
  const errorCount = useAuthScene((s) => s.errorCount);
  const form = useRef<HTMLDivElement>(null);

  // A wrong password nudges the form sideways once, alongside the error toast.
  useGSAP(
    () => {
      if (errorCount === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.fromTo(
        form.current,
        { x: -5 },
        { x: 5, duration: 0.05, repeat: 5, yoyo: true, ease: "none", clearProps: "x" },
      );
    },
    { dependencies: [errorCount] },
  );

  return (
    <GuestGuard>
      <div className="grid min-h-dvh bg-[var(--color-bg)] pt-safe pb-safe px-safe lg:grid-cols-2">
        <AuthPanel mode={pathname === "/register" ? "register" : "login"} />

        <main className="relative flex min-h-dvh flex-col items-center px-5 py-12 sm:px-10">
          <div className="my-auto w-full max-w-[23.5rem]">
            <span
              aria-hidden
              className="mx-auto mb-6 flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-[1.35rem] border border-[var(--color-border)] bg-[var(--color-surface-1)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_40px_-22px_rgba(0,213,228,0.55)] lg:hidden"
            >
              <LogoIcon size={36} hover={false} />
            </span>
            <div className="mb-7 text-center lg:text-start">
              <h1 className="font-heading text-[1.85rem] font-bold leading-tight tracking-[-0.025em] text-[var(--color-text)] lg:text-[2.1rem]">
                {t(`taglines.${tk}Heading`)}
              </h1>
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                {t(`taglines.${tk}Sub`)}
              </p>
            </div>
            <ConnectionBanner variant="inline" />
            <div ref={form}>{children}</div>
          </div>
          <ConnectionStatusPill className="mt-10 text-xs" />
        </main>
      </div>
    </GuestGuard>
  );
}
