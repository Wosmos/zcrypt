"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { IconButton } from "@/components/ui/icon-button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StoragePool } from "@/components/settings/storage-pool";
import { usePlatformHealth } from "@/hooks/usePlatformHealth";
import { useAuthStore } from "@/store/auth";
import { useTheme } from "@/components/providers/theme-provider";
import { usePreferencesStore } from "@/store/preferences";
import { useKeysStore } from "@/store/keys";
import { connectPlatform, disconnectPlatform, toggleTokenScope } from "@/lib/api";
import { isTauri, keychainSet, keychainDelete } from "@/lib/tauri";
import { toast } from "@/store/toast";
import { RateLimits } from "@/components/settings/rate-limits";
import { ThemePicker } from "@/components/settings/theme-picker";
import { ExportImport } from "@/components/vault/export-import";
import { LinkedAccounts } from "@/components/settings/linked-accounts";
import { SecurityActivity } from "@/components/settings/security-activity";
import { useFileList } from "@/hooks/useFileList";
import { PlatformIcon } from "@/components/icons/platform-icon";
import { TelegramConnect } from "@/components/settings/telegram-connect";
import { SettingGroup, ButtonRow, ValueRow, LinkRow } from "@/components/settings/settings-primitives";
import type { PlatformStatus } from "@/types";
import {
  CheckCircle2,
  Key,
  ExternalLink,
  Shield,
  ArrowRight,
  ArrowLeft,
  XCircle,
  Sun,
  Moon,
  Monitor,
  ChevronDown,
  Globe,
  User,
  ShieldAlert,
  Eye,
  Sparkles,
  Box,
  Database,
  Download,
} from "@/lib/icons";
import { cn } from "@/lib/utils";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { PLATFORMS, platformName, parseTelegramToken } from "@/lib/platforms";

/**
 * Desktop-only: mirror a freshly connected platform token into the OS keychain
 * so the Tauri core can route uploads byos-direct. Never runs outside Tauri —
 * raw platform tokens must never be persisted in the browser. Best-effort.
 */
async function storeDesktopPlatformCreds(platform: string, rawToken: string, username?: string): Promise<void> {
  if (!isTauri) return;
  try {
    const parsed = platform === "telegram" ? parseTelegramToken(rawToken) : null;
    const keychainToken = parsed?.token ?? rawToken;
    const keychainAccount = parsed?.account ?? username;
    await keychainSet(`platform.${platform}.token`, keychainToken);
    if (keychainAccount) await keychainSet(`platform.${platform}.account`, keychainAccount);
  } catch (err) {
    console.error(`Failed to store ${platform} credentials in the desktop keychain`, err);
  }
}

/** Desktop-only: forget a platform's keychain creds on disconnect. Best-effort. */
async function clearDesktopPlatformCreds(platform: string): Promise<void> {
  if (!isTauri) return;
  try {
    await keychainDelete(`platform.${platform}.token`);
    await keychainDelete(`platform.${platform}.account`);
  } catch (err) {
    console.error(`Failed to clear ${platform} credentials from the desktop keychain`, err);
  }
}

type SectionId = "appearance" | "account" | "platforms" | "storage" | "privacy" | "backup" | "security";

interface SectionDef {
  id: SectionId;
  label: string;
  desc: string;
  icon: typeof Shield;
  group: string;
  adminOnly?: boolean;
}

const SECTIONS: SectionDef[] = [
  { id: "appearance", label: "Appearance", desc: "Theme, colors & advanced mode", icon: Sparkles, group: "General" },
  { id: "account", label: "Account access", desc: "Sign-in providers & device key", icon: User, group: "Account" },
  { id: "platforms", label: "Platform connections", desc: "Connect your storage backends", icon: Box, group: "Account" },
  { id: "storage", label: "Storage & quotas", desc: "Repositories, usage & limits", icon: Database, group: "Storage" },
  { id: "privacy", label: "Privacy", desc: "Decoy vault & dead man's switch", icon: ShieldAlert, group: "Privacy & security" },
  { id: "backup", label: "Vault backup", desc: "Export or import your metadata", icon: Download, group: "Privacy & security" },
  { id: "security", label: "Security activity", desc: "Recent sign-ins & events", icon: Shield, group: "Privacy & security", adminOnly: true },
];

export function SettingsContent() {
  const [tokens, setTokens] = useState<Record<string, string>>({});
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

  // active === null → mobile shows the grouped index. Desktop always shows a
  // section (defaults to the first) in the right pane.
  const [active, setActive] = useState<SectionId | null>(null);

  useEffect(() => { setScopeOverrides({}); }, [statuses]);

  const effectiveStatuses = statuses.map((s) =>
    s.token_id && s.token_id in scopeOverrides ? { ...s, is_global: scopeOverrides[s.token_id] } : s
  );
  const visibleStatuses = isAdmin ? effectiveStatuses : effectiveStatuses.filter((s) => !s.is_global);
  const accountsFor = (platform: string) => visibleStatuses.filter((s) => s.platform === platform && s.connected);

  const handleConnect = async (platform: string, token: string): Promise<boolean> => {
    if (!token.trim()) return false;
    if (busyRef.current.has(`connect:${platform}`)) return false;
    busyRef.current.add(`connect:${platform}`);
    setConnecting(platform);
    try {
      const trimmed = token.trim();
      const res = await connectPlatform(platform, trimmed);
      await storeDesktopPlatformCreds(platform, trimmed, res.username);
      toast.success(`${platformName(platform)} connected!`);
      setTokens((prev) => ({ ...prev, [platform]: "" }));
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

  const executeDisconnect = async () => {
    if (!disconnectTarget) return;
    const { platform, username } = disconnectTarget;
    const key = `disconnect:${platform}:${username}`;
    if (busyRef.current.has(key)) return;
    busyRef.current.add(key);
    setDisconnecting(`${platform}:${username}`);
    try {
      await disconnectPlatform(platform, username);
      await clearDesktopPlatformCreds(platform);
      toast.success(`${platformName(platform)} @${username} disconnected`);
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

  const visibleSections = SECTIONS.filter((s) => !s.adminOnly || isAdmin);
  const groups = Array.from(new Set(visibleSections.map((s) => s.group)));

  const renderSection = (id: SectionId) => {
    switch (id) {
      case "appearance":
        return (
          <AppearanceContent theme={theme} setTheme={setTheme} advancedMode={advancedMode} setAdvancedMode={setAdvancedMode} />
        );
      case "account":
        return (
          <div className="space-y-3">
            <EncryptionKeyInfo />
            <LinkedAccounts />
          </div>
        );
      case "platforms":
        return (
          <div className="space-y-4">
            {PLATFORMS.map((p) => (
              <PlatformSection
                key={p.id}
                icon={<PlatformIcon platform={p.id} className="h-5 w-5" />}
                name={p.name}
                platform={p.id}
                tokenUrl={p.tokenUrl}
                tokenLabel={p.tokenLabel}
                placeholder={p.placeholder}
                token={tokens[p.id] ?? ""}
                onTokenChange={(v) => setTokens((prev) => ({ ...prev, [p.id]: v }))}
                onConnect={() => handleConnect(p.id, tokens[p.id] ?? "")}
                connecting={connecting === p.id}
                connectedAccounts={accountsFor(p.id)}
                onDisconnect={(username) => setDisconnectTarget({ platform: p.id, username })}
                disconnecting={disconnecting}
                onToggleScope={handleToggleScope}
                isAdmin={isAdmin}
                customConnect={
                  p.id === "telegram" ? (
                    <TelegramConnect
                      onConnect={(token) => handleConnect("telegram", token)}
                      connecting={connecting === "telegram"}
                      hasAccounts={accountsFor("telegram").length > 0}
                    />
                  ) : undefined
                }
              />
            ))}
          </div>
        );
      case "storage":
        return (
          <div className="space-y-8">
            <RateLimits statuses={statuses} repos={repos} />
            <StoragePool />
          </div>
        );
      case "privacy":
        return (
          <SettingGroup label="Advanced safeguards" footnote="For high-risk threat models. Both are optional.">
            <LinkRow href="/settings/deadman" icon={<ShieldAlert className="h-4 w-4" />} title="Dead man's switch" subtitle="Auto-notify a contact if you go silent" />
            <LinkRow href="/settings/decoy" icon={<Eye className="h-4 w-4" />} title="Decoy profile" subtitle="Plausible deniability with a decoy vault" />
          </SettingGroup>
        );
      case "backup":
        return <ExportImport files={files} />;
      case "security":
        return <SecurityActivity />;
    }
  };

  const activeDef = (id: SectionId) => visibleSections.find((s) => s.id === id)!;

  return (
    <div className="animate-fade-in">
      {/* ── MOBILE: grouped index → sub-view with back ─────────────────── */}
      <div className="md:hidden">
        {active === null ? (
          <div className="space-y-6">
            <div className="px-1">
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-accent)]">Configuration</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--color-text)]">Settings</h1>
            </div>
            {groups.map((g) => (
              <SettingGroup key={g} label={g}>
                {visibleSections.filter((s) => s.group === g).map((s) => (
                  <ButtonRow
                    key={s.id}
                    onClick={() => setActive(s.id)}
                    icon={<s.icon className="h-4 w-4" />}
                    title={s.label}
                    subtitle={s.desc}
                  />
                ))}
              </SettingGroup>
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            <button
              type="button"
              onClick={() => setActive(null)}
              className="inline-flex items-center gap-1.5 rounded-lg text-sm text-[var(--color-text-secondary)] outline-none transition-colors hover:text-[var(--color-text)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
            >
              <ArrowLeft className="h-4 w-4" /> Settings
            </button>
            <div className="px-1">
              <h1 className="text-xl font-bold tracking-tight text-[var(--color-text)]">{activeDef(active).label}</h1>
              <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">{activeDef(active).desc}</p>
            </div>
            {renderSection(active)}
          </div>
        )}
      </div>

      {/* ── DESKTOP: two-pane (nav rail + active section) ──────────────── */}
      <div className="hidden md:flex md:gap-8">
        <nav className="w-60 flex-shrink-0">
          <p className="px-3 text-xs font-medium uppercase tracking-wider text-[var(--color-accent)]">Configuration</p>
          <h1 className="mt-1 px-3 text-lg font-bold tracking-tight text-[var(--color-text)]">Settings</h1>
          <div className="mt-4 space-y-4">
            {groups.map((g) => (
              <div key={g} className="space-y-1">
                <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">{g}</p>
                {visibleSections.filter((s) => s.group === g).map((s) => {
                  const on = (active ?? "appearance") === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setActive(s.id)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40",
                        on
                          ? "bg-[var(--color-accent)]/10 font-medium text-[var(--color-accent)]"
                          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)]"
                      )}
                    >
                      <s.icon className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">{s.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </nav>
        <div className="min-w-0 flex-1">
          <div className="mb-5">
            <h2 className="text-lg font-bold tracking-tight text-[var(--color-text)]">{activeDef(active ?? "appearance").label}</h2>
            <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">{activeDef(active ?? "appearance").desc}</p>
          </div>
          {renderSection(active ?? "appearance")}
        </div>
      </div>

      <ConfirmDialog
        open={!!disconnectTarget}
        onOpenChange={(open) => { if (!open) setDisconnectTarget(null); }}
        destructive
        title="Disconnect platform?"
        description={
          disconnectTarget
            ? `Disconnect ${platformName(disconnectTarget.platform)} account @${disconnectTarget.username}? Files stored on this platform will remain but may become inaccessible.`
            : ""
        }
        confirmLabel="Disconnect"
        loading={!!disconnecting}
        onConfirm={executeDisconnect}
      />
    </div>
  );
}

function AppearanceContent({
  theme,
  setTheme,
  advancedMode,
  setAdvancedMode,
}: {
  theme: string;
  setTheme: (t: "light" | "dark" | "system") => void;
  advancedMode: boolean;
  setAdvancedMode: (v: boolean) => void;
}) {
  const themeOptions = [
    { value: "light" as const, icon: Sun, label: "Light" },
    { value: "dark" as const, icon: Moon, label: "Dark" },
    { value: "system" as const, icon: Monitor, label: "System" },
  ];
  return (
    <div className="space-y-6">
      <SettingGroup label="Theme">
        <ValueRow
          icon={<Sun className="h-4 w-4" />}
          title="Mode"
          subtitle="Light, dark, or match your system"
          trailing={
            <div className="relative">
              <label htmlFor="theme-select" className="sr-only">Theme</label>
              <select
                id="theme-select"
                value={theme}
                onChange={(e) => setTheme(e.target.value as "light" | "dark" | "system")}
                className="appearance-none rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1.5 pl-3 pr-8 text-sm font-medium text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]/40 focus:ring-2 focus:ring-[var(--color-accent)]/10"
              >
                {themeOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute inset-y-0 right-2 my-auto h-4 w-4 text-[var(--color-text-muted)]" />
            </div>
          }
        />
      </SettingGroup>

      {/* ThemePicker renders its own "Color theme" heading — don't double it. */}
      <ThemePicker />

      <SettingGroup label="Power user" footnote="Snapshots, integrity checks, expiring vaults, and device sync.">
        <ValueRow
          title="Advanced mode"
          subtitle="Show power-user tools across the app"
          trailing={
            <Switch
              checked={advancedMode}
              onCheckedChange={setAdvancedMode}
              aria-label="Advanced mode"
              className="data-[state=checked]:bg-[var(--color-accent)] data-[state=unchecked]:bg-[var(--color-surface-3)]"
            />
          }
        />
      </SettingGroup>
    </div>
  );
}

function PlatformSection({
  icon,
  name,
  platform,
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
  customConnect?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-1)]/40">
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3.5">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)]">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-[var(--color-text)]">{name}</h3>
        </div>
        {connectedAccounts.length > 0 && (
          <Badge variant="outline" className="flex-shrink-0 border-[var(--color-accent)]/25 bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
            {connectedAccounts.length} connected
          </Badge>
        )}
      </div>

      <div className="flex-1 space-y-4 p-4">
        {connectedAccounts.length > 0 && (
          <ul className="space-y-2">
            {connectedAccounts.map((acc) => {
              const isDisconnecting = disconnecting === `${platform}:${acc.username}`;
              return (
                <li key={`${acc.platform}:${acc.username}`} className="flex items-center gap-2 rounded-xl border border-[var(--color-accent)]/15 bg-[var(--color-accent)]/5 px-3 py-2">
                  <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-[var(--color-accent)]" />
                  <span className="min-w-0 flex-1 truncate text-sm text-[var(--color-text)]">@{acc.username}</span>
                  {isAdmin && acc.token_id && (
                    <button
                      type="button"
                      onClick={() => onToggleScope(acc.token_id!, !!acc.is_global)}
                      title={acc.is_global ? "Global — shared with all users. Click to make local." : "Local — only you. Click to share with all users."}
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
                    <span className="flex h-9 w-9 items-center justify-center text-[var(--color-text-muted)]"><LogoSpinner size={14} speed="fast" /></span>
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
                  <span className="flex items-center gap-2"><LogoSpinner size={14} speed="fast" /> Connecting...</span>
                ) : (
                  <span className="flex items-center gap-1.5">{connectedAccounts.length > 0 ? "Add account" : "Connect"}<ArrowRight className="h-3.5 w-3.5" /></span>
                )}
              </Button>
            </div>
            <a href={tokenUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded text-xs text-[var(--color-accent)] outline-none transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40">
              {tokenLabel}<ExternalLink className="h-3 w-3" />
            </a>
          </>
        )}
      </div>
    </div>
  );
}

function EncryptionKeyInfo() {
  const fingerprint = useKeysStore((s) => s.fingerprint);
  const ready = useKeysStore((s) => s.ready);
  if (!ready || !fingerprint) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-[var(--color-border)] px-3.5 py-3 text-sm text-[var(--color-text-muted)]">
        Unlock your vault to generate and view your key fingerprint.
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)]/50 px-3.5 py-3">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent)]/10 text-[var(--color-accent)]"><Key className="h-4 w-4" /></div>
      <div className="min-w-0">
        <p className="text-xs text-[var(--color-text-muted)]">Your key fingerprint</p>
        <p className="font-mono text-sm font-semibold tracking-wide text-[var(--color-text)]">{fingerprint}</p>
      </div>
    </div>
  );
}

