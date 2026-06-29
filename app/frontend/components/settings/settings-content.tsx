"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { IconButton } from "@/components/ui/icon-button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StoragePool } from "@/components/settings/storage-pool";
import { usePlatformHealth } from "@/hooks/usePlatformHealth";
import { useAuthStore } from "@/store/auth";
import { useTheme } from "@/components/providers/theme-provider";
import { usePreferencesStore } from "@/store/preferences";
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
import { TelegramConnect } from "@/components/settings/telegram-connect";
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
  Globe,
  User,
  ShieldAlert,
  Eye,
} from "@/lib/icons";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { LogoSpinner } from "@/components/ui/logo-spinner";

const platformNames: Record<string, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  huggingface: "Hugging Face",
  telegram: "Telegram",
};

export function SettingsContent() {
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
  const advancedMode = usePreferencesStore((s) => s.advancedMode);
  const setAdvancedMode = usePreferencesStore((s) => s.setAdvancedMode);
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

  const handleConnect = async (platform: string, token: string): Promise<boolean> => {
    if (!token.trim()) return false;
    if (busyRef.current.has(`connect:${platform}`)) return false;
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
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Connection failed");
      return false;
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

  const themeOptions = [
    { value: "light" as const, icon: Sun, label: "Light" },
    { value: "dark" as const, icon: Moon, label: "Dark" },
    { value: "system" as const, icon: Monitor, label: "System" },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        description="Manage your appearance, connected accounts, storage platforms, and privacy controls."
      />

      {/* Appearance */}
      <div className="panel p-6">
        <Section
          title="Appearance"
          description="Choose how zcrypt looks and which power-user tools are available."
        >
          <div className="space-y-6">
            {/* Theme selector */}
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                Theme
              </p>
              {/* Desktop: segmented button row */}
              <div
                role="radiogroup"
                aria-label="Theme"
                className="hidden sm:inline-flex items-center gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-1"
              >
                {themeOptions.map(({ value, icon: Icon, label }) => {
                  const active = theme === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setTheme(value)}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40",
                        active
                          ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm ring-1 ring-[var(--color-border)]"
                          : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Mobile: native select */}
              <div className="sm:hidden relative">
                <label htmlFor="theme-select" className="sr-only">Theme</label>
                <select
                  id="theme-select"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value as "light" | "dark" | "system")}
                  className="w-full appearance-none rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 pr-10 text-sm font-medium text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)]/40 focus:ring-2 focus:ring-[var(--color-accent)]/10"
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="system">System</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-[var(--color-text-muted)]">
                  <ChevronDown className="h-4 w-4" />
                </div>
              </div>
            </div>

            {/* Advanced mode toggle */}
            <div className="flex items-center justify-between gap-4 border-t border-[var(--color-border)] pt-5">
              <div className="min-w-0">
                <label htmlFor="advanced-mode" className="text-sm font-medium text-[var(--color-text)]">
                  Advanced mode
                </label>
                <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                  Show power-user tools like snapshots, integrity checks, expiring vaults, and device sync.
                </p>
              </div>
              <Switch
                id="advanced-mode"
                checked={advancedMode}
                onCheckedChange={setAdvancedMode}
                aria-label="Advanced mode"
                className="flex-shrink-0 data-[state=checked]:bg-[var(--color-accent)] data-[state=unchecked]:bg-[var(--color-surface-3)]"
              />
            </div>
          </div>
        </Section>
      </div>

      {/* Linked Accounts (OAuth) */}
      <LinkedAccounts />

      {/* Platform connections */}
      <div className="panel p-6">
        <Section
          title="Platform connections"
          description="Connect storage backends. zcrypt distributes encrypted, disguised chunks across your connected accounts."
        >
          <div className="space-y-4">
            <PlatformSection
              icon={<Github className="h-5 w-5" />}
              name="GitHub"
              platform="github"
              description="Personal access token with repo scope — up to 1 GB per repo"
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

            <PlatformSection
              icon={<GitlabIcon className="h-5 w-5 text-orange-500 dark:text-orange-400" />}
              name="GitLab"
              platform="gitlab"
              description="Personal access token with api scope — up to 10 GB per repo"
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

            <PlatformSection
              icon={<HuggingFaceIcon className="h-5 w-5 text-yellow-500 dark:text-yellow-400" />}
              name="Hugging Face"
              platform="huggingface"
              description="Access token with write permission — up to 300 GB per repo"
              tokenUrl="https://huggingface.co/settings/tokens/new?tokenType=write"
              tokenLabel="Generate token on Hugging Face"
              placeholder="hf_xxxxxxxxxxxx"
              token={huggingfaceToken}
              onTokenChange={setHuggingfaceToken}
              onConnect={() => handleConnect("huggingface", huggingfaceToken)}
              connecting={connecting === "huggingface"}
              connectedAccounts={huggingfaceAccounts}
              onDisconnect={(username) => handleDisconnectClick("huggingface", username)}
              disconnecting={disconnecting}
              onToggleScope={handleToggleScope}
              isAdmin={isAdmin}
            />

            <PlatformSection
              icon={<TelegramIcon className="h-5 w-5 text-sky-500 dark:text-sky-400" />}
              name="Telegram"
              platform="telegram"
              description="Bot token + channel — guided setup, unlimited storage"
              tokenUrl="https://t.me/BotFather"
              tokenLabel="Create bot via @BotFather"
              placeholder="123456:ABC-DEF|@channel_name"
              token={telegramToken}
              onTokenChange={setTelegramToken}
              onConnect={() => handleConnect("telegram", telegramToken)}
              connecting={connecting === "telegram"}
              connectedAccounts={telegramAccounts}
              onDisconnect={(username) => handleDisconnectClick("telegram", username)}
              disconnecting={disconnecting}
              onToggleScope={handleToggleScope}
              isAdmin={isAdmin}
              customConnect={
                <TelegramConnect
                  onConnect={(token) => handleConnect("telegram", token)}
                  connecting={connecting === "telegram"}
                  hasAccounts={telegramAccounts.length > 0}
                />
              }
            />
          </div>
        </Section>
      </div>

      {/* Storage Pool — absorbed from Platforms page */}
      <StoragePool />

      {/* Platform quotas & rate limits */}
      <RateLimits statuses={statuses} repos={repos} />

      {/* Vault backup */}
      <ExportImport files={files} />

      {/* Privacy */}
      <div className="panel p-6">
        <Section
          title="Privacy"
          description="Advanced safeguards for high-risk threat models."
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ToolLink
              href="/settings/deadman"
              icon={<ShieldAlert className="h-4 w-4" />}
              title="Dead man's switch"
              desc="Auto-notify a contact if you go silent"
            />
            <ToolLink
              href="/settings/decoy"
              icon={<Eye className="h-4 w-4" />}
              title="Decoy profile"
              desc="Plausible deniability with a decoy vault"
            />
          </div>
        </Section>
      </div>

      {/* Security Activity — admin only */}
      {isAdmin && <SecurityActivity />}

      {/* How it works — collapsible */}
      <HowItWorks />

      {/* Confirm disconnect modal */}
      <ConfirmDialog
        open={!!disconnectTarget}
        onOpenChange={(open) => { if (!open) setDisconnectTarget(null); }}
        destructive
        title="Disconnect platform?"
        description={
          disconnectTarget
            ? `Disconnect ${platformNames[disconnectTarget.platform] ?? disconnectTarget.platform} account @${disconnectTarget.username}? Files stored on this platform will remain but may become inaccessible.`
            : ""
        }
        confirmLabel="Disconnect"
        loading={!!disconnecting}
        onConfirm={executeDisconnect}
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
  customConnect,
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
  /** When provided, replaces the default token input + connect button (e.g. the
   *  guided Telegram flow). The connected-accounts list above stays shared. */
  customConnect?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-1)]/40">
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3.5">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)]">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-[var(--color-text)]">{name}</h3>
          <p className="truncate text-xs text-[var(--color-text-secondary)]">{description}</p>
        </div>
        {connectedAccounts.length > 0 && (
          <Badge
            variant="outline"
            className="flex-shrink-0 border-[var(--color-accent)]/25 bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
          >
            {connectedAccounts.length} connected
          </Badge>
        )}
      </div>

      <div className="space-y-4 p-4">
        {/* Connected accounts list */}
        {connectedAccounts.length > 0 && (
          <ul className="space-y-2">
            {connectedAccounts.map((acc) => {
              const isDisconnecting = disconnecting === `${platform}:${acc.username}`;
              return (
                <li
                  key={`${acc.platform}:${acc.username}`}
                  className="flex items-center gap-2 rounded-xl border border-[var(--color-accent)]/15 bg-[var(--color-accent)]/5 px-3 py-2"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-[var(--color-accent)]" />
                  <span className="min-w-0 flex-1 truncate text-sm text-[var(--color-text)]">
                    @{acc.username}
                  </span>
                  {isAdmin && acc.token_id && (
                    <button
                      type="button"
                      onClick={() => onToggleScope(acc.token_id!, !!acc.is_global)}
                      title={
                        acc.is_global
                          ? "Global — shared with all users. Click to make local."
                          : "Local — only you. Click to share with all users."
                      }
                      className={cn(
                        "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40",
                        acc.is_global
                          ? "border-blue-500/20 bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
                          : "border-amber-500/20 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 dark:text-amber-400"
                      )}
                    >
                      {acc.is_global ? <Globe className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                      {acc.is_global ? "Global" : "Local"}
                    </button>
                  )}
                  {isDisconnecting ? (
                    <span className="flex h-9 w-9 items-center justify-center text-[var(--color-text-muted)]">
                      <LogoSpinner size={14} speed="fast" />
                    </span>
                  ) : (
                    <IconButton
                      icon={XCircle}
                      label={`Disconnect @${acc.username}`}
                      variant="ghost"
                      iconClassName="h-3.5 w-3.5"
                      onClick={() => acc.username && onDisconnect(acc.username)}
                      className="text-[var(--color-text-muted)] hover:text-red-500"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {customConnect ?? (
          <>
            {/* Token input */}
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex-1">
                <Input
                  type="password"
                  placeholder={placeholder}
                  value={token}
                  onChange={(e) => onTokenChange(e.target.value)}
                  icon={<Key className="h-4 w-4" />}
                  aria-label={`${name} token`}
                />
              </div>
              <Button onClick={onConnect} disabled={connecting || !token.trim()} className="sm:self-start">
                {connecting ? (
                  <span className="flex items-center gap-2">
                    <LogoSpinner size={14} speed="fast" />
                    Connecting...
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    {connectedAccounts.length > 0 ? "Add account" : "Connect"}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                )}
              </Button>
            </div>

            <a
              href={tokenUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded text-xs text-[var(--color-accent)] outline-none transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
            >
              {tokenLabel}
              <ExternalLink className="h-3 w-3" />
            </a>
          </>
        )}
      </div>
    </div>
  );
}

function HowItWorks() {
  const [open, setOpen] = useState(false);

  return (
    <div className="panel overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-6 py-4 text-left outline-none transition-colors hover:bg-[var(--color-surface-1)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)]/40"
      >
        <h2 className="text-sm font-semibold text-[var(--color-text)]">How it works</h2>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-[var(--color-text-muted)] transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-5 border-t border-[var(--color-border)] px-6 pb-6 pt-5"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
              title="Chunk & push"
              desc="Split into 80 MB chunks, disguised as build artifacts"
            />
          </div>
          <div className="flex items-start gap-3 border-t border-[var(--color-border)] pt-4">
            <Shield className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--color-accent)]/70" />
            <p className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
              Your passphrase never leaves your machine. Platforms only see encrypted binary blobs
              with randomized filenames — zero knowledge.
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function ToolLink({
  href,
  icon,
  title,
  desc,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-1)]/40 p-4 outline-none transition-colors hover:border-[var(--color-accent)]/30 hover:bg-[var(--color-surface-1)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
    >
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface)] text-[var(--color-text-muted)] ring-1 ring-[var(--color-border)] transition-colors group-hover:text-[var(--color-accent)]">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--color-text)] transition-colors group-hover:text-[var(--color-accent)]">
          {title}
        </p>
        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{desc}</p>
      </div>
      <ArrowRight className="ml-auto mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--color-text-muted)] transition-colors group-hover:text-[var(--color-accent)]" />
    </Link>
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
      <div className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface-1)] text-[var(--color-text-muted)] ring-1 ring-[var(--color-border)]">
        {icon}
        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[10px] font-bold tabular-nums text-[var(--color-text-secondary)]">
          {step}
        </span>
      </div>
      <div>
        <p className="text-xs font-semibold text-[var(--color-text)]">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-text-muted)]">{desc}</p>
      </div>
    </div>
  );
}
