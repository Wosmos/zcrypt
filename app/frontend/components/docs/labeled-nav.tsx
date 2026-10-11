"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

export function LabeledNav({
  labelKey,
  className,
  children,
}: {
  labelKey: "breadcrumb" | "pagination";
  className?: string;
  children: ReactNode;
}) {
  const t = useTranslations("docs.ui");
  return (
    <nav aria-label={t(labelKey)} className={className}>
      {children}
    </nav>
  );
}
