"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PillLink } from "@/components/marketing/ui/pill-link";
import { cardSurface } from "@/components/marketing/ui/card";
import { Image as ImageIcon, X } from "@/lib/icons";
import { submitBugReport, type FeedbackKind } from "@/lib/api";
import { collectBugContext, downscaleToJpeg } from "@/lib/bug-report";
import { ApiError } from "@/lib/http-error";
import { useAuthStore } from "@/store/auth";
import { tryRefreshToken } from "@/lib/auth-fetch";
import { getMe } from "@/lib/auth-api";
import { cn } from "@/lib/utils";

const MAX_LEN = 5000;

const KINDS: { value: FeedbackKind; key: string }[] = [
  { value: "bug", key: "typeBug" },
  { value: "idea", key: "typeIdea" },
  { value: "left", key: "typeLeft" },
  { value: "other", key: "typeOther" },
];

const HONEYPOT_STYLE = {
  position: "absolute",
  left: "-9999px",
  top: "auto",
  width: "1px",
  height: "1px",
  overflow: "hidden",
} as const;

function kindFromParam(value: string | null): FeedbackKind {
  return KINDS.find((k) => k.value === value)?.value ?? "bug";
}

export function FeedbackForm() {
  const t = useTranslations("site.feedback");
  const params = useSearchParams();
  const groupId = useId();
  const signedIn = useAuthStore((s) => Boolean(s.accessToken));
  const email = useAuthStore((s) => s.user?.email ?? "");
  const [startedAt] = useState(() => Date.now());

  useEffect(() => {
    const { accessToken, user, setUser } = useAuthStore.getState();
    if (accessToken && user) return;
    let cancelled = false;
    void (async () => {
      const token = accessToken ?? (await tryRefreshToken().catch(() => null));
      if (!token || cancelled) return;
      const me = await getMe(token).catch(() => null);
      if (me && !cancelled) setUser(me);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const fileRef = useRef<HTMLInputElement>(null);

  const [kind, setKind] = useState<FeedbackKind>(() => kindFromParam(params.get("type")));
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [website, setWebsite] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAttach = signedIn && kind === "bug";
  const trimmed = message.trim();

  const attach = async (file: Blob) => {
    setProcessing(true);
    setError(null);
    try {
      setScreenshot(await downscaleToJpeg(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errAttach"));
    } finally {
      setProcessing(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed || submitting || processing) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitBugReport({
        description: trimmed,
        kind,
        ...(canAttach && screenshot ? { screenshot } : {}),
        ...(signedIn ? {} : { contact_email: contact.trim(), website }),
        elapsed_ms: Date.now() - startedAt,
        ...(await collectBugContext("/feedback")),
      });
      setSent(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) setError(t("errRate"));
      else if (err instanceof ApiError && err.status === 400) setError(err.message);
      else setError(t("errGeneric"));
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div role="status" className={cn(cardSurface, "p-8 text-center")}>
        <h2 className="text-xl font-semibold tracking-tight text-[var(--color-text)]">
          {t("successTitle")}
        </h2>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{t("successBody")}</p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <PillLink href="/">{t("backHome")}</PillLink>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setSent(false);
              setMessage("");
              setContact("");
              setScreenshot(null);
            }}
          >
            {t("sendAnother")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={cn(cardSurface, "relative space-y-6 p-5 sm:p-7")}>
      <fieldset className="min-w-0">
        <legend id={groupId} className="mb-3 text-sm font-medium text-[var(--color-text)]">
          {t("typeLegend")}
        </legend>
        <div
          role="radiogroup"
          aria-labelledby={groupId}
          className="grid grid-cols-1 gap-2 sm:grid-cols-2"
        >
          {KINDS.map((k) => (
            <label
              key={k.value}
              className={cn(
                "flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-3 py-2 text-center text-sm font-medium transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--color-accent)]",
                kind === k.value
                  ? "border-[var(--color-accent)]/60 bg-[var(--color-accent)]/10 text-[var(--color-text)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-hover)]",
              )}
            >
              <input
                type="radio"
                name="kind"
                value={k.value}
                checked={kind === k.value}
                onChange={() => setKind(k.value)}
                className="sr-only"
              />
              {t(k.key)}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="feedback-message" className="text-sm font-medium text-[var(--color-text)]">
          {t("messageLabel")}
        </label>
        <Textarea
          id="feedback-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={MAX_LEN}
          rows={7}
          placeholder={t("messagePlaceholder")}
          className="resize-y"
        />
        <p className="text-end text-xs tabular-nums text-[var(--color-text-muted)]">
          {t("counter", { count: message.length, max: MAX_LEN })}
        </p>
      </div>

      {signedIn ? (
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-text-secondary)]">
            {email ? t("sendingAs", { email }) : t("sendingAsAccount")}
          </p>
          {canAttach && (
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                data-testid="feedback-file"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void attach(file);
                }}
              />
              {screenshot ? (
                <div className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={screenshot}
                    alt={t("attachAlt")}
                    className="h-14 w-14 rounded-lg object-cover"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setScreenshot(null)}
                  >
                    <X className="h-3.5 w-3.5" />
                    {t("attachRemove")}
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={processing}
                  onClick={() => fileRef.current?.click()}
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  {processing ? t("attachProcessing") : t("attach")}
                </Button>
              )}
            </div>
          )}
        </div>
      ) : (
        <>
          <div>
            <Input
              id="feedback-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={254}
              label={t("emailLabel")}
              placeholder={t("emailPlaceholder")}
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              aria-describedby="feedback-email-hint"
            />
            <p id="feedback-email-hint" className="mt-1.5 text-xs text-[var(--color-text-muted)]">
              {t("emailHint")}
            </p>
          </div>
          <div aria-hidden="true" style={HONEYPOT_STYLE}>
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={!trimmed || submitting || processing}
      >
        {submitting ? t("sending") : t("submit")}
      </Button>
    </form>
  );
}
