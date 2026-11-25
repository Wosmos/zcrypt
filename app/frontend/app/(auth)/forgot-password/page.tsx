"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { forgotPassword } from "@/lib/auth-api";
import { AuthStatusCard, emphasizeEmail } from "@/components/auth/auth-status-card";
import { AuthLink, AUTH_LINK_CLASS } from "@/components/auth/auth-link";
import { SubmitButton } from "@/components/auth/submit-button";
import { EmailField } from "@/components/auth/email-field";
import { ArrowRight, ArrowLeft, CheckCircle2 } from "@/lib/icons";
import { useTurnstile } from "@/components/auth/turnstile";
import { useFriendlyError } from "@/hooks/useConnectivity";
import { toast } from "@/store/toast";

export default function ForgotPasswordPage() {
  const t = useTranslations("auth");
  const tf = useTranslations("auth.forgot");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const turnstile = useTurnstile();
  const friendlyError = useFriendlyError();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    try {
      await forgotPassword(email, await turnstile.getToken());
      setSent(true);
    } catch (err) {
      // Any other failure still reads as "sent", so the form never says
      // whether an account exists.
      const code = (err as { code?: string }).code;
      if (code === "network_blocked" || code === "bot_check_failed") {
        toast.error(friendlyError(err, tf("send")));
      } else {
        setSent(true);
      }
    } finally {
      turnstile.reset();
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthStatusCard
        icon={CheckCircle2}
        tone="cyan"
        title={t("checkEmail")}
        action={
          <Link href="/login">
            <Button variant="secondary" className="mt-5">
              <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" /> {t("backToLogin")}
            </Button>
          </Link>
        }
      >
        <p className="text-sm text-[var(--color-text-secondary)] mt-2 leading-relaxed">
          {tf.rich("sentTo", {
            email,
            b: emphasizeEmail,
          })}
        </p>
      </AuthStatusCard>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">{tf("title")}</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">{tf("subtitle")}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <EmailField value={email} onChange={setEmail} />

        <SubmitButton
          type="submit"
          loading={loading}
          disabled={loading || !email.trim()}
          loadingLabel={tf("sending")}
          icon={ArrowRight}
        >
          {tf("send")}
        </SubmitButton>
        {turnstile.widget}
      </form>

      <p className="text-center text-sm text-[var(--color-text-secondary)] mt-6">
        <AuthLink href="/login" className={`${AUTH_LINK_CLASS} inline-flex items-center gap-1`}>
          <ArrowLeft className="h-3.5 w-3.5 rtl:-scale-x-100" /> {t("backToLogin")}
        </AuthLink>
      </p>
    </div>
  );
}
