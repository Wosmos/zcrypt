"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

type Values = Record<string, string | number>;

const BASIC_TAGS = {
  b: (chunks: ReactNode) => <strong>{chunks}</strong>,
  strong: (chunks: ReactNode) => <strong>{chunks}</strong>,
  em: (chunks: ReactNode) => <em>{chunks}</em>,
  code: (chunks: ReactNode) => <code>{chunks}</code>,
  br: () => <br />,
};

/**
 * Translated text for server components, which can't call useTranslations.
 * `k` is the full message key. Inline markup in the message is limited to
 * <b>, <strong>, <em>, <code>, <br></br>, plus named links passed as
 * `links={{ docs: "/docs" }}` and written <docs>text</docs> in the message.
 */
export function T({
  k,
  values,
  links,
  linkClassName,
}: {
  k: string;
  values?: Values;
  links?: Record<string, string>;
  linkClassName?: string;
}) {
  const t = useTranslations();
  const linkTags = Object.fromEntries(
    Object.entries(links ?? {}).map(([name, href]) => [
      name,
      (chunks: ReactNode) =>
        href.startsWith("/") ? (
          <Link href={href} className={linkClassName}>
            {chunks}
          </Link>
        ) : (
          <a href={href} className={linkClassName} target="_blank" rel="noopener noreferrer">
            {chunks}
          </a>
        ),
    ]),
  );
  return <>{t.rich(k as never, { ...values, ...BASIC_TAGS, ...linkTags } as never)}</>;
}
