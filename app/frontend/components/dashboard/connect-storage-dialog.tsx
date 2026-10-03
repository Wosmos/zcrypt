"use client";

import Link from "next/link";
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
  { name: "Telegram", hint: "Easiest. Create a bot, paste its token." },
  { name: "GitHub", hint: "A fine-grained token limited to repositories." },
  { name: "Hugging Face", hint: "A write token for a private dataset space." },
];

export function ConnectStorageDialog() {
  const { quota } = useQuota();
  const { open, show, hide } = useConnectStorage();
  const onShared = Boolean(quota && !quota.has_personal_key && !quota.is_unlimited);

  if (!quota || !onShared) return null;

  const full = quota.quota_bytes > 0 && quota.used_bytes >= quota.quota_bytes;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? show() : hide())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{full ? "Shared storage is full" : "Connect your own storage"}</DialogTitle>
          <DialogDescription>
            {full
              ? `You have used ${formatBytes(quota.used_bytes)} of the ${formatBytes(quota.quota_bytes)} shared allowance, so new uploads are paused.`
              : `You are on zcrypt's shared storage (${formatBytes(quota.used_bytes)} of ${formatBytes(quota.quota_bytes)}).`}{" "}
            Connect an account you own and your space becomes unlimited. Your files stay encrypted
            on your device either way.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2">
          {OPTIONS.map((o) => (
            <li
              key={o.name}
              className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
            >
              <span className="font-medium text-[var(--color-text)]">{o.name}</span>
              <span className="ml-2 text-[var(--color-text-muted)]">{o.hint}</span>
            </li>
          ))}
        </ul>

        <DialogFooter>
          {!full && (
            <Button variant="ghost" onClick={hide}>
              Remind me later
            </Button>
          )}
          <Link href="/settings?tab=storage" onClick={hide} className={buttonVariants()}>
            Connect now
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
