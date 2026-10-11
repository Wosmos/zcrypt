"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight } from "@/lib/icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { useQuota } from "@/hooks/useQuota";
import { useConnectStorage } from "@/store/connect-storage";
import { formatBytes } from "@/lib/utils";

const OPTIONS = [
  { name: "Telegram", hint: "telegramHint" },
  { name: "GitHub", hint: "githubHint" },
  { name: "Hugging Face", hint: "huggingFaceHint" },
] as const;

export function ConnectStorageDialog() {
  const t = useTranslations("app.connectStorage");
  const { quota } = useQuota();
  const { open, show, hide } = useConnectStorage();
  const onShared = Boolean(quota && !quota.has_personal_key && !quota.is_unlimited);

  if (!quota || !onShared) return null;

  const full = quota.quota_bytes > 0 && quota.used_bytes >= quota.quota_bytes;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? show() : hide())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{full ? t("fullTitle") : t("title")}</DialogTitle>
          <DialogDescription>
            {full
              ? t("fullIntro", {
                  used: formatBytes(quota.used_bytes),
                  total: formatBytes(quota.quota_bytes),
                })
              : t("sharedIntro", {
                  used: formatBytes(quota.used_bytes),
                  total: formatBytes(quota.quota_bytes),
                })}{" "}
            {t("pitch")}
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2">
          {OPTIONS.map((o) => (
            <li
              key={o.name}
              className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
            >
              <span className="font-medium text-[var(--color-text)]">{o.name}</span>
              <span className="ml-2 text-[var(--color-text-muted)]">{t(o.hint)}</span>
            </li>
          ))}
        </ul>

        <DialogFooter>
          {!full && (
            <Button variant="ghost" onClick={hide}>
              {t("remindLater")}
            </Button>
          )}
          <Link href="/settings?tab=storage" onClick={hide} className={buttonVariants()}>
            {t("connectNow")}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
