"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { getUserAvatarBlob } from "@/lib/api";
import { loadAvatar } from "@/lib/avatar-cache";
import { useAuthStore } from "@/store/auth";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const SIZE_CLASS: Record<AvatarSize, string> = {
  xs: "h-5 w-5 text-[10px]",
  sm: "h-7 w-7 text-[11px]",
  md: "h-9 w-9 text-xs",
  lg: "h-10 w-10 text-sm",
  xl: "h-16 w-16 text-xl",
};

export function hueOf(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

function useAvatarSrc(userId: string, hasAvatar: boolean, version: string, previewSrc?: string) {
  const selfSrc = useAuthStore((s) => (s.user?.id === userId ? s.user.avatar_url : undefined));
  const [fetched, setFetched] = useState<{ key: string; url: string } | null>(null);
  const key = `${userId}:${version}`;
  const direct = previewSrc ?? selfSrc;

  useEffect(() => {
    if (direct || !hasAvatar) return;
    let live = true;
    void loadAvatar(userId, version, getUserAvatarBlob).then((url) => {
      if (live && url) setFetched({ key, url });
    });
    return () => {
      live = false;
    };
  }, [direct, hasAvatar, userId, version, key]);

  if (direct) return direct;
  return hasAvatar && fetched?.key === key ? fetched.url : null;
}

export function UserAvatar({
  userId,
  name,
  hasAvatar = false,
  avatarVersion = "",
  size = "md",
  className,
  ring,
  decorative = true,
  previewSrc,
}: {
  userId: string;
  name: string;
  hasAvatar?: boolean;
  avatarVersion?: string;
  size?: AvatarSize;
  className?: string;
  ring?: boolean;
  decorative?: boolean;
  previewSrc?: string;
}) {
  const src = useAvatarSrc(userId, hasAvatar, avatarVersion, previewSrc);
  const [failed, setFailed] = useState<string | null>(null);
  const showImg = src !== null && failed !== src;
  const hue = hueOf(userId);
  const a11y = decorative ? { "aria-hidden": true } : { role: "img", "aria-label": name };

  return (
    <span
      {...a11y}
      className={cn(
        "relative inline-flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold uppercase text-white",
        SIZE_CLASS[size],
        ring && "ring-2 ring-[var(--color-surface)]",
        className,
      )}
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 60% 52%), hsl(${(hue + 40) % 360} 60% 40%))`,
      }}
    >
      <span className="select-none" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.35)" }}>
        {(name.trim()[0] ?? "?").toUpperCase()}
      </span>
      {showImg && (
        // A blob or data: URI already in memory; next/image has nothing to optimize.
        // oxlint-disable-next-line no-img-element
        <img
          src={src}
          alt=""
          draggable={false}
          onError={() => setFailed(src)}
          className="absolute inset-0 h-full w-full rounded-full object-cover"
        />
      )}
    </span>
  );
}

export function AvatarStack({
  members,
  total,
}: {
  members: { user_id: string; username: string; has_avatar?: boolean; avatar_version?: string }[];
  total: number;
}) {
  const t = useTranslations("spaces");
  const extra = Math.max(0, total - members.length);
  return (
    <div className="flex items-center" aria-label={t("shared.memberCount", { count: total })}>
      <div className="flex -space-x-2">
        {members.map((m) => (
          <UserAvatar
            key={m.user_id}
            userId={m.user_id}
            name={m.username}
            hasAvatar={m.has_avatar}
            avatarVersion={m.avatar_version}
            size="sm"
            ring
          />
        ))}
        {extra > 0 && (
          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-[var(--color-surface-2)] px-1.5 text-[11px] font-medium tabular-nums text-[var(--color-text-secondary)] ring-2 ring-[var(--color-surface)]">
            +{extra}
          </span>
        )}
      </div>
    </div>
  );
}

export function useCurrentUserAvatar() {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;
  return {
    userId: user.id,
    name: user.display_name || user.username || user.email,
    hasAvatar: !!user.avatar_url || !!user.has_avatar,
    avatarVersion: user.avatar_version ?? "",
  };
}
