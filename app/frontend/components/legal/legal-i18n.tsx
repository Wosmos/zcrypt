"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { LegalPage as BaseLegalPage } from "@/components/marketing/legal-page";
import { ProseSection as BaseProseSection } from "@/components/marketing/prose";

export function LegalPage({
  eyebrowK,
  titleK,
  leadK,
  seeAlso,
  children,
}: {
  eyebrowK: string;
  titleK: string;
  leadK: string;
  seeAlso: { href: string; label: string };
  children: ReactNode;
}) {
  const t = useTranslations();
  return (
    <BaseLegalPage
      eyebrow={t(eyebrowK as never)}
      title={t(titleK as never)}
      lead={
        <>
          {t(leadK as never)} {t("legal.bindingNote")}
        </>
      }
      seeAlso={{ href: seeAlso.href, label: t(seeAlso.label as never) }}
    >
      {children}
    </BaseLegalPage>
  );
}

export function ProseSection({
  id,
  eyebrowK,
  eyebrowValues,
  titleK,
  children,
}: {
  id: string;
  eyebrowK: string;
  eyebrowValues?: Record<string, string | number>;
  titleK: string;
  children: ReactNode;
}) {
  const t = useTranslations();
  return (
    <BaseProseSection
      id={id}
      eyebrow={t(eyebrowK as never, eyebrowValues as never)}
      title={t(titleK as never)}
    >
      {children}
    </BaseProseSection>
  );
}
