/**
 * Single source of truth for storage-platform metadata — display names, short
 * codes, brand colors, capacities, and connection details (token URLs, scopes,
 * placeholders). Previously this data was redeclared across onboarding,
 * settings, rate-limits, admin token management, and several analytics/marketing
 * panels — each copy drifting on capacity numbers and wording. Everything now
 * derives from the one `PLATFORMS` array below.
 *
 * NOTE: marketing display data (generic geometric icons + precise platform
 * thresholds, e.g. "850 MB / repo") lives separately in
 * components/marketing/landing/storage-platforms.ts — it deliberately uses a
 * different visual language and precise threshold numbers, and is derived from
 * the canonical ids/names here.
 */

/** The storage backends zcrypt can distribute encrypted chunks across. */
export type PlatformId = "github" | "gitlab" | "huggingface" | "telegram";

export interface PlatformMeta {
  id: PlatformId;
  /** Full display name, e.g. "Hugging Face". */
  name: string;
  /** Two-letter short code for compact chips/badges. */
  short: string;
  /** Brand hex color for charts / accents. */
  color: string;
  /** Tailwind color class for the brand icon (empty = inherit text color). */
  iconClass: string;
  /** Token scope/label shown during connect, e.g. "repo", "api", "write". */
  scope: string;
  /** Short capacity blurb for platform pickers, e.g. "Up to 1 GB per repo". */
  tagline: string;
  /** Long connect-form blurb, e.g. "Personal access token with repo scope — …". */
  description: string;
  /** Per-repo capacity for quota tables, e.g. "1 GB / repo" or "Unlimited". */
  capacity: string;
  /** Per-file push/upload ceiling, e.g. "100 MB / file". */
  fileLimit: string;
  /** API rate-limit note. */
  rateInfo: string;
  /** Token input placeholder. */
  placeholder: string;
  /** Where the user generates the token. */
  tokenUrl: string;
  /** Label for the token-generation link. */
  tokenLabel: string;
}

export const PLATFORMS: PlatformMeta[] = [
  {
    id: "github",
    name: "GitHub",
    short: "GH",
    color: "#6366f1",
    iconClass: "",
    scope: "repo",
    tagline: "Large repos · 100 MiB per file",
    description: "Personal access token with repo scope",
    // Values below are GitHub's REAL documented limits, not zcrypt's internal
    // rotation threshold (850 MB, in backend config) — that safety margin is
    // surfaced separately in the Storage pool panel.
    // GitHub recommends repos stay ~10 GB on disk but enforces no hard repo cap.
    capacity: "10 GB / repo (recommended; no hard cap)",
    // zcrypt commits chunks via the Contents API (plain git), not LFS. Plain-git
    // push warns at 50 MiB and hard-blocks at 100 MiB per file.
    fileLimit: "100 MiB / file (50 MiB warning)",
    // 5k/hr is the primary REST limit; bulk commits are actually gated by the
    // secondary content-creation limit (~500 writes/hr, 6 pushes/min per repo).
    rateInfo: "5k req / hour (authenticated; ~500 writes/hr)",
    placeholder: "ghp_xxxxxxxxxxxx",
    tokenUrl: "https://github.com/settings/tokens/new?scopes=repo&description=zcrypt",
    tokenLabel: "Generate token on GitHub",
  },
  {
    id: "gitlab",
    name: "GitLab",
    short: "GL",
    color: "#f97316",
    iconClass: "text-orange-500 dark:text-orange-400",
    scope: "api",
    tagline: "10 GiB per project",
    description: "Personal access token with api scope",
    // GitLab.com Free = 10 GiB per project (repo + LFS combined); the project
    // goes read-only past that. zcrypt rotates earlier (9 GB internal threshold).
    capacity: "10 GiB / project (then read-only)",
    // GitLab.com has NO GitHub-style per-file git cap. The real ceiling is the
    // 5 GiB max push size (Cloudflare). The 100 MiB figure is the UI attachment
    // upload limit, not a git push limit.
    fileLimit: "5 GiB / push (no per-file cap)",
    // GitLab.com authenticated API limit is 2k req/min per user. (7,200/hr was
    // the self-managed default, which GitLab.com overrides — ~16x too low.)
    rateInfo: "2k req / min (authenticated)",
    placeholder: "glpat-xxxxxxxxxxxx",
    tokenUrl: "https://gitlab.com/-/user_settings/personal_access_tokens?name=zcrypt&scopes=api",
    tokenLabel: "Generate token on GitLab",
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    short: "HF",
    color: "#eab308",
    iconClass: "text-yellow-500 dark:text-yellow-400",
    scope: "write",
    tagline: "100 GB private per account",
    description: "Access token with write permission",
    // HF storage is per-ACCOUNT, not per-repo: Free = 100 GB private. Rotating to
    // a new repo adds NO capacity (everything shares the one account quota). The
    // 90 GB in backend config is zcrypt's rotation threshold, not HF's limit.
    capacity: "100 GB / account (shared, not per repo)",
    // HuggingFace genuinely uploads via LFS. Hard per-file limit is 500 GB
    // (200 GB recommended); ≤10k files per folder.
    fileLimit: "500 GB / file (LFS; 200 GB rec.)",
    // HF enforces ~128 commits/hour — hit empirically during a bulk delete (each
    // upload/delete is one commit), even though HF deliberately does NOT publish
    // this number. This is the limit that actually gates zcrypt's bulk ops; the
    // documented per-5-min request buckets (1k API req/5 min free) rarely bind.
    rateInfo: "~128 commits / hour (also 1k API req / 5 min)",
    placeholder: "hf_xxxxxxxxxxxx",
    tokenUrl: "https://huggingface.co/settings/tokens/new?tokenType=write",
    tokenLabel: "Generate token on Hugging Face",
  },
  {
    id: "telegram",
    name: "Telegram",
    short: "TG",
    color: "#0ea5e9",
    iconClass: "text-sky-500 dark:text-sky-400",
    scope: "bot token + channel",
    tagline: "Unlimited storage via channels",
    description: "Bot token + channel — guided setup, unlimited storage",
    // Telegram channels have no storage cap — zcrypt's per-channel rotation
    // threshold is a virtual housekeeping value, not a platform limit.
    capacity: "Unlimited",
    fileLimit: "Unlimited (chunked)",
    rateInfo: "~20 msgs/min per chat",
    placeholder: "123456:ABC-DEF|@channel_name",
    tokenUrl: "https://t.me/BotFather",
    tokenLabel: "Create bot via @BotFather",
  },
];

/** Lookup by id, e.g. `PLATFORM_BY_ID.github.tokenUrl`. */
export const PLATFORM_BY_ID = Object.fromEntries(
  PLATFORMS.map((p) => [p.id, p])
) as Record<PlatformId, PlatformMeta>;

/** Full display names, e.g. "Hugging Face". */
export const PLATFORM_NAMES: Record<string, string> = Object.fromEntries(
  PLATFORMS.map((p) => [p.id, p.name])
);

/** Two-letter short codes for compact chips/badges. */
export const PLATFORM_SHORT: Record<string, string> = Object.fromEntries(
  PLATFORMS.map((p) => [p.id, p.short])
);

/** Brand hex colors for charts / accents. */
export const PLATFORM_COLORS: Record<string, string> = Object.fromEntries(
  PLATFORMS.map((p) => [p.id, p.color])
);

/** Display name for a platform id, falling back to the raw id when unknown. */
export function platformName(id: string): string {
  return PLATFORM_NAMES[id] ?? id;
}

/**
 * Parse a Telegram `"BOT_TOKEN|CHAT_ID"` token into its parts — mirrors the
 * backend's split in `NewTelegramAdapter` (adapters/telegram.go: SplitN at the
 * FIRST `|` only). Needed because the desktop keychain stores Telegram creds
 * as two separate fields (`platform.telegram.token` / `.account`, read by
 * `keychain_creds()` in app/desktop/src-tauri/src/lib.rs into
 * `PlatformCreds { token, account }`), unlike the single combined string the
 * `/api/platforms/connect` request body accepts. Returns null when the token
 * isn't in the expected two-part format.
 */
export function parseTelegramToken(
  raw: string
): { token: string; account: string } | null {
  const sep = raw.indexOf("|");
  if (sep === -1) return null;
  const token = raw.slice(0, sep).trim();
  const account = raw.slice(sep + 1).trim();
  if (!token || !account) return null;
  return { token, account };
}
