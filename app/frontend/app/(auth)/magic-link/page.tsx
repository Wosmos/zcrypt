"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuthStore } from "@/store/auth";
import { verifyMagicLink } from "@/lib/auth-api";
import { AuthStatusCard } from "@/components/auth/auth-status-card";
import { AuthLink, AUTH_LINK_CLASS } from "@/components/auth/auth-link";
import { toast } from "@/store/toast";
import { Wand2 } from "@/lib/icons";
import { LogoSpinner } from "@/components/ui/logo-spinner";

export default function MagicLinkPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setTokens, setUser } = useAuthStore();
  const handled = useRef(false);
  const token = searchParams.get("token");
  const [failure, setFailure] = useState<string | null>(null);
  const error = token ? failure : t("magic.invalidLink");

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    if (!token) return;

    verifyMagicLink(token)
      .then((res) => {
        if (res.requires_2fa && res.temp_token) {
          sessionStorage.setItem("zcrypt-temp-token", res.temp_token);
          router.replace("/2fa-verify");
        } else if (res.access_token && res.refresh_token) {
          setTokens(res.access_token, res.refresh_token);
          if (res.user) setUser(res.user);
          toast.success(t("magic.signedIn"));
          router.replace("/dashboard");
        } else {
          setFailure(t("authFailed"));
        }
      })
      .catch((err) => {
        setFailure(err instanceof Error ? err.message : t("magic.expiredFallback"));
      });
  }, [token, setTokens, setUser, router, t]);

  if (error) {
    return (
      <AuthStatusCard
        icon={Wand2}
        tone="red"
        title={t("magic.expiredTitle")}
        action={
          <AuthLink
            onClick={() => router.push("/login")}
            className={`mt-4 text-sm ${AUTH_LINK_CLASS}`}
          >
            {t("backToLogin")}
          </AuthLink>
        }
      >
        <p className="text-sm text-[var(--color-text-secondary)] mt-2">{error}</p>
      </AuthStatusCard>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <LogoSpinner size={32} speed="default" />
      <p className="text-sm text-[var(--color-text-secondary)]">{t("magic.verifying")}</p>
    </div>
  );
}
