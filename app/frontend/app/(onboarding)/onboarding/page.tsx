"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { connectPlatform } from "@/lib/api";
import { storeDesktopPlatformCreds } from "@/lib/desktop-creds";
import { invalidatePlatforms } from "@/store/platform";
import { TelegramConnect } from "@/components/settings/telegram-connect";
import { toast } from "@/store/toast";
import { PlatformIcon } from "@/components/icons/platform-icon";
import { PLATFORMS } from "@/lib/platforms";
import { ArrowRight, Lock, Zap, Shield, Key, CheckCircle2, SkipForward } from "@/lib/icons";
import { markOnboarded } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { LogoIcon } from "@/components/ui/logo";
import { cn } from "@/lib/utils";

type Step = "welcome" | "platform" | "token" | "done";

const platforms = PLATFORMS;

export default function OnboardingPage() {
  const t = useTranslations("auth.onboarding");
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [connecting, setConnecting] = useState(false);

  const platform = platforms.find((p) => p.id === selectedPlatform);

  const handleConnect = async () => {
    if (!token.trim() || !selectedPlatform) return;
    setConnecting(true);

    try {
      const trimmed = token.trim();
      const res = await connectPlatform(selectedPlatform, trimmed);
      await storeDesktopPlatformCreds(selectedPlatform, trimmed, res.username);
      // Refresh the cached platform status so the dashboard doesn't briefly show
      // "nothing connected" after onboarding hands off.
      void invalidatePlatforms();
      toast.success(t("connected", { name: platform?.name ?? selectedPlatform }));
      setStep("done");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("connectionFailed"));
    } finally {
      setConnecting(false);
    }
  };

  // Telegram uses the guided flow (token -> deep link -> auto-detected chat),
  // which hands us the full BOT_TOKEN|CHAT_ID. Returns true on success so the
  // guided component can reset.
  const handleConnectTelegram = async (fullToken: string): Promise<boolean> => {
    setConnecting(true);
    try {
      const res = await connectPlatform("telegram", fullToken);
      await storeDesktopPlatformCreds("telegram", fullToken, res.username);
      void invalidatePlatforms();
      toast.success(t("connected", { name: "Telegram" }));
      setStep("done");
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("connectionFailed"));
      return false;
    } finally {
      setConnecting(false);
    }
  };

  // Both exits stamp onboarded_at, so this screen is shown once per person and
  // never again. Skipping counts: the point is to explain the product, not to
  // force a storage connection. Fire and forget, because a failed stamp must
  // not trap anyone here; the worst case is seeing this screen twice.
  const finishOnboarding = () => {
    void markOnboarded().catch(() => {});
    const { user, setUser } = useAuthStore.getState();
    if (user) setUser({ ...user, onboarded_at: new Date().toISOString() });
    router.push("/dashboard");
  };

  const handleSkip = () => {
    finishOnboarding();
  };

  const stepIndex = ["welcome", "platform", "token", "done"].indexOf(step);

  return (
    <div className="flex items-center justify-center min-h-[80dvh]">
      <div className="max-w-md w-full space-y-8 animate-fade-in">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2">
          {(["welcome", "platform", "token", "done"] as Step[]).map((s, i) => (
            <div
              key={s}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                s === step
                  ? "w-8 bg-[var(--color-accent)]"
                  : i < stepIndex
                    ? "w-4 bg-[var(--color-accent)]/40"
                    : "w-4 bg-[var(--color-border)]",
              )}
            />
          ))}
        </div>

        {step === "welcome" && (
          <div className="space-y-8 animate-fade-in">
            <div className="text-center space-y-4">
              <div className="mx-auto">
                <LogoIcon size={56} />
              </div>
              <h1 className="text-3xl font-bold">
                {t.rich("welcome", {
                  brand: (chunks) => <span className="text-[var(--color-accent)]">{chunks}</span>,
                })}
              </h1>
              <p className="text-sm text-[var(--color-text-secondary)] max-w-sm mx-auto">
                {t("intro")}
              </p>
            </div>

            <div className="space-y-2.5">
              <FeatureRow
                icon={<Lock className="h-4 w-4" />}
                title={t("featureEncryptionTitle")}
                desc={t("featureEncryptionDesc")}
              />
              <FeatureRow
                icon={<Zap className="h-4 w-4" />}
                title={t("featureCompressionTitle")}
                desc={t("featureCompressionDesc")}
              />
              <FeatureRow
                icon={<Shield className="h-4 w-4" />}
                title={t("featurePlatformsTitle")}
                desc={t("featurePlatformsDesc")}
              />
            </div>

            <PrimaryWithSkip
              skipLabel={t("skip")}
              onPrimaryClick={() => setStep("platform")}
              primaryLabel={
                <>
                  {t("getStarted")} <ArrowRight className="h-4 w-4" />
                </>
              }
              onSkip={handleSkip}
            />
          </div>
        )}

        {step === "platform" && (
          <div className="space-y-6 animate-fade-in">
            <div className="text-center space-y-3">
              <h2 className="text-2xl font-bold">{t("choosePlatform")}</h2>
              <p className="text-sm text-[var(--color-text-secondary)]">
                {t("choosePlatformHint")}
              </p>
            </div>

            <div className="space-y-2.5">
              {platforms.map((p) => {
                const isSelected = selectedPlatform === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPlatform(p.id)}
                    className={cn(
                      "w-full flex items-center gap-3.5 rounded-xl border p-4 text-left transition-all",
                      isSelected
                        ? "border-[var(--color-accent)]/40 bg-[var(--color-accent)]/5"
                        : "border-[var(--color-border)] hover:border-[var(--color-border-hover)] hover:bg-[var(--color-surface-1)]",
                    )}
                  >
                    <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-[var(--color-surface-1)] flex-shrink-0">
                      <PlatformIcon platform={p.id} className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {t(`platformTagline.${p.id}`)}
                      </p>
                    </div>
                    {isSelected && (
                      <div className="h-5 w-5 rounded-full bg-[var(--color-accent)] flex items-center justify-center">
                        <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-on-accent)]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <PrimaryWithSkip
              skipLabel={t("skip")}
              onPrimaryClick={() => {
                setToken("");
                setStep("token");
              }}
              primaryDisabled={!selectedPlatform}
              primaryLabel={
                <>
                  {t("continue")} <ArrowRight className="h-4 w-4" />
                </>
              }
              onSkip={handleSkip}
            />
          </div>
        )}

        {step === "token" && platform && (
          <div className="space-y-6 animate-fade-in">
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-[var(--color-surface-1)] mx-auto">
                <PlatformIcon platform={platform.id} className="h-7 w-7" />
              </div>
              <h2 className="text-2xl font-bold">{t("connectTitle", { name: platform.name })}</h2>
              <p className="text-sm text-[var(--color-text-secondary)]">
                {t.rich("tokenHint", {
                  scope: platform.scope,
                  code: (chunks) => (
                    <code className="text-xs bg-[var(--color-surface-1)] px-1.5 py-0.5 rounded">
                      {chunks}
                    </code>
                  ),
                })}
              </p>
            </div>

            <div className="space-y-4">
              {platform.id === "telegram" ? (
                <TelegramConnect
                  onConnect={handleConnectTelegram}
                  connecting={connecting}
                  hasAccounts={false}
                />
              ) : (
                <>
                  <Input
                    type="password"
                    placeholder={platform.placeholder}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    icon={<Key className="h-4 w-4" />}
                  />

                  <Button
                    className="w-full"
                    size="lg"
                    onClick={handleConnect}
                    disabled={connecting || !token.trim()}
                  >
                    {connecting ? t("connecting") : t("connect")}
                  </Button>

                  <a
                    href={platform.tokenUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-center text-xs text-[var(--color-accent)] hover:underline transition-colors"
                  >
                    {t(`platformTokenLabel.${platform.id}`)}
                  </a>
                </>
              )}

              <button
                onClick={() => setStep("platform")}
                className="w-full text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors py-1"
              >
                {t("backToPlatforms")}
              </button>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="text-center space-y-6 animate-fade-in">
            <div className="mx-auto">
              <LogoIcon size={56} />
            </div>
            <div>
              <h2 className="text-2xl font-bold">{t("doneTitle")}</h2>
              <p className="text-sm text-[var(--color-text-secondary)] mt-2">{t("doneBody")}</p>
            </div>
            <Button className="w-full" size="lg" onClick={finishOnboarding}>
              {t("goToVault")} <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function FeatureRow({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5">
      <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-[var(--color-surface-1)] text-[var(--color-text-muted)] flex-shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-[var(--color-text-muted)]">{desc}</p>
      </div>
    </div>
  );
}

/** Primary step-advance button + "Skip for now" link: shared by the welcome and platform steps. */
function PrimaryWithSkip({
  skipLabel,
  onPrimaryClick,
  primaryDisabled,
  primaryLabel,
  onSkip,
}: {
  skipLabel: string;
  onPrimaryClick: () => void;
  primaryDisabled?: boolean;
  primaryLabel: React.ReactNode;
  onSkip: () => void;
}) {
  return (
    <div className="space-y-3">
      <Button className="w-full" size="lg" onClick={onPrimaryClick} disabled={primaryDisabled}>
        {primaryLabel}
      </Button>
      <button
        onClick={onSkip}
        className="w-full flex items-center justify-center gap-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors py-2"
      >
        <SkipForward className="h-3 w-3" />
        {skipLabel}
      </button>
    </div>
  );
}
