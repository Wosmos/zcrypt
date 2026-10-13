"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import type { AdminNotify } from "@/lib/api";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export const DEFAULT_NOTIFY: AdminNotify = { notify: true, note: "" };
export const NOTE_MAX = 500;

/** "Notify by email" switch plus an optional note, shared by every admin change dialog. */
export function NotifyFields({
  value,
  onChange,
  className = "mx-6 mt-4",
}: {
  value: AdminNotify;
  onChange: (next: AdminNotify) => void;
  className?: string;
}) {
  const t = useTranslations("admin.notify");
  const id = useId();
  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-[var(--color-text)]">{t("label")}</span>
          <span className="block text-xs text-[var(--color-text-muted)]">{t("hint")}</span>
        </label>
        <Switch
          id={id}
          checked={value.notify}
          onCheckedChange={(notify) => onChange({ ...value, notify })}
          className="data-[state=checked]:bg-[var(--color-accent)] data-[state=unchecked]:bg-[var(--color-surface-3)]"
        />
      </div>
      {value.notify && (
        <textarea
          rows={2}
          maxLength={NOTE_MAX}
          value={value.note}
          onChange={(e) => onChange({ ...value, note: e.target.value })}
          aria-label={t("noteLabel")}
          placeholder={t("notePlaceholder")}
          className="w-full resize-none rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2.5 text-sm placeholder:text-[var(--color-text-muted)] transition-all focus:border-[var(--color-accent)]/40 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
        />
      )}
    </div>
  );
}
