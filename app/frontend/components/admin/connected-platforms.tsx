"use client";

import { useTranslations } from "next-intl";
import { PlatformIcon } from "@/components/icons/platform-icon";
import { PLATFORM_BY_ID, type PlatformId } from "@/lib/platforms";
import { cn } from "@/lib/utils";
import type { ConnectedPlatform } from "@/types";

function platformName(id: string) {
  return PLATFORM_BY_ID[id as PlatformId]?.name ?? id;
}

function split(platforms: ConnectedPlatform[]) {
  return {
    own: platforms.filter((p) => p.via !== "shared"),
    shared: platforms.filter((p) => p.via === "shared"),
  };
}

/** One line describing a connected account, for titles and exports. */
export function useConnectedPlatformLabel() {
  const t = useTranslations("admin.users");
  const via = { web: t("viaWeb"), app: t("viaApp"), shared: t("viaShared") };
  return (p: ConnectedPlatform) =>
    [platformName(p.platform), p.account, via[p.via], p.shared ? t("sharedToken") : ""]
      .filter(Boolean)
      .join(" · ");
}

/** The user's own platforms as brand icons, then a Shared pill if they also store on the admin's shared storage. */
export function PlatformIcons({ platforms }: { platforms: ConnectedPlatform[] }) {
  const t = useTranslations("admin.users");
  const label = useConnectedPlatformLabel();
  const { own, shared } = split(platforms);
  if (platforms.length === 0) {
    return <span className="text-xs text-[var(--color-text-muted)]">{t("noPlatforms")}</span>;
  }
  const byPlatform = new Map<string, ConnectedPlatform[]>();
  for (const p of own) byPlatform.set(p.platform, [...(byPlatform.get(p.platform) ?? []), p]);
  const sharedText = shared.map(label).join("\n");
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
      {shared.length > 0 && (
        <span
          title={sharedText}
          className="rounded-full border border-dashed border-[var(--color-border)] px-1.5 py-px text-[11px] text-[var(--color-text-muted)]"
        >
          {t("sharedPill")}
          <span className="sr-only">{sharedText}</span>
        </span>
      )}
    </span>
  );
}

function Chip({ p }: { p: ConnectedPlatform }) {
  const t = useTranslations("admin.users");
  const isShared = p.via === "shared";
  return (
    <li
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border py-1 ps-2 pe-2.5 text-xs",
        isShared
          ? "border-dashed border-[var(--color-border)] text-[var(--color-text-muted)]"
          : "border-[var(--color-border)] bg-[var(--color-surface-1)]",
      )}
    >
      <PlatformIcon platform={p.platform} className={cn("h-3.5 w-3.5", isShared && "opacity-60")} />
      <span className={cn("font-medium", !isShared && "text-[var(--color-text)]")}>
        {platformName(p.platform)}
      </span>
      {p.account && <span className="text-[var(--color-text-secondary)]">{p.account}</span>}
      {!isShared && (
        <span className="text-[var(--color-text-muted)]">
          · {p.via === "app" ? t("viaApp") : t("viaWeb")}
          {p.shared && ` · ${t("sharedToken")}`}
        </span>
      )}
    </li>
  );
}

/** The user's own accounts, then the admin's shared storage they use, as two labelled rows of chips. */
export function PlatformChips({ platforms }: { platforms: ConnectedPlatform[] }) {
  const t = useTranslations("admin.users");
  const { own, shared } = split(platforms);
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-xs font-medium text-[var(--color-text-secondary)]">
          {t("ownPlatforms")}
        </p>
        {own.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {own.map((p) => (
              <Chip key={`${p.platform}:${p.account}:${p.via}`} p={p} />
            ))}
          </ul>
        ) : (
          <p className="text-xs text-[var(--color-text-muted)]">{t("noPlatformsLong")}</p>
        )}
      </div>
      {shared.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-[var(--color-text-secondary)]">
            {t("sharedPlatforms")}
          </p>
          <ul className="flex flex-wrap gap-2">
            {shared.map((p) => (
              <Chip key={`${p.platform}:${p.account}:shared`} p={p} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
