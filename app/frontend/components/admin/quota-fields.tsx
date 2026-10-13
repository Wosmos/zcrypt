"use client";

import { useTranslations } from "next-intl";
import type { QuotaMode } from "@/lib/quota";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Storage-limit editor: plan default / custom GB / unlimited. Used by the table, the detail page and the bulk dialog. */
export function QuotaFields({
  mode,
  input,
  onModeChange,
  onInputChange,
}: {
  mode: QuotaMode;
  input: string;
  onModeChange: (mode: QuotaMode) => void;
  onInputChange: (value: string) => void;
}) {
  const t = useTranslations("admin.userTable");
  return (
    <>
      <Select value={mode} onValueChange={(v) => onModeChange(v as QuotaMode)}>
        <SelectTrigger className="h-8 w-28 text-xs" aria-label={t("quotaMode")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="default">{t("modePlanDefault")}</SelectItem>
          <SelectItem value="custom">{t("modeCustom")}</SelectItem>
          <SelectItem value="unlimited">{t("modeUnlimited")}</SelectItem>
        </SelectContent>
      </Select>
      {mode === "custom" && (
        <input
          type="number"
          min="0.1"
          step="0.5"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          className="w-20 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)] px-2 py-1 text-xs tabular-nums outline-none focus:border-[var(--color-accent)]/40 focus:ring-2 focus:ring-[var(--color-accent)]/10"
          placeholder={t("gb")}
          aria-label={t("quotaGb")}
        />
      )}
    </>
  );
}
