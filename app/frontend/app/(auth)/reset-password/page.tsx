"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resetPassword } from "@/lib/auth-api";
import { AuthStatusCard } from "@/components/auth/auth-status-card";
import { SubmitButton } from "@/components/auth/submit-button";
import { toast } from "@/store/toast";
import { useFriendlyError } from "@/hooks/useConnectivity";
import { Lock, ArrowRight, CheckCircle2, AlertTriangle } from "@/lib/icons";
import { LogoSpinner } from "@/components/ui/logo-spinner";

function ResetPasswordForm() {
  const t = useTranslations("auth");
  const friendlyError = useFriendlyError();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!token) {
    return (
      <AuthStatusCard
        icon={AlertTriangle}
        tone="amber"
        title={t("reset.invalidTitle")}
        action={
          <Link href="/forgot-password">
            <Button variant="secondary" className="mt-5">
              {t("reset.requestNew")}
            </Button>
          </Link>
        }
      >
        <p className="text-sm text-[var(--color-text-secondary)] mt-2">{t("reset.invalidBody")}</p>
      </AuthStatusCard>
    );
  }

  if (success) {
    return (
      <AuthStatusCard
        icon={CheckCircle2}
        tone="cyan"
        title={t("reset.doneTitle")}
        action={
          <Link href="/login">
            <Button className="mt-5">
              {t("register.signIn")} <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        }
      >
        <p className="text-sm text-[var(--color-text-secondary)] mt-2">{t("reset.doneBody")}</p>
      </AuthStatusCard>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error(t("register.mismatch"));
      return;
    }

    setLoading(true);
    try {
      await resetPassword(token, password);
      setSuccess(true);
    } catch (err) {
      toast.error(friendlyError(err, t("reset.failed")));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">{t("reset.title")}</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">{t("reset.subtitle")}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <Input
          label={t("reset.newPassword")}
          type="password"
          placeholder={t("passwordPlaceholder")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          icon={<Lock className="h-4 w-4" />}
          required
          autoComplete="new-password"
        />
        <Input
          label={t("register.confirmPassword")}
          type="password"
          placeholder={t("register.confirmPlaceholder")}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          icon={<Lock className="h-4 w-4" />}
          required
          autoComplete="new-password"
        />

        <SubmitButton
          type="submit"
          loading={loading}
          disabled={loading || !password || !confirmPassword}
          loadingLabel={t("reset.resetting")}
          icon={ArrowRight}
        >
          {t("reset.submit")}
        </SubmitButton>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-16">
          <LogoSpinner size="sm" speed="default" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
