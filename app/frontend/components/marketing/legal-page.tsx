import type { ReactNode } from "react";
import Link from "next/link";
import { T } from "@/components/i18n/t";
import { ReadingPage, proseLink } from "@/components/marketing/prose";
import { ClosingCta } from "@/components/marketing/landing/closing-cta";

export function LegalPage({
  eyebrow,
  title,
  lead,
  seeAlso,
  children,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  lead: ReactNode;
  seeAlso: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <ReadingPage eyebrow={eyebrow} title={title} lede={lead} after={<ClosingCta />}>
      {children}
      <p className="mt-20 border-t border-[var(--color-border)] pt-8 text-sm text-[var(--color-text-secondary)]">
        <T k="site.chrome.seeAlso" />{" "}
        <Link href={seeAlso.href} className={proseLink}>
          {seeAlso.label}
        </Link>
      </p>
    </ReadingPage>
  );
}
