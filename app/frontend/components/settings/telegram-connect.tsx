"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { telegramProbe, type TelegramDetectedChat } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { toast } from "@/store/toast";
import { cn } from "@/lib/utils";
import {
  Key,
  ArrowRight,
  ArrowLeft,
  ExternalLink,
  CheckCircle2,
  ChevronDown,
  RefreshCw,
} from "@/lib/icons";

/**
 * Guided Telegram connect: paste the bot token once, then add the bot to a
 * channel/group via a deep link — we auto-detect the chat ID (the old painful
 * manual step) by polling getUpdates server-side. Manual BOT_TOKEN|CHAT_ID entry
 * stays as an advanced fallback for bots with a webhook or other edge cases.
 *
 * `onConnect` resolves true on a successful connection (so we can reset).
 */
interface TelegramConnectProps {
  onConnect: (token: string) => Promise<boolean>;
  connecting: boolean;
  hasAccounts: boolean;
}

type Step = "token" | "detect";

const POLL_MS = 2500;
const POLL_TIMEOUT_MS = 120_000;

const CHAT_TYPE_LABEL: Record<TelegramDetectedChat["type"], string> = {
  channel: "Channel",
  group: "Group",
  supergroup: "Group",
};

export function TelegramConnect({ onConnect, connecting, hasAccounts }: TelegramConnectProps) {
  const [step, setStep] = useState<Step>("token");
  const [botToken, setBotToken] = useState("");
  const [botUsername, setBotUsername] = useState("");
  const [validating, setValidating] = useState(false);
  const [chats, setChats] = useState<TelegramDetectedChat[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [detectHint, setDetectHint] = useState<string | null>(null);

  const [showManual, setShowManual] = useState(false);
  const [manualToken, setManualToken] = useState("");

  const inFlight = useRef(false);
  const pollActive = useRef(false);
  const pollNext = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollDeadline = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    pollActive.current = false;
    if (pollNext.current) clearTimeout(pollNext.current);
    if (pollDeadline.current) clearTimeout(pollDeadline.current);
    pollNext.current = null;
    pollDeadline.current = null;
    setPolling(false);
  }, []);

  // Tear down timers on unmount.
  useEffect(() => stopPolling, [stopPolling]);

  // ONE probe at a time. Telegram's getUpdates rejects concurrent calls for the
  // same bot with a 409 Conflict, so overlapping requests would all fail and
  // look like "couldn't detect". The in-flight guard serializes them.
  const probe = useCallback(
    async (silent: boolean): Promise<boolean> => {
      if (inFlight.current) return false;
      inFlight.current = true;
      try {
        const res = await telegramProbe(botToken);
        setBotUsername(res.bot_username);
        setDetectHint(res.detect_error ?? null);
        if (res.chats.length > 0) {
          setChats(res.chats);
          // Pre-select the most recently added chat (last in detection order).
          setSelectedId((cur) => cur ?? res.chats[res.chats.length - 1].id);
          stopPolling();
          return true;
        }
        return false;
      } catch (e) {
        if (!silent) toast.error("Invalid bot token. Double-check it and try again.");
        throw e;
      } finally {
        inFlight.current = false;
      }
    },
    [botToken, stopPolling]
  );

  // Sequential polling: schedule the NEXT probe only after the current one
  // resolves, so getUpdates calls never overlap regardless of how slow Telegram
  // is to respond.
  const startPolling = useCallback(() => {
    if (pollActive.current) return; // already polling
    pollActive.current = true;
    setPolling(true);
    pollDeadline.current = setTimeout(stopPolling, POLL_TIMEOUT_MS);
    const tick = async () => {
      if (!pollActive.current) return;
      let found = false;
      try {
        found = await probe(true);
      } catch {
        // transient — keep polling
      }
      if (found || !pollActive.current) return;
      pollNext.current = setTimeout(() => void tick(), POLL_MS);
    };
    void tick();
  }, [probe, stopPolling]);

  const handleValidate = async () => {
    if (!botToken.trim()) return;
    setValidating(true);
    try {
      const found = await probe(false);
      setStep("detect");
      if (!found) startPolling();
    } catch {
      // toast already shown
    } finally {
      setValidating(false);
    }
  };

  const openDeepLink = (kind: "channel" | "group") => {
    if (!botUsername) return;
    const param = kind === "channel" ? "startchannel" : "startgroup";
    // Rights the adapter needs: post chunks + delete them on purge. Channels gate
    // posting behind admin; groups only gate deletion.
    const admin = kind === "channel" ? "post_messages+delete_messages" : "delete_messages";
    window.open(`https://t.me/${botUsername}?${param}&admin=${admin}`, "_blank", "noopener,noreferrer");
    startPolling();
  };

  const reset = useCallback(() => {
    stopPolling();
    setStep("token");
    setBotToken("");
    setBotUsername("");
    setChats([]);
    setSelectedId(null);
    setDetectHint(null);
  }, [stopPolling]);

  const connectSelected = async () => {
    if (!selectedId) return;
    const ok = await onConnect(`${botToken}|${selectedId}`);
    if (ok) reset();
  };

  const connectManual = async () => {
    if (!manualToken.trim()) return;
    const ok = await onConnect(manualToken.trim());
    if (ok) setManualToken("");
  };

  return (
    <div className="space-y-4">
      {step === "token" && (
        <div className="space-y-3">
          <p className="text-xs text-[var(--color-text-secondary)]">
            Paste your bot token from{" "}
            <a
              href="https://t.me/BotFather"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-accent)] hover:underline"
            >
              @BotFather
            </a>
            . We&apos;ll help you add it to a channel and find the chat ID for you — no manual ID hunting.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <Input
                type="password"
                placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleValidate()}
                icon={<Key className="h-4 w-4" />}
                aria-label="Telegram bot token"
              />
            </div>
            <Button
              onClick={handleValidate}
              disabled={validating || !botToken.trim()}
              className="sm:self-start"
            >
              {validating ? (
                <span className="flex items-center gap-2">
                  <LogoSpinner size={14} speed="fast" />
                  Checking...
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  Continue
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              )}
            </Button>
          </div>
        </div>
      )}

      {step === "detect" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-[var(--color-text)]">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-[var(--color-accent)]" />
            <span>
              Bot{" "}
              <span className="font-medium">@{botUsername}</span> verified.
            </span>
            <button
              type="button"
              onClick={reset}
              className="ml-auto inline-flex items-center gap-1 rounded text-xs text-[var(--color-text-muted)] outline-none transition-colors hover:text-[var(--color-text)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
            >
              <ArrowLeft className="h-3 w-3" />
              Different bot
            </button>
          </div>

          {chats.length === 0 ? (
            <div className="space-y-3">
              <p className="text-xs text-[var(--color-text-secondary)]">
                Add the bot to where you want files stored. Pick a destination — Telegram opens, you choose
                the channel/group, and we&apos;ll detect it automatically.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="secondary" onClick={() => openDeepLink("channel")} className="flex-1">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Add to a channel
                </Button>
                <Button variant="secondary" onClick={() => openDeepLink("group")} className="flex-1">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Add to a group
                </Button>
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)]/50 px-3 py-2.5 text-xs text-[var(--color-text-secondary)]">
                {polling ? (
                  <>
                    <LogoSpinner size={14} speed="fast" />
                    <span>Waiting for you to add the bot…</span>
                  </>
                ) : (
                  <span>Added the bot already?</span>
                )}
                <button
                  type="button"
                  onClick={() => void probe(false).then((found) => !found && startPolling())}
                  className="ml-auto inline-flex items-center gap-1 rounded font-medium text-[var(--color-accent)] outline-none transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
                >
                  <RefreshCw className="h-3 w-3" />
                  Check now
                </button>
              </div>

              {detectHint && (
                <p className="text-xs text-amber-600 dark:text-amber-400">{detectHint}</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-[var(--color-text-secondary)]">
                Found {chats.length === 1 ? "this destination" : "these destinations"} — pick where to store files:
              </p>
              <ul className="space-y-2">
                {chats.map((chat) => {
                  const active = selectedId === chat.id;
                  return (
                    <li key={chat.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(chat.id)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40",
                          active
                            ? "border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10"
                            : "border-[var(--color-border)] hover:bg-[var(--color-surface-1)]"
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border",
                            active
                              ? "border-[var(--color-accent)] bg-[var(--color-accent)]"
                              : "border-[var(--color-border-hover)]"
                          )}
                        >
                          {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--color-text)]">
                          {chat.title || "Untitled"}
                        </span>
                        <span className="flex-shrink-0 text-xs text-[var(--color-text-muted)]">
                          {CHAT_TYPE_LABEL[chat.type]}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="flex items-center gap-2">
                <Button onClick={connectSelected} disabled={connecting || !selectedId}>
                  {connecting ? (
                    <span className="flex items-center gap-2">
                      <LogoSpinner size={14} speed="fast" />
                      Connecting...
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      {hasAccounts ? "Add this destination" : "Connect"}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  )}
                </Button>
                <button
                  type="button"
                  onClick={() => void probe(true)}
                  className="inline-flex items-center gap-1 rounded px-1 text-xs text-[var(--color-text-muted)] outline-none transition-colors hover:text-[var(--color-text)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
                >
                  <RefreshCw className="h-3 w-3" />
                  Rescan
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Advanced fallback — manual BOT_TOKEN|CHAT_ID entry. */}
      <div className="border-t border-[var(--color-border)] pt-3">
        <button
          type="button"
          onClick={() => setShowManual((v) => !v)}
          aria-expanded={showManual}
          className="inline-flex items-center gap-1.5 rounded text-xs font-medium text-[var(--color-text-muted)] outline-none transition-colors hover:text-[var(--color-text)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showManual && "rotate-180")} />
          Advanced: enter BOT_TOKEN|CHAT_ID manually
        </button>
        {showManual && (
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <Input
                type="password"
                placeholder="123456:ABC-DEF|@channel_name"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                icon={<Key className="h-4 w-4" />}
                aria-label="Telegram bot token and chat ID"
              />
            </div>
            <Button
              variant="secondary"
              onClick={connectManual}
              disabled={connecting || !manualToken.trim()}
              className="sm:self-start"
            >
              Connect
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
