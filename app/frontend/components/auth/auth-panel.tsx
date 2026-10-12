"use client";

import { useTranslations } from "next-intl";
import { Logo } from "@/components/ui/logo";
import { GrainLayers } from "@/components/ui/grain-background";

/** The large-screen brand half of the sign-in pages: the site's lit gradient
 *  with film grain, the logo, and one line about what zcrypt is. */
export function AuthPanel({ mode }: { mode: "login" | "register" }) {
  const t = useTranslations(`auth.panel.${mode}`);
  return (
    <aside className="relative hidden min-h-0 overflow-hidden bg-[#04080c] lg:flex lg:flex-col">
      <GrainLayers />

      <div className="relative flex min-h-0 flex-1 flex-col p-10 xl:p-14 [@media(max-height:760px)]:p-8">
        <Logo size="md" href="/" />
        <div className="mt-auto max-w-lg">
          <h2 className="font-heading text-[clamp(1.9rem,min(3.4vw,5.6vh),3rem)] font-bold leading-[1.08] tracking-[-0.03em] text-white">
            {t("headline")}
          </h2>
          <p className="mt-4 max-w-md text-base leading-relaxed text-white/75">{t("sub")}</p>
        </div>
      </div>
    </aside>
  );
}
