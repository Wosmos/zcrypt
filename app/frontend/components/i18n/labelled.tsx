"use client";

import { useTranslations } from "next-intl";
import type { ComponentPropsWithoutRef } from "react";

type Props<Tag extends "section" | "nav"> = { as: Tag; k: string } & Omit<
  ComponentPropsWithoutRef<Tag>,
  "aria-label"
>;

/**
 * A landmark element whose aria-label is translated, for server components
 * that can't call useTranslations. `k` is the full message key.
 */
export function Labelled<Tag extends "section" | "nav">({ as: Tag, k, ...rest }: Props<Tag>) {
  const t = useTranslations();
  const Element = Tag as "section";
  return <Element aria-label={t(k as never)} {...(rest as ComponentPropsWithoutRef<"section">)} />;
}
