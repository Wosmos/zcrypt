"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePlatformHealth } from "@/hooks/usePlatformHealth";
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
} from "lucide-react";

export default function SettingsPage() {
  const [githubToken, setGithubToken] = useState("");
  const [gitlabToken, setGitlabToken] = useState("");
  const [huggingfaceToken, setHuggingfaceToken] = useState("");
  const [connecting, setConnecting] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const busyRef = useRef<Set<string>>(new Set());
  const { statuses, refresh } = usePlatformHealth();

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
        <h1 className="text-2xl sm:text-3xl font-bold text-zinc-100 tracking-tight">
          Settings
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Connect platforms and manage your vault
        </p>
      </div>

      {/* Platform connections */}
      <div className="space-y-4">
        <h2 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
          Platform Connections
        </h2>

        {/* GitHub */}
        <PlatformSection
          icon={<Github className="h-5 w-5 text-zinc-300" />}
          name="GitHub"
          platform="github"
          description="Personal Access Token with repo scope — upto 1gb per repo"
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
          icon={<GitlabIcon className="h-5 w-5 text-orange-400" />}
          name="GitLab"
          platform="gitlab"
          description="Personal Access Token with api scope — upto 10gb per repo"
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
          icon={<HuggingFaceIcon className="h-5 w-5 text-yellow-400" />}
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
      <section className="rounded-2xl border border-zinc-800/50 bg-gradient-to-b from-zinc-900/80 to-zinc-900/40 overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800/30">
          <h2 className="text-sm font-semibold text-zinc-100">How it works</h2>
        </div>
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <PipelineStep
              icon={<Zap className="h-4 w-4" />}
              step="1"
              title="Compress"
              desc="Zstd best-level compression shrinks files before encryption"
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
              desc="Split into 90MB chunks, disguised as build artifacts"
            />
          </div>
          <div className="flex items-start gap-3 pt-3 border-t border-zinc-800/25">
            <Shield className="h-4 w-4 text-indigo-400/60 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-zinc-500 leading-relaxed">
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
    <section className="rounded-2xl border border-zinc-800/50 bg-gradient-to-b from-zinc-900/80 to-zinc-900/40 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-800/30">
        <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-zinc-800/60">
          {icon}
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-zinc-100">{name}</h2>
          <p className="text-[11px] text-zinc-500">{description}</p>
        </div>
        {connectedAccounts.length > 0 && (
          <span className="text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-800/30 px-2.5 py-1 rounded-full">
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
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/5 border border-emerald-800/20"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                <span className="text-sm text-zinc-300 flex-1">
                  @{acc.username}
                </span>
                <button
                  onClick={() => acc.username && onDisconnect(acc.username)}
                  disabled={
                    disconnecting === `${platform}:${acc.username}`
                  }
                  className="text-xs text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-50"
                >
                  {disconnecting === `${platform}:${acc.username}` ? (
                    <span className="h-3 w-3 border border-zinc-600 border-t-zinc-400 rounded-full animate-spin inline-block" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Always show token input to add more accounts */}
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
          className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
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
      <div className="relative flex items-center justify-center h-9 w-9 rounded-xl bg-zinc-800/50 text-zinc-500 flex-shrink-0">
        {icon}
        <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-zinc-800 border border-zinc-700/60 text-[9px] font-bold text-zinc-400 flex items-center justify-center">
          {step}
        </span>
      </div>
      <div>
        <p className="text-xs font-semibold text-zinc-200">{title}</p>
        <p className="text-[11px] text-zinc-600 leading-relaxed mt-0.5">
          {desc}
        </p>
      </div>
    </div>
  );
}
