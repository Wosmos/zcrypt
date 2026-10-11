"use client";

import { useTranslations } from "next-intl";
import { MarketingCard } from "@/components/marketing/ui/card";

export function RoleSteps({ base, count }: { base: string; count: number }) {
  const t = useTranslations("site");
  const label = t(`${base}.label` as never) as string;
  return (
    <MarketingCard as="div" size="sm" className="p-6 sm:p-7">
      <h3 className="pv2-h3 flex items-center gap-3">
        <span className="pv2-ic corner-squircle text-base font-bold" aria-hidden="true">
          {Array.from(label)[0]}
        </span>
        {label}
      </h3>
      <ol className="mt-5 space-y-3">
        {Array.from({ length: count }, (_, i) => (
          <li key={i} className="pv2-body flex gap-3">
            <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-1)] text-[10px] font-medium">
              {i + 1}
            </span>
            {t(`${base}.s${i + 1}` as never)}
          </li>
        ))}
      </ol>
    </MarketingCard>
  );
}
