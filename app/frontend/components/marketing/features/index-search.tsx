"use client";

import { useTranslations } from "next-intl";
import DocsSearch from "@/components/docs/docs-search-modal";

export function FeaturesIndexSearch() {
  const t = useTranslations("site");
  return <DocsSearch placeholder={t("features.index.searchPlaceholder")} />;
}
