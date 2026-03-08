"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePlatformHealth } from "@/hooks/usePlatformHealth";
import { useTheme } from "@/components/providers/theme-provider";
import { connectPlatform, disconnectPlatform } from "@/lib/api";
import { toast } from "@/store/toast";
import { GitlabIcon } from "@/components/icons/gitlab";
import { HuggingFaceIcon } from "@/components/icons/huggingface";
import type { PlatformStatus } from "@/types";
import {
  Github,
  CheckCircle2,
  Key,
  ExternalLink,
  Shield,
  Zap,
  Box,
  Lock,
  ArrowRight,
  XCircle,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const [githubToken, setGithubToken] = useState("");
  const [gitlabToken, setGitlabToken] = useState("");
  const [huggingfaceToken, setHuggingfaceToken] = useState("");
  const [connecting, setConnecting] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const busyRef = useRef<Set<string>>(new Set());
  const { statuses, refresh } = usePlatformHealth();
  const { theme, setTheme } = useTheme();

  const githubAccounts = statuses.filter(
    (s) => s.platform === "github" && s.connected
  );
  const gitlabAccounts = statuses.filter(
    (s) => s.platform === "gitlab" && s.connected
  );
  const huggingfaceAccounts = statuses.filter(
    (s) => s.platform === "huggingface" && s.connected
  );

  const platformNames: Record<string, string> = {
    github: "GitHub",
    gitlab: "GitLab",
    huggingface: "Hugging Face",
  };

  const handleConnect = async (platform: string, token: string) => {
    if (!token.trim()) return;
    if (busyRef.current.has(`connect:${platform}`)) return;
    busyRef.current.add(`connect:${platform}`);
    setConnecting(platform);

    try {
      await connectPlatform(platform, token.trim());
      toast.success(`${platformNames[platform] ?? platform} connected!`);
      if (platform === "github") setGithubToken("");
      if (platform === "gitlab") setGitlabToken("");
      if (platform === "huggingface") setHuggingfaceToken("");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Connection failed");
    } finally {
      busyRef.current.delete(`connect:${platform}`);
      setConnecting(null);
    }
  };

  const handleDisconnect = async (platform: string, username: string) => {
    const key = `disconnect:${platform}:${username}`;
    if (busyRef.current.has(key)) return;
    busyRef.current.add(key);
    setDisconnecting(`${platform}:${username}`);
    try {
      await disconnectPlatform(platform, username);
      toast.success(
        `${platformNames[platform] ?? platform} @${username} disconnected`
      );
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Disconnect failed");
    } finally {
      busyRef.current.delete(key);
      setDisconnecting(null);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          Settings
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Connect platforms and manage your vault
        </p>
      </div>

      {/* Theme */}
      <section className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-sm font-semibold">Appearance</h2>
        </div>
        <div className="p-5">
          <div className="flex gap-2">
            {([
              { value: "light" as const, icon: Sun, label: "Light" },
              { value: "dark" as const, icon: Moon, label: "Dark" },
              { value: "system" as const, icon: Monitor, label: "System" },
            ]).map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all border",
                  theme === value
                    ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-300"
                    : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-1)]"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Platform connections */}
      <div className="space-y-4">
        <h2 className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          Platform Connections
        </h2>

        {/* GitHub */}
        <PlatformSection
          icon={<Github className="h-5 w-5" />}
          name="GitHub"
          platform="github"
          description="Personal Access Token with repo scope — up to 1GB per repo"
          tokenUrl="https://github.com/settings/tokens/new?scopes=repo&description=zpush"
          tokenLabel="Generate token on GitHub"
          placeholder="ghp_xxxxxxxxxxxx"
          token={githubToken}
          onTokenChange={setGithubToken}
          onConnect={() => handleConnect("github", githubToken)}
          connecting={connecting === "github"}
          connectedAccounts={githubAccounts}
          onDisconnect={(username) => handleDisconnect("github", username)}
          disconnecting={disconnecting}
        />

        {/* GitLab */}
        <PlatformSection
          icon={<GitlabIcon className="h-5 w-5 text-orange-500 dark:text-orange-400" />}
          name="GitLab"
          platform="gitlab"
          description="Personal Access Token with api scope — up to 10GB per repo"
          tokenUrl="https://gitlab.com/-/user_settings/personal_access_tokens?name=zpush&scopes=api"
          tokenLabel="Generate token on GitLab"
          placeholder="glpat-xxxxxxxxxxxx"
          token={gitlabToken}
          onTokenChange={setGitlabToken}
          onConnect={() => handleConnect("gitlab", gitlabToken)}
          connecting={connecting === "gitlab"}
          connectedAccounts={gitlabAccounts}
          onDisconnect={(username) => handleDisconnect("gitlab", username)}
          disconnecting={disconnecting}
        />

        {/* Hugging Face */}
        <PlatformSection
          icon={<HuggingFaceIcon className="h-5 w-5 text-yellow-500 dark:text-yellow-400" />}
          name="Hugging Face"
          platform="huggingface"
          description="Access Token with write permission — up to 300GB per repo"
          tokenUrl="https://huggingface.co/settings/tokens/new?tokenType=write"
          tokenLabel="Generate token on Hugging Face"
          placeholder="hf_xxxxxxxxxxxx"
          token={huggingfaceToken}
          onTokenChange={setHuggingfaceToken}
          onConnect={() => handleConnect("huggingface", huggingfaceToken)}
          connecting={connecting === "huggingface"}
          connectedAccounts={huggingfaceAccounts}
          onDisconnect={(username) =>
            handleDisconnect("huggingface", username)
          }
          disconnecting={disconnecting}
        />
      </div>

      {/* How it works */}
      <section className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-sm font-semibold">How it works</h2>
        </div>
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <PipelineStep
              icon={<Zap className="h-4 w-4" />}
              step="1"
              title="Compress"
              desc="Zstd compression shrinks files before encryption"
            />
            <PipelineStep
              icon={<Lock className="h-4 w-4" />}
              step="2"
              title="Encrypt"
              desc="AES-256-GCM with PBKDF2 derived keys (600K iterations)"
            />
            <PipelineStep
              icon={<Box className="h-4 w-4" />}
              step="3"
              title="Chunk & Push"
              desc="Split into 80MB chunks, disguised as build artifacts"
            />
          </div>
          <div className="flex items-start gap-3 pt-3 border-t border-[var(--color-border)]">
            <Shield className="h-4 w-4 text-indigo-500/60 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
              Your passphrase never leaves your machine. Platforms only see
              encrypted binary blobs with randomized filenames — zero knowledge.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function PlatformSection({
  icon,
  name,
  platform,
  description,
  tokenUrl,
  tokenLabel,
  placeholder,
  token,
  onTokenChange,
  onConnect,
  connecting,
  connectedAccounts,
  onDisconnect,
  disconnecting,
}: {
  icon: React.ReactNode;
  name: string;
  platform: string;
  description: string;
  tokenUrl: string;
  tokenLabel: string;
  placeholder: string;
  token: string;
  onTokenChange: (v: string) => void;
  onConnect: () => void;
  connecting: boolean;
  connectedAccounts: PlatformStatus[];
  onDisconnect: (username: string) => void;
  disconnecting: string | null;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--color-border)]">
        <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-[var(--color-surface-1)]">
          {icon}
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-semibold">{name}</h2>
          <p className="text-[11px] text-[var(--color-text-secondary)]">{description}</p>
        </div>
        {connectedAccounts.length > 0 && (
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
            {connectedAccounts.length} connected
          </span>
        )}
      </div>

      <div className="p-5 space-y-4">
        {/* Connected accounts list */}
        {connectedAccounts.length > 0 && (
          <div className="space-y-2">
            {connectedAccounts.map((acc) => (
              <div
                key={`${acc.platform}:${acc.username}`}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/5 border border-emerald-500/15"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                <span className="text-sm flex-1">
                  @{acc.username}
                </span>
                <button
                  onClick={() => acc.username && onDisconnect(acc.username)}
                  disabled={
                    disconnecting === `${platform}:${acc.username}`
                  }
                  className="text-xs text-[var(--color-text-muted)] hover:text-red-500 transition-colors disabled:opacity-50"
                >
                  {disconnecting === `${platform}:${acc.username}` ? (
                    <span className="h-3 w-3 border border-[var(--color-border)] border-t-[var(--color-text-secondary)] rounded-full animate-spin inline-block" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Token input */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Input
              type="password"
              placeholder={placeholder}
              value={token}
              onChange={(e) => onTokenChange(e.target.value)}
              icon={<Key className="h-4 w-4" />}
            />
          </div>
          <Button
            onClick={onConnect}
            disabled={connecting || !token.trim()}
            className="sm:self-end"
          >
            {connecting ? (
              <span className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Connecting...
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                {connectedAccounts.length > 0
                  ? "Add Account"
                  : "Connect"}{" "}
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            )}
          </Button>
        </div>

        <a
          href={tokenUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-indigo-500 hover:text-indigo-400 transition-colors"
        >
          {tokenLabel}
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </section>
  );
}

function PipelineStep({
  icon,
  step,
  title,
  desc,
}: {
  icon: React.ReactNode;
  step: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="relative flex items-center justify-center h-9 w-9 rounded-xl bg-[var(--color-surface-1)] text-[var(--color-text-muted)] flex-shrink-0">
        {icon}
        <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[9px] font-bold text-[var(--color-text-secondary)] flex items-center justify-center">
          {step}
        </span>
      </div>
      <div>
        <p className="text-xs font-semibold">{title}</p>
        <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed mt-0.5">
          {desc}
        </p>
      </div>
    </div>
  );
}
