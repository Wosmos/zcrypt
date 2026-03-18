"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StoragePool } from "@/components/settings/storage-pool";
import { usePlatformHealth } from "@/hooks/usePlatformHealth";
import { useAuthStore } from "@/store/auth";
import { useTheme } from "@/components/providers/theme-provider";
import { connectPlatform, disconnectPlatform, toggleTokenScope } from "@/lib/api";
import { toast } from "@/store/toast";
import { RateLimits } from "@/components/settings/rate-limits";
import { ExportImport } from "@/components/vault/export-import";
import { LinkedAccounts } from "@/components/settings/linked-accounts";
import { SecurityActivity } from "@/components/settings/security-activity";
import { useFileList } from "@/hooks/useFileList";
import { GitlabIcon } from "@/components/icons/gitlab";
import { HuggingFaceIcon } from "@/components/icons/huggingface";
import { TelegramIcon } from "@/components/icons/telegram";
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
  ChevronDown,
  Settings,
  Globe,
  User,
} from "@/lib/icons";
import { cn } from "@/lib/utils";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { LogoSpinner } from "@/components/ui/logo-spinner";

export default function SettingsPage() {
  const [githubToken, setGithubToken] = useState("");
  const [gitlabToken, setGitlabToken] = useState("");
  const [huggingfaceToken, setHuggingfaceToken] = useState("");
  const [telegramToken, setTelegramToken] = useState("");
  const [connecting, setConnecting] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [scopeOverrides, setScopeOverrides] = useState<Record<string, boolean>>({});
  const busyRef = useRef<Set<string>>(new Set());
  const [disconnectTarget, setDisconnectTarget] = useState<{ platform: string; username: string } | null>(null);
  const { statuses, repos, refresh } = usePlatformHealth();
  const { files } = useFileList();
  const { theme, setTheme } = useTheme();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin";

  // Clear optimistic overrides when fresh data arrives
  useEffect(() => { setScopeOverrides({}); }, [statuses]);

  // Apply optimistic scope overrides to statuses
  const effectiveStatuses = statuses.map((s) =>
    s.token_id && s.token_id in scopeOverrides
      ? { ...s, is_global: scopeOverrides[s.token_id] }
      : s
  );

  // Non-admins only see their own (non-global) tokens
  const visibleStatuses = isAdmin
    ? effectiveStatuses
    : effectiveStatuses.filter((s) => !s.is_global);

  const githubAccounts = visibleStatuses.filter(
    (s) => s.platform === "github" && s.connected
  );
  const gitlabAccounts = visibleStatuses.filter(
    (s) => s.platform === "gitlab" && s.connected
  );
  const huggingfaceAccounts = visibleStatuses.filter(
    (s) => s.platform === "huggingface" && s.connected
  );
  const telegramAccounts = visibleStatuses.filter(
    (s) => s.platform === "telegram" && s.connected
  );

  const platformNames: Record<string, string> = {
    github: "GitHub",
    gitlab: "GitLab",
    huggingface: "Hugging Face",
    telegram: "Telegram",
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
      if (platform === "telegram") setTelegramToken("");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Connection failed");
    } finally {
      busyRef.current.delete(`connect:${platform}`);
      setConnecting(null);
    }
  };

  const handleDisconnectClick = (platform: string, username: string) => {
    setDisconnectTarget({ platform, username });
  };

  const executeDisconnect = async () => {
    if (!disconnectTarget) return;
    const { platform, username } = disconnectTarget;
    const key = `disconnect:${platform}:${username}`;
    if (busyRef.current.has(key)) return;
    busyRef.current.add(key);
    setDisconnecting(`${platform}:${username}`);
    try {
      await disconnectPlatform(platform, username);
      toast.success(
        `${platformNames[platform] ?? platform} @${username} disconnected`
      );
      setDisconnectTarget(null);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Disconnect failed");
    } finally {
      busyRef.current.delete(key);
      setDisconnecting(null);
    }
  };

  const handleToggleScope = async (tokenId: string, currentIsGlobal: boolean) => {
    const newScope = !currentIsGlobal;
    setScopeOverrides((prev) => ({ ...prev, [tokenId]: newScope }));
    try {
      await toggleTokenScope(tokenId, newScope);
      refresh();
    } catch (err) {
      setScopeOverrides((prev) => { const next = { ...prev }; delete next[tokenId]; return next; });
      toast.error(err instanceof Error ? err.message : "Failed to update token scope");
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-[var(--color-surface-1)] ring-1 ring-[var(--color-border)]">
          <Settings className="h-5 w-5 text-[var(--color-text-muted)]" />
        </div>
        <div>
          <p className="text-[10px] font-semibold text-[var(--color-accent)] uppercase tracking-widest">Configuration</p>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight">Settings</h1>
        </div>
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
                    ? "bg-[var(--color-accent)]/10 border-[var(--color-accent)]/30 text-[var(--color-accent)]"
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

      {/* Linked Accounts (OAuth) */}
      <LinkedAccounts />

      {/* Platform connections */}
      <div className="space-y-4">
        <h2 className="section-label">Platform Connections</h2>

        {/* GitHub */}
        <PlatformSection
          icon={<Github className="h-5 w-5" />}
          name="GitHub"
          platform="github"
          description="Personal Access Token with repo scope — up to 1GB per repo"
          tokenUrl="https://github.com/settings/tokens/new?scopes=repo&description=zcrypt"
          tokenLabel="Generate token on GitHub"
          placeholder="ghp_xxxxxxxxxxxx"
          token={githubToken}
          onTokenChange={setGithubToken}
          onConnect={() => handleConnect("github", githubToken)}
          connecting={connecting === "github"}
          connectedAccounts={githubAccounts}
          onDisconnect={(username) => handleDisconnectClick("github", username)}
          disconnecting={disconnecting}
          onToggleScope={handleToggleScope}
          isAdmin={isAdmin}
        />

        {/* GitLab */}
        <PlatformSection
          icon={<GitlabIcon className="h-5 w-5 text-orange-500 dark:text-orange-400" />}
          name="GitLab"
          platform="gitlab"
          description="Personal Access Token with api scope — up to 10GB per repo"
          tokenUrl="https://gitlab.com/-/user_settings/personal_access_tokens?name=zcrypt&scopes=api"
          tokenLabel="Generate token on GitLab"
          placeholder="glpat-xxxxxxxxxxxx"
          token={gitlabToken}
          onTokenChange={setGitlabToken}
          onConnect={() => handleConnect("gitlab", gitlabToken)}
          connecting={connecting === "gitlab"}
          connectedAccounts={gitlabAccounts}
          onDisconnect={(username) => handleDisconnectClick("gitlab", username)}
          disconnecting={disconnecting}
          onToggleScope={handleToggleScope}
          isAdmin={isAdmin}
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
            handleDisconnectClick("huggingface", username)
          }
          disconnecting={disconnecting}
          onToggleScope={handleToggleScope}
          isAdmin={isAdmin}
        />

        {/* Telegram */}
        <PlatformSection
          icon={<TelegramIcon className="h-5 w-5 text-sky-500 dark:text-sky-400" />}
          name="Telegram"
          platform="telegram"
          description="Bot Token + Channel ID — format: BOT_TOKEN|CHAT_ID — unlimited storage"
          tokenUrl="https://t.me/BotFather"
          tokenLabel="Create bot via @BotFather"
          placeholder="123456:ABC-DEF|@channel_name"
          token={telegramToken}
          onTokenChange={setTelegramToken}
          onConnect={() => handleConnect("telegram", telegramToken)}
          connecting={connecting === "telegram"}
          connectedAccounts={telegramAccounts}
          onDisconnect={(username) =>
            handleDisconnectClick("telegram", username)
          }
          disconnecting={disconnecting}
          onToggleScope={handleToggleScope}
          isAdmin={isAdmin}
        />
      </div>

      {/* Storage Pool — absorbed from Platforms page */}
      <StoragePool />

      {/* Platform quotas & rate limits */}
      <RateLimits statuses={statuses} repos={repos} />

      {/* Vault backup */}
      <ExportImport files={files} />

      {/* Security Activity — admin only */}
      {isAdmin && <SecurityActivity />}

      {/* How it works — collapsible */}
      <HowItWorks />

      {/* Confirm disconnect modal */}
      <ConfirmModal
        open={!!disconnectTarget}
        onConfirm={executeDisconnect}
        onClose={() => setDisconnectTarget(null)}
        title="Disconnect Platform"
        description={
          disconnectTarget
            ? `Disconnect ${platformNames[disconnectTarget.platform] ?? disconnectTarget.platform} account @${disconnectTarget.username}? Files stored on this platform will remain but may become inaccessible.`
            : ""
        }
        details={disconnectTarget ? `@${disconnectTarget.username}` : undefined}
        confirmLabel="Disconnect"
        variant="warning"
        loading={!!disconnecting}
      />
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
  onToggleScope,
  isAdmin,
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
  onToggleScope: (tokenId: string, currentIsGlobal: boolean) => void;
  isAdmin?: boolean;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--color-border)]">
        <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-[var(--color-surface-1)]">
          {icon}
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-semibold">{name}</h2>
          <p className="text-xs text-[var(--color-text-secondary)]">{description}</p>
        </div>
        {connectedAccounts.length > 0 && (
          <span className="text-xs font-medium text-[var(--color-accent)] bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20 px-2.5 py-1 rounded-full">
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
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-cyan-500/5 border border-cyan-500/15"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-cyan-500 flex-shrink-0" />
                <span className="text-sm flex-1">
                  @{acc.username}
                </span>
                {isAdmin && acc.token_id && (
                  <button
                    onClick={() => onToggleScope(acc.token_id!, !!acc.is_global)}
                    title={acc.is_global ? "Global — shared with all users. Click to make local." : "Local — only you. Click to share with all users."}
                    className={cn(
                      "inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors cursor-pointer",
                      acc.is_global
                        ? "bg-blue-500/10 text-blue-500 border border-blue-500/20 hover:bg-blue-500/20"
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/20"
                    )}
                  >
                    {acc.is_global ? (
                      <Globe className="h-3.5 w-3.5" />
                    ) : (
                      <User className="h-3.5 w-3.5" />
                    )}
                    {acc.is_global ? "Global" : "Local"}
                  </button>
                )}
                <button
                  onClick={() => acc.username && onDisconnect(acc.username)}
                  disabled={
                    disconnecting === `${platform}:${acc.username}`
                  }
                  className="text-xs text-[var(--color-text-muted)] hover:text-red-500 transition-colors disabled:opacity-50"
                >
                  {disconnecting === `${platform}:${acc.username}` ? (
                    <LogoSpinner size={12} speed="fast" />
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
                <LogoSpinner size={14} speed="fast" />
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
          className="inline-flex items-center gap-1.5 text-xs text-[var(--color-accent)] hover:underline transition-colors"
        >
          {tokenLabel}
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </section>
  );
}

function HowItWorks() {
  const [open, setOpen] = useState(false);

  return (
    <section className="card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[var(--color-surface-1)] transition-colors"
      >
        <h2 className="text-sm font-semibold">How it works</h2>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-[var(--color-text-muted)] transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <div className="p-5 pt-0 space-y-5 border-t border-[var(--color-border)] animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-5">
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
            <Shield className="h-4 w-4 text-cyan-500/60 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
              Your passphrase never leaves your machine. Platforms only see
              encrypted binary blobs with randomized filenames — zero knowledge.
            </p>
          </div>
        </div>
      )}
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
        <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[10px] font-bold text-[var(--color-text-secondary)] flex items-center justify-center">
          {step}
        </span>
      </div>
      <div>
        <p className="text-xs font-semibold">{title}</p>
        <p className="text-xs text-[var(--color-text-muted)] leading-relaxed mt-0.5">
          {desc}
        </p>
      </div>
    </div>
  );
}
