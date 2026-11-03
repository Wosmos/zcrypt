"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { File, Loader2, Monitor } from "@/lib/icons";
import {
  desktopAppLead,
  openDesktopDownload,
  tryOpenDesktopApp,
  type DesktopAppLead,
} from "@/lib/open-desktop-app";
import { noticeCopy, type NoticeText } from "@/lib/web-transfer-notice";
import { useWebTransferNotice, type WebTransferNotice } from "@/store/web-transfer-notice";

type Phase = "idle" | "opening" | "missing";

function NoticeBody({ notice, onClose }: { notice: WebTransferNotice; onClose: () => void }) {
  const t = useTranslations("app.webLimit");
  const say = (text: NoticeText) => t(text.key, text.values);
  const [lead] = useState<DesktopAppLead>(desktopAppLead);
  const [phase, setPhase] = useState<Phase>("idle");
  const copy = noticeCopy(notice);
  const leadsWithOpen = lead === "open" && phase !== "missing";

  const openApp = async () => {
    setPhase("opening");
    if (await tryOpenDesktopApp()) onClose();
    else setPhase("missing");
  };
  const download = () => {
    openDesktopDownload();
    onClose();
  };

  return (
    <>
      <div className="flex items-center gap-3.5 pe-7">
        <div className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
          <Monitor className="h-[22px] w-[22px]" aria-hidden="true" />
        </div>
        <DialogTitle className="min-w-0 text-base font-semibold leading-snug tracking-normal">
          {say(copy.title)}
        </DialogTitle>
      </div>

      <DialogDescription className="mt-4 text-sm leading-relaxed text-[var(--color-text-secondary)]">
        {say(copy.body)}
      </DialogDescription>

      {copy.list.length > 0 && (
        <ul className="mt-3.5 divide-y divide-[var(--color-border)] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)]/60">
          {copy.list.map((f) => (
            <li key={`${f.name}:${f.size}`} className="flex items-center gap-2.5 px-3.5 py-2.5">
              <File
                className="h-4 w-4 flex-none text-[var(--color-text-muted)]"
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-sm text-[var(--color-text)]">
                {f.name}
              </span>
              <span className="flex-none text-xs tabular-nums text-[var(--color-text-muted)]">
                {f.size}
              </span>
            </li>
          ))}
          {copy.more > 0 && (
            <li className="px-3.5 py-2 text-xs text-[var(--color-text-muted)]">
              {t("more", { count: copy.more })}
            </li>
          )}
        </ul>
      )}

      {phase === "missing" ? (
        <p
          role="status"
          className="mt-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3.5 py-2.5 text-xs leading-relaxed text-[var(--color-text-secondary)]"
        >
          {t("missingNote")}
        </p>
      ) : (
        copy.hint && (
          <p className="mt-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
            {say(copy.hint)}
          </p>
        )
      )}

      <div className="mt-6 flex flex-col gap-2">
        {leadsWithOpen ? (
          <Button
            size="lg"
            className="w-full"
            onClick={() => void openApp()}
            disabled={phase === "opening"}
          >
            {phase === "opening" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {t(phase === "opening" ? "opening" : "open")}
          </Button>
        ) : (
          <Button size="lg" className="w-full" onClick={download}>
            {t(phase === "missing" ? "missing" : "get")}
          </Button>
        )}
        <div className="flex gap-2">
          {leadsWithOpen && (
            <Button variant="secondary" className="flex-1" onClick={download}>
              {t("get")}
            </Button>
          )}
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            {t("notNow")}
          </Button>
        </div>
      </div>
    </>
  );
}

/**
 * The dialog that explains a web upload the browser was not allowed to send,
 * too big or over the month's web transfers, and gets the user into the
 * desktop app. Mounted once; anything opens it through useWebTransferNotice.
 */
export function WebTransferLimitDialog() {
  const notice = useWebTransferNotice((s) => s.notice);
  const seq = useWebTransferNotice((s) => s.seq);
  const close = useWebTransferNotice((s) => s.close);
  const [shown, setShown] = useState(notice);
  if (notice && notice !== shown) setShown(notice);

  return (
    <Dialog open={notice !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-[440px] gap-0 rounded-2xl border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-[var(--color-text)] shadow-2xl sm:rounded-2xl [&>button:last-child]:end-4 [&>button:last-child]:top-4">
        {shown && <NoticeBody key={seq} notice={shown} onClose={close} />}
      </DialogContent>
    </Dialog>
  );
}
