"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { getUserAvatarBlob } from "@/lib/api";
import { loadAvatar } from "@/lib/avatar-cache";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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

/** One or two capitals: first and last word of a name, else the first two letters of a single word. */
export function initialsOf(name: string): string {
  const base = name.trim().split("@")[0] ?? "";
  const words = base.split(/[\s._-]+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters = (w: string) => Array.from(w);
  const text =
    words.length > 1
      ? letters(words[0]!)[0]! + letters(words[words.length - 1]!)[0]!
      : letters(words[0]!).slice(0, 2).join("");
  return text.toUpperCase();
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
        {size === "xs" ? initialsOf(name).slice(0, 1) : initialsOf(name)}
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

const TIP_TOUCH_MS = 2500;

/** Shows who an avatar is on hover or focus, and for a moment after a tap on touch screens. */
function WhoTip({
  name,
  email,
  children,
}: {
  name: string;
  email?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const tap = () => {
    setOpen(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), TIP_TOUCH_MS);
  };

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <span tabIndex={0} onClick={tap} className="rounded-full outline-none">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <span className="block font-medium">{name}</span>
        {email && email !== name && <span className="block opacity-70">{email}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

export function AvatarStack({
  members,
  total,
}: {
  members: {
    user_id: string;
    username: string;
    email?: string;
    has_avatar?: boolean;
    avatar_version?: string;
  }[];
  total: number;
}) {
  const t = useTranslations("spaces");
  const extra = Math.max(0, total - members.length);
  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex items-center" aria-label={t("shared.memberCount", { count: total })}>
        <div className="flex -space-x-2">
          {members.map((m) => (
            <WhoTip key={m.user_id} name={m.username} email={m.email}>
              <UserAvatar
                userId={m.user_id}
                name={m.username}
                hasAvatar={m.has_avatar}
                avatarVersion={m.avatar_version}
                size="sm"
                ring
              />
            </WhoTip>
          ))}
          {extra > 0 && (
            <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-[var(--color-surface-2)] px-1.5 text-[11px] font-medium tabular-nums text-[var(--color-text-secondary)] ring-2 ring-[var(--color-surface)]">
              +{extra}
            </span>
          )}
        </div>
      </div>
    </TooltipProvider>
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
