import type { ReactNode } from "react";
import Link from "next/link";
import { ReadingPage, proseLink } from "@/components/marketing/prose";
import { ClosingCta } from "@/components/marketing/landing/closing-cta";

export function LegalPage({
  eyebrow,
  title,
  lead,
  seeAlso,
  children,
}: {
  eyebrow: string;
  title: string;
  lead: ReactNode;
  seeAlso: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <ReadingPage eyebrow={eyebrow} title={title} lede={lead} after={<ClosingCta />}>
      {children}
      <p className="mt-20 border-t border-[var(--color-border)] pt-8 text-sm text-[var(--color-text-secondary)]">
        See also:{" "}
        <Link href={seeAlso.href} className={proseLink}>
          {seeAlso.label}
        </Link>
      </p>
    </ReadingPage>
  );
}
