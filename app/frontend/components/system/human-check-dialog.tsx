"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { turnstileEnabled, useTurnstile } from "@/components/auth/turnstile";
import { Loader2, ShieldCheck } from "@/lib/icons";
import { useHumanCheck } from "@/store/human-check";

function Check({ onToken }: { onToken: (token: string) => void }) {
  const { widget, getToken } = useTurnstile();
  useEffect(() => {
    let live = true;
    void getToken().then((token) => {
      if (live && token) onToken(token);
    });
    return () => {
      live = false;
    };
  }, [getToken, onToken]);
  return widget;
}

/**
 * The step-up check the server asks for after a burst of public links. Mounted
 * once; the API client opens it through useHumanCheck and retries with the token.
 */
export function HumanCheckDialog() {
  const t = useTranslations("app.humanCheck");
  const open = useHumanCheck((s) => s.pending !== null);
  const settle = useHumanCheck((s) => s.settle);

  useEffect(() => {
    if (!turnstileEnabled()) return;
    useHumanCheck.setState({ hosted: true });
    return () => useHumanCheck.setState({ hosted: false });
  }, []);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && settle()}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-[400px] gap-0 rounded-2xl border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-[var(--color-text)] shadow-2xl sm:rounded-2xl">
        <div className="flex items-center gap-3.5 pe-7">
          <div className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
            <ShieldCheck className="h-[22px] w-[22px]" aria-hidden="true" />
          </div>
          <DialogTitle className="min-w-0 text-base font-semibold leading-snug tracking-normal">
            {t("title")}
          </DialogTitle>
        </div>
        <DialogDescription className="mt-4 text-sm leading-relaxed text-[var(--color-text-secondary)]">
          {t("body")}
        </DialogDescription>
        <div className="mt-5 flex min-w-0 flex-col items-stretch gap-3 text-xs text-[var(--color-text-muted)]">
          {open && <Check onToken={settle} />}
          <span className="flex items-center justify-center gap-2" role="status">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            {t("checking")}
          </span>
        </div>
        <Button variant="ghost" className="mt-4 w-full" onClick={() => settle()}>
          {t("cancel")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
