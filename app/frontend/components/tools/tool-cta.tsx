"use client";

import { useTranslations } from "next-intl";
import { ClosingCta } from "@/components/marketing/landing/closing-cta";

export function ToolCtaBlock({ base }: { base: string }) {
  const t = useTranslations();
  return (
    <ClosingCta
      title={t(`${base}.heading` as never)}
      subtext={t(`${base}.description` as never)}
      secondary={{ href: "/features", label: t("site.tools.seeFeatures") }}
    />
  );
}
