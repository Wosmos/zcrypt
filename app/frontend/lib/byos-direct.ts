import type { PlatformStatus, RepoInfo } from "@/types";
import { Platform, parseTelegramToken } from "@/lib/platforms";
import { deactivateRepo, getPlatformCredentials, listRepos, registerRepo } from "@/lib/api";
import { probeTelegram } from "@/lib/telegram-reach";
import { ensurePlatformStatus } from "@/store/platform";
import {
  cachedPlatformCredentials,
  credentialsGeneration,
  rememberPlatformCredentials,
  type PlatformCredentials,
} from "@/lib/platform-credentials";
import {
  isTelegramTransportError,
  randomHex,
  uploadTelegramChunk,
  type TelegramTarget,
} from "@/lib/telegram-direct";

/** Where a direct upload goes: the user's own Telegram chat, posted to with their own bot. */
export interface DirectTarget {
  platform: typeof Platform.Telegram;
  /** The account name the server records the chunks under (the bot's username). */
  account: string;
  telegram: TelegramTarget;
}

/** Rotation threshold for a client-created Telegram repo, the same 50 GB the desktop pool uses. */
export const TELEGRAM_REPO_THRESHOLD = 50 * 1024 * 1024 * 1024;

const ADJECTIVES = [
  "utils",
  "config",
  "build",
  "core",
  "base",
  "common",
  "shared",
  "internal",
  "simple",
  "fast",
  "tiny",
  "mini",
  "micro",
  "basic",
  "clean",
  "safe",
  "smart",
  "auto",
  "quick",
  "lean",
];
const NOUNS = [
  "tools",
  "helpers",
  "cache",
  "loader",
  "parser",
  "runner",
  "worker",
  "bridge",
  "engine",
  "manager",
  "handler",
  "service",
  "module",
  "plugin",
  "adapter",
  "wrapper",
  "logger",
  "client",
  "proxy",
  "store",
];

let webDirectOff = false;
const repoInFlight = new Map<string, Promise<RepoInfo>>();

/** Stop choosing direct uploads for the rest of this page session: this browser cannot reach Telegram. */
export function disableWebDirect(): void {
  webDirectOff = true;
}

/** Whether direct uploads were switched off for this page session. */
export function isWebDirectDisabled(): boolean {
  return webDirectOff;
}

async function loadCredentials(platform: string): Promise<PlatformCredentials | null> {
  const hit = cachedPlatformCredentials(platform);
  if (hit) return hit;
  const stamp = credentialsGeneration();
  try {
    const creds = await getPlatformCredentials(platform);
    rememberPlatformCredentials(creds, stamp);
    return creds;
  } catch {
    return null;
  }
}

function toTarget(creds: PlatformCredentials | null): DirectTarget | null {
  const parsed = creds ? parseTelegramToken(creds.token) : null;
  if (!creds || !parsed) return null;
  return {
    platform: Platform.Telegram,
    account: creds.account,
    telegram: { botToken: parsed.token, chatId: parsed.account },
  };
}

function ownsTelegram(statuses: PlatformStatus[]): boolean {
  return statuses.some((s) => s.platform === Platform.Telegram && s.connected && !s.is_global);
}

/**
 * Decide, per new file, whether its bytes go straight from this browser to the
 * user's own Telegram instead of through the server. All of these must hold:
 * the chosen platform is Telegram, or Auto (which lands on Telegram first); the
 * user connected their own Telegram, not a shared one; this browser can reach
 * Telegram; the token can be fetched; and no earlier file in this page session
 * found Telegram unreachable. Anything else returns null: upload via the relay.
 */
export async function resolveWebDirect(platform?: string): Promise<DirectTarget | null> {
  if (webDirectOff) return null;
  if (platform && platform !== Platform.Telegram) return null;
  if (!ownsTelegram(await ensurePlatformStatus())) return null;
  if ((await probeTelegram()) !== "ok") return null;
  return toTarget(await loadCredentials(Platform.Telegram));
}

/**
 * The target for a resumed direct session. A resume keeps its mode, so this
 * skips the reachability and page-session checks and only needs the user's own
 * token; null means the session cannot be continued in this browser.
 */
export async function directTargetForResume(platform: string): Promise<DirectTarget | null> {
  if (platform !== Platform.Telegram) return null;
  return toTarget(await loadCredentials(platform));
}

function pick(list: string[]): string {
  return list[crypto.getRandomValues(new Uint32Array(1))[0] % list.length];
}

async function createOrReuseRepo(target: DirectTarget): Promise<RepoInfo> {
  const repos = (await listRepos()).filter(
    (r) => r.platform === target.platform && r.account === target.account && r.active,
  );
  const active = repos[0];
  if (active) {
    if (active.used_bytes < TELEGRAM_REPO_THRESHOLD) return active;
    await deactivateRepo(active.id);
  }
  const name = `${pick(ADJECTIVES)}-${pick(NOUNS)}-v${repos.length + 1}`;
  const repo: RepoInfo = {
    id: `${target.platform}_${target.account}_${name}_${randomHex(6)}`,
    platform: target.platform,
    account: target.account,
    name,
    url: `tg:${target.telegram.chatId}/${name}`,
    used_bytes: 0,
    max_bytes: TELEGRAM_REPO_THRESHOLD,
    active: true,
  };
  await registerRepo(repo);
  return repo;
}

/**
 * The one repo a direct file's chunks are recorded against, resolved once per
 * file before any chunk is pushed, exactly as the desktop pool does: reuse the
 * active repo while it has room, otherwise retire it and register a new one.
 * Files resolving at the same moment share one lookup, so a batch never
 * registers a repo per file.
 */
export function resolveDirectRepo(target: DirectTarget): Promise<RepoInfo> {
  const key = `${target.platform}:${target.account}`;
  const pending = repoInFlight.get(key);
  if (pending) return pending;
  const p = createOrReuseRepo(target).finally(() => repoInFlight.delete(key));
  repoInFlight.set(key, p);
  return p;
}

/** Options for pushing one chunk straight to the user's storage. */
export interface DirectPushOptions {
  /** This is the file's first chunk: a transport failure means the browser cannot reach Telegram at all. */
  probe?: boolean;
  onProgress?: (sent: number) => void;
  signal?: AbortSignal;
}

/**
 * Push one encrypted chunk to the user's own Telegram and return its locator.
 * Like the desktop, the whole push is tried twice (500 ms apart) on top of the
 * per-document retries. A first chunk fails fast on a transport error instead,
 * so the caller can fall back to the relay without a long wait.
 */
export async function pushDirectChunk(
  target: DirectTarget,
  data: Uint8Array,
  opts: DirectPushOptions = {},
): Promise<string> {
  let lastErr: unknown;
  for (let n = 0; n < 2; n++) {
    if (n > 0) await new Promise((r) => setTimeout(r, 500));
    try {
      return await uploadTelegramChunk(target.telegram, data, {
        onProgress: opts.onProgress,
        signal: opts.signal,
        failFastOnTransport: opts.probe,
      });
    } catch (err) {
      if (isDirectUnreachable(err) && opts.probe) throw err;
      if (err instanceof Error && err.message === "Upload paused") throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}

/** Whether a direct push failed because Telegram never answered this browser (network or CORS). */
export function isDirectUnreachable(err: unknown): boolean {
  return isTelegramTransportError(err);
}
