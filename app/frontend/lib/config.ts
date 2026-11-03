/**
 * Deployment settings read from the environment, in one place. Next inlines
 * NEXT_PUBLIC_* at build time, so these must stay literal property reads.
 */

/** Backend origin without a trailing slash. Empty means same-origin (the /api proxy). */
export const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");

/** WebSocket origin matching API_BASE. */
export const API_WS_BASE = API_BASE.replace(/^http/, "ws");

/** Backend the desktop shell talks to when no API URL was baked into the build. */
export const DEV_API_URL = "http://localhost:8080";

const DEFAULT_GITHUB_REPO = "https://github.com/Wosmos/zcrypt";

function normalizeRepo(raw: string | undefined): string {
  const value = (raw || "").trim().replace(/\/+$/, "");
  if (!value) return DEFAULT_GITHUB_REPO;
  return /^https?:\/\//.test(value) ? value : `https://github.com/${value}`;
}

/** Public GitHub repository URL (no trailing slash). Overridable with NEXT_PUBLIC_GITHUB_REPO. */
export const GITHUB_REPO = normalizeRepo(process.env.NEXT_PUBLIC_GITHUB_REPO);

const GITHUB_PATH = GITHUB_REPO.replace(/^https?:\/\/[^/]+\//, "");

/** GitHub account or organisation that owns GITHUB_REPO. */
export const GITHUB_OWNER = GITHUB_PATH.split("/")[0] ?? "";

/** GitHub Sponsors page for the repository owner. */
export const SPONSOR_URL = `https://github.com/sponsors/${GITHUB_OWNER}`;

/** GitHub REST endpoint for the newest published release of GITHUB_REPO. */
export const LATEST_RELEASE_API = `https://api.github.com/repos/${GITHUB_PATH}/releases/latest`;

/** Telegram Bot API origin, probed for reachability and used for direct bot uploads. */
export const TELEGRAM_API_ORIGIN = "https://api.telegram.org";

/** Where users create a Telegram bot token. */
export const BOTFATHER_URL = "https://t.me/BotFather";
