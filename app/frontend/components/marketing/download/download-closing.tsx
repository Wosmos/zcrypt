"use client";

import { useTranslations } from "next-intl";
import { ClosingCta } from "@/components/marketing/landing/closing-cta";

export function DownloadClosing() {
  const t = useTranslations("site");
  return (
    <ClosingCta
      eyebrow={t("download.web.eyebrow")}
      title={t("download.web.heading")}
      subtext={t("download.web.body")}
      label={t("download.web.cta")}
    />
  );
}
