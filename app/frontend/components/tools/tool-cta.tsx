"use client";

import { useTranslations } from "next-intl";
import { ClosingCta } from "@/components/marketing/landing/closing-cta";

export function ToolCtaBlock({ base }: { base: string }) {
  const t = useTranslations("site");
  return (
    <ClosingCta
      title={t(`${base}.heading` as never)}
      subtext={t(`${base}.description` as never)}
      secondary={{ href: "/features", label: t("tools.seeFeatures") }}
    />
  );
}
