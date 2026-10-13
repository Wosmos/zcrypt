"use client";

import { useTranslations } from "next-intl";
import { Logo } from "@/components/ui/logo";
import { GrainLayers } from "@/components/ui/grain-background";
import { DrivePreview } from "@/components/auth/drive-preview";
import { Eye, Lock, Shield } from "@/lib/icons";

const TRUST = [
  { icon: Lock, key: "zkTitle" },
  { icon: Shield, key: "securityTitle" },
  { icon: Eye, key: "openTitle" },
] as const;

/** The large-screen brand side of the sign-in pages: the brand light with
 *  film grain, the page's heading, a still preview of the vault, and the
 *  three promises. */
export function AuthPanel({ heading, sub }: { heading: string; sub: string }) {
  const t = useTranslations("auth.features");
  return (
    <aside className="relative hidden min-h-0 overflow-hidden bg-[#04080c] lg:flex lg:flex-col">
      <GrainLayers />
      <div className="relative flex min-h-0 flex-1 flex-col p-10 xl:p-12 [@media(max-height:760px)]:py-7">
        <Logo size="md" href="/" />
        <div className="my-auto py-8">
          <h2 className="font-heading text-[clamp(2rem,min(3.2vw,5.4vh),3rem)] font-bold leading-[1.06] tracking-[-0.03em] text-white">
            {heading}
          </h2>
          <p className="mt-3 max-w-md text-base leading-relaxed text-white/75">{sub}</p>
          <div className="mt-8 max-w-[26rem] [@media(max-height:720px)]:hidden">
            <DrivePreview />
          </div>
        </div>
        <ul className="flex flex-wrap gap-2">
          {TRUST.map(({ icon: Icon, key }) => (
            <li
              key={key}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white/80 backdrop-blur-md"
            >
              <Icon className="h-3.5 w-3.5 text-cyan-300" aria-hidden />
              {t(key)}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
