import { T } from "@/components/i18n/t";
import { Download } from "@/lib/icons";
import { cardSurface } from "@/components/marketing/ui/card";
import { PillLink } from "@/components/marketing/ui/pill-link";

export function ChangelogCta() {
  return (
    <div
      className={`${cardSurface} flex flex-col items-start justify-between gap-5 p-6 sm:flex-row sm:items-center sm:p-8`}
    >
      <div>
        <h2 className="font-[family-name:var(--font-heading)] text-xl font-bold tracking-tight text-[var(--color-text)]">
          <T k="changelog.page.getLatest" />
        </h2>
        <p className="mt-1.5 max-w-[52ch] text-[15px] leading-relaxed text-[var(--color-text-secondary)]">
          <T k="changelog.page.getLatestBody" />
        </p>
      </div>
      <PillLink href="/download" icon={Download} className="flex-none">
        <T k="changelog.page.download" />
      </PillLink>
    </div>
  );
}
