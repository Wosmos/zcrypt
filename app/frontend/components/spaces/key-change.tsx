"use client";

import { useTranslations } from "next-intl";
import { create } from "zustand";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { KeyChangedError } from "@/lib/key-pins";
import { ShieldAlert } from "@/lib/icons";

interface Prompt {
  error: KeyChangedError;
  label: string;
  resolve: (accepted: boolean) => void;
}

interface KeyChangeStore {
  queue: Prompt[];
}

const useKeyChangeStore = create<KeyChangeStore>(() => ({ queue: [] }));

function askKeyChange(error: KeyChangedError, label: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    useKeyChangeStore.setState((s) => ({ queue: [...s.queue, { error, label, resolve }] }));
  });
}

export class KeyChangeDeclinedError extends Error {
  constructor() {
    super("Cancelled: the person's changed encryption key was not approved.");
    this.name = "KeyChangeDeclinedError";
  }
}

/** Run a sealing operation; when a peer's key differs from the one pinned on
 *  this device, ask the user and retry with that peer explicitly approved. */
export async function withKeyConfirm<T>(
  label: string,
  run: (acceptChangedKeys: string[]) => Promise<T>,
): Promise<T> {
  const accepted: string[] = [];
  for (;;) {
    try {
      return await run([...accepted]);
    } catch (err) {
      if (!(err instanceof KeyChangedError)) throw err;
      const ok = await askKeyChange(err, label);
      if (!ok) throw new KeyChangeDeclinedError();
      accepted.push(err.peerUserId);
    }
  }
}

function Fingerprint({ title, value }: { title: string; value: string }) {
  const t = useTranslations("spaces");
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
        {title}
      </p>
      <p className="break-all rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)] px-2.5 py-1.5 font-mono text-xs text-[var(--color-text)]">
        {value || t("common.unknown")}
      </p>
    </div>
  );
}

/** Mount once in the app shell: confirms a changed peer key from anywhere. */
export function KeyChangeHost() {
  const t = useTranslations("spaces");
  const current = useKeyChangeStore((s) => s.queue[0]);

  const settle = (accepted: boolean) => {
    if (!current) return;
    current.resolve(accepted);
    useKeyChangeStore.setState((s) => ({ queue: s.queue.slice(1) }));
  };

  return (
    <ConfirmDialog
      open={!!current}
      onOpenChange={(o) => {
        if (!o) settle(false);
      }}
      destructive
      title={t("keyChange.title")}
      description={t.rich("keyChange.description", {
        label: current?.label ?? "",
        b: (chunks) => <span className="font-medium text-[var(--color-text)]">{chunks}</span>,
      })}
      confirmLabel={t("keyChange.trust")}
      cancelLabel={t("common.cancel")}
      onConfirm={() => settle(true)}
    >
      {current && (
        <div className="space-y-2.5">
          <p className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
            <ShieldAlert className="h-3.5 w-3.5" />
            {t("keyChange.warn")}
          </p>
          <Fingerprint title={t("keyChange.previous")} value={current.error.previous} />
          <Fingerprint title={t("keyChange.offered")} value={current.error.fingerprint} />
        </div>
      )}
    </ConfirmDialog>
  );
}
