"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { registerWithBreachCheck, login as loginApi } from "@/lib/auth-api";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { AuthStatusCard } from "@/components/auth/auth-status-card";
import { AuthLink } from "@/components/auth/auth-link";
import { SubmitButton } from "@/components/auth/submit-button";
import { EmailField } from "@/components/auth/email-field";
import { useAuthStore } from "@/store/auth";
import { toast } from "@/store/toast";
import { Lock, User, ArrowRight, CheckCircle2, AlertTriangle } from "@/lib/icons";

export default function RegisterPage() {
  const router = useRouter();
  const t = useTranslations("auth");
  const tr = useTranslations("auth.register");
  const { setUser, setTokens } = useAuthStore();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<"verified" | "pending" | false>(false);
  const [breachWarning, setBreachWarning] = useState<{
    message: string;
    count: number;
  } | null>(null);

  const doRegister = async (force: boolean) => {
    setLoading(true);
    try {
      const res = await registerWithBreachCheck(email, username, password, force);

      if (res.requires === "force" && res.warning && !force) {
        setBreachWarning({ message: res.warning, count: res.breach_count ?? 0 });
        setLoading(false);
        return;
      }

      setBreachWarning(null);

      if (res.user?.email_verified) {
        const loginRes = await loginApi(email, password);
        if (loginRes.access_token && loginRes.refresh_token) {
          setTokens(loginRes.access_token, loginRes.refresh_token);
          if (loginRes.user) {
            setUser(loginRes.user);
          }
          toast.success(tr("welcome"));
          router.push("/dashboard");
          return;
        }
        setSuccess("verified");
        toast.success(tr("created"));
        setTimeout(() => router.push("/login"), 1500);
      } else {
        setSuccess("pending");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("failed"));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !username || !password) return;

    if (password !== confirmPassword) {
      toast.error(tr("mismatch"));
      return;
    }

    await doRegister(false);
  };

  if (success === "verified") {
    return (
      <AuthStatusCard
        icon={CheckCircle2}
        tone="cyan"
        title={tr("createdTitle")}
        action={
          <Link href="/login">
            <Button className="mt-5">
              {tr("signIn")} <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
            </Button>
          </Link>
        }
      >
        <p className="text-sm text-[var(--color-text-secondary)] mt-2 leading-relaxed">
          {tr("redirecting")}
        </p>
      </AuthStatusCard>
    );
  }

  if (success === "pending") {
    return (
      <AuthStatusCard
        icon={CheckCircle2}
        tone="cyan"
        title={t("checkEmail")}
        action={
          <Link href="/login">
            <Button variant="secondary" className="mt-5">
              {t("backToLogin")}
            </Button>
          </Link>
        }
      >
        <p className="text-sm text-[var(--color-text-secondary)] mt-2 leading-relaxed">
          {tr.rich("verifySent", {
            email,
            b: (chunks) => <strong className="text-[var(--color-text)]">{chunks}</strong>,
          })}
        </p>
      </AuthStatusCard>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="space-y-4">
        <OAuthButtons />

        <form onSubmit={handleSubmit} className="space-y-3">
          <EmailField value={email} onChange={setEmail} />
          <Input
            label={tr("username")}
            type="text"
            name="username"
            placeholder={tr("usernamePlaceholder")}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            icon={<User className="h-4 w-4" />}
            required
            autoComplete="username"
          />
          <Input
            label={t("password")}
            type="password"
            name="password"
            placeholder={t("passwordPlaceholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            icon={<Lock className="h-4 w-4" />}
            required
            autoComplete="new-password"
          />
          <Input
            label={tr("confirmPassword")}
            type="password"
            name="confirmPassword"
            placeholder={tr("confirmPlaceholder")}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            icon={<Lock className="h-4 w-4" />}
            required
            autoComplete="new-password"
          />

          {/* Breach warning */}
          {breachWarning && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 animate-fade-in">
              <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                  {tr("breach", { count: breachWarning.count })}
                </p>
                <p className="text-xs text-amber-600/70 dark:text-amber-400/60 mt-0.5">
                  {tr("breachHint")}
                </p>
                <button
                  type="button"
                  onClick={() => doRegister(true)}
                  disabled={loading}
                  className="mt-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 underline hover:no-underline transition-colors"
                >
                  {tr("useAnyway")}
                </button>
              </div>
            </div>
          )}

          <SubmitButton
            type="submit"
            loading={loading}
            disabled={loading || !email.trim() || !username.trim() || !password || !confirmPassword}
            loadingLabel={tr("creating")}
            icon={ArrowRight}
          >
            {tr("createAccount")}
          </SubmitButton>
        </form>
      </div>

      <p className="text-center text-sm text-[var(--color-text-secondary)] mt-5">
        {tr.rich("haveAccount", {
          link: (chunks) => <AuthLink href="/login">{chunks}</AuthLink>,
        })}
      </p>
    </div>
  );
}
