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
    tagline: "Up to 1 GB per repo",
    description: "Personal access token with repo scope — up to 1 GB per repo",
    capacity: "1 GB / repo",
    // zcrypt commits chunks via the Contents API (plain git), not LFS — the
    // limit that applies is GitHub's 100 MB hard per-file push limit.
    fileLimit: "100 MB / file",
    rateInfo: "5,000 req/hr (authenticated)",
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
    tagline: "Up to 10 GB per repo",
    description: "Personal access token with api scope — up to 10 GB per repo",
    capacity: "10 GB / repo",
    // Plain git commits → GitLab Free's 100 MiB per-file push limit applies.
    fileLimit: "100 MB / file",
    rateInfo: "7,200 req/hr (authenticated)",
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
    tagline: "Up to 300 GB per repo",
    description: "Access token with write permission — up to 300 GB per repo",
    capacity: "300 GB / repo",
    // HuggingFace genuinely uploads via LFS.
    fileLimit: "50 GB / file (LFS)",
    rateInfo: "No strict rate limits",
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
