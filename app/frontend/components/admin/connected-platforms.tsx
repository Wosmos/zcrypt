"use client";

import { useTranslations } from "next-intl";
import { PlatformIcon } from "@/components/icons/platform-icon";
import { PLATFORM_BY_ID, type PlatformId } from "@/lib/platforms";
import type { ConnectedPlatform } from "@/types";

function platformName(id: string) {
  return PLATFORM_BY_ID[id as PlatformId]?.name ?? id;
}

/** One line describing a connected account, for titles and exports. */
export function useConnectedPlatformLabel() {
  const t = useTranslations("admin.users");
  return (p: ConnectedPlatform) =>
    [
      platformName(p.platform),
      p.account,
      p.via === "app" ? t("viaApp") : t("viaWeb"),
      p.shared ? t("sharedToken") : "",
    ]
      .filter(Boolean)
      .join(" · ");
}

/** Brand icons for every platform a user connected, one per platform. */
export function PlatformIcons({ platforms }: { platforms: ConnectedPlatform[] }) {
  const t = useTranslations("admin.users");
  const label = useConnectedPlatformLabel();
  if (platforms.length === 0) {
    return <span className="text-xs text-[var(--color-text-muted)]">{t("noPlatforms")}</span>;
  }
  const byPlatform = new Map<string, ConnectedPlatform[]>();
  for (const p of platforms) byPlatform.set(p.platform, [...(byPlatform.get(p.platform) ?? []), p]);
  return (
    <span className="flex items-center gap-1.5">
      {[...byPlatform].map(([id, accounts]) => {
        const text = accounts.map(label).join("\n");
        return (
          <span key={id} title={text} className="inline-flex">
            <PlatformIcon platform={id} className="h-4 w-4" />
            <span className="sr-only">{text}</span>
          </span>
        );
      })}
    </span>
  );
}

/** Every connected account as a chip with its platform, account name and how it connects. */
export function PlatformChips({ platforms }: { platforms: ConnectedPlatform[] }) {
  const t = useTranslations("admin.users");
  if (platforms.length === 0) {
    return <span className="text-xs text-[var(--color-text-muted)]">{t("noPlatformsLong")}</span>;
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {platforms.map((p) => (
        <li
          key={`${p.platform}:${p.account}:${p.via}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-1)] py-1 ps-2 pe-2.5 text-xs"
        >
          <PlatformIcon platform={p.platform} className="h-3.5 w-3.5" />
          <span className="font-medium text-[var(--color-text)]">{platformName(p.platform)}</span>
          {p.account && <span className="text-[var(--color-text-secondary)]">{p.account}</span>}
          <span className="text-[var(--color-text-muted)]">
            · {p.via === "app" ? t("viaApp") : t("viaWeb")}
            {p.shared && ` · ${t("sharedToken")}`}
          </span>
        </li>
      ))}
    </ul>
  );
}
