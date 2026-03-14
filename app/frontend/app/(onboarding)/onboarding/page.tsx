"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { connectPlatform } from "@/lib/api";
import { toast } from "@/store/toast";
import { GitlabIcon } from "@/components/icons/gitlab";
import { HuggingFaceIcon } from "@/components/icons/huggingface";
import { TelegramIcon } from "@/components/icons/telegram";
import {
  Shield,
  Github,
  ArrowRight,
  Lock,
  Zap,
  Key,
  CheckCircle2,
  SkipForward,
} from "@/lib/icons";
import { cn } from "@/lib/utils";

type Step = "welcome" | "platform" | "token" | "done";

const platforms = [
  {
    id: "github",
    name: "GitHub",
    icon: Github,
    description: "Up to 1GB per repo",
    placeholder: "ghp_xxxxxxxxxxxx",
    scope: "repo",
    tokenUrl: "https://github.com/settings/tokens/new?scopes=repo&description=zcrypt",
    tokenLabel: "Generate token on GitHub",
  },
  {
    id: "gitlab",
    name: "GitLab",
    icon: null,
    customIcon: "gitlab",
    description: "Up to 10GB per repo",
    placeholder: "glpat-xxxxxxxxxxxx",
    scope: "api",
    tokenUrl: "https://gitlab.com/-/user_settings/personal_access_tokens?name=zcrypt&scopes=api",
    tokenLabel: "Generate token on GitLab",
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    icon: null,
    customIcon: "huggingface",
    description: "Up to 300GB per repo",
    placeholder: "hf_xxxxxxxxxxxx",
    scope: "write",
    tokenUrl: "https://huggingface.co/settings/tokens/new?tokenType=write",
    tokenLabel: "Generate token on Hugging Face",
  },
  {
    id: "telegram",
    name: "Telegram",
    icon: null,
    customIcon: "telegram",
    description: "Unlimited storage via channels",
    placeholder: "123456:ABC-DEF|@channel_name",
    scope: "bot token + channel",
    tokenUrl: "https://t.me/BotFather",
    tokenLabel: "Create bot via @BotFather",
  },
] as const;

export default function OnboardingPage() {
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
      await connectPlatform(selectedPlatform, token.trim());
      toast.success(`${platform?.name ?? selectedPlatform} connected!`);
      setStep("done");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setConnecting(false);
    }
  };

  const handleSkip = () => {
    router.push("/dashboard");
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
                    : "w-4 bg-[var(--color-border)]"
              )}
            />
          ))}
        </div>

        {step === "welcome" && (
          <div className="space-y-8 animate-fade-in">
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20 mx-auto">
                <Shield className="h-8 w-8 text-[var(--color-accent)]" />
              </div>
              <h1 className="text-3xl font-bold">
                Welcome to <span className="text-[var(--color-accent)]">zcrypt</span>
              </h1>
              <p className="text-sm text-[var(--color-text-secondary)] max-w-sm mx-auto">
                Encrypted, compressed, zero-knowledge cloud storage using Git
                platforms as free backends.
              </p>
            </div>

            <div className="space-y-2.5">
              <FeatureRow
                icon={<Lock className="h-4 w-4" />}
                title="AES-256-GCM Encryption"
                desc="Files are encrypted before leaving your machine"
              />
              <FeatureRow
                icon={<Zap className="h-4 w-4" />}
                title="Zstd Compression"
                desc="Maximum compression before encryption"
              />
              <FeatureRow
                icon={<Shield className="h-4 w-4" />}
                title="Multi-platform Storage"
                desc="GitHub, GitLab, Hugging Face, or Telegram as backends"
              />
            </div>

            <div className="space-y-3">
              <Button className="w-full" size="lg" onClick={() => setStep("platform")}>
                Get Started <ArrowRight className="h-4 w-4" />
              </Button>
              <button
                onClick={handleSkip}
                className="w-full flex items-center justify-center gap-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors py-2"
              >
                <SkipForward className="h-3 w-3" />
                Skip for now
              </button>
            </div>
          </div>
        )}

        {step === "platform" && (
          <div className="space-y-6 animate-fade-in">
            <div className="text-center space-y-3">
              <h2 className="text-2xl font-bold">
                Choose a platform
              </h2>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Connect at least one platform to start storing files
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
                        : "border-[var(--color-border)] hover:border-[var(--color-border-hover)] hover:bg-[var(--color-surface-1)]"
                    )}
                  >
                    <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-[var(--color-surface-1)] flex-shrink-0">
                      {p.id === "github" && <Github className="h-5 w-5" />}
                      {p.id === "gitlab" && <GitlabIcon className="h-5 w-5 text-orange-500 dark:text-orange-400" />}
                      {p.id === "huggingface" && <HuggingFaceIcon className="h-5 w-5 text-yellow-500 dark:text-yellow-400" />}
                      {p.id === "telegram" && <TelegramIcon className="h-5 w-5 text-sky-500 dark:text-sky-400" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">{p.description}</p>
                    </div>
                    {isSelected && (
                      <div className="h-5 w-5 rounded-full bg-[var(--color-accent)] flex items-center justify-center">
                        <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="space-y-3">
              <Button
                className="w-full"
                size="lg"
                onClick={() => { setToken(""); setStep("token"); }}
                disabled={!selectedPlatform}
              >
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
              <button
                onClick={handleSkip}
                className="w-full flex items-center justify-center gap-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors py-2"
              >
                <SkipForward className="h-3 w-3" />
                Skip for now
              </button>
            </div>
          </div>
        )}

        {step === "token" && platform && (
          <div className="space-y-6 animate-fade-in">
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-[var(--color-surface-1)] mx-auto">
                {platform.id === "github" && <Github className="h-7 w-7" />}
                {platform.id === "gitlab" && <GitlabIcon className="h-7 w-7 text-orange-500 dark:text-orange-400" />}
                {platform.id === "huggingface" && <HuggingFaceIcon className="h-7 w-7 text-yellow-500 dark:text-yellow-400" />}
                {platform.id === "telegram" && <TelegramIcon className="h-7 w-7 text-sky-500 dark:text-sky-400" />}
              </div>
              <h2 className="text-2xl font-bold">
                Connect {platform.name}
              </h2>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Create a Personal Access Token with{" "}
                <code className="text-xs bg-[var(--color-surface-1)] px-1.5 py-0.5 rounded">
                  {platform.scope}
                </code>{" "}
                scope
              </p>
            </div>

            <div className="space-y-4">
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
                {connecting ? "Connecting..." : "Connect"}
              </Button>

              <a
                href={platform.tokenUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center text-xs text-[var(--color-accent)] hover:underline transition-colors"
              >
                {platform.tokenLabel}
              </a>

              <button
                onClick={() => setStep("platform")}
                className="w-full text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors py-1"
              >
                Back to platform selection
              </button>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="text-center space-y-6 animate-fade-in">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20 mx-auto">
              <CheckCircle2 className="h-8 w-8 text-[var(--color-accent)]" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">
                You&apos;re all set!
              </h2>
              <p className="text-sm text-[var(--color-text-secondary)] mt-2">
                Start uploading encrypted files to your vault.
              </p>
            </div>
            <Button
              className="w-full"
              size="lg"
              onClick={() => router.push("/dashboard")}
            >
              Go to Vault <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function FeatureRow({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
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
