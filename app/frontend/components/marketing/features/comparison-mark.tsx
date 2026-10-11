"use client";

import { useTranslations } from "next-intl";
import { Check, X } from "@/lib/icons";

export function ComparisonMark({ good }: { good: boolean }) {
  const t = useTranslations("site.vs.common");
  return good ? (
    <Check className="vs-ck vs-ck-yes" strokeWidth={2.5} role="img" aria-label={t("yes")} />
  ) : (
    <X className="vs-ck vs-ck-no" strokeWidth={2} role="img" aria-label={t("no")} />
  );
}
