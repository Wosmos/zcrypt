/**
 * Single source of truth for storage-platform display metadata (names, short
 * codes, brand colors). Previously duplicated across settings, admin token
 * management, and several analytics panels — each with slightly different
 * coverage.
 *
 * NOTE on adoption risk: token-management previously omitted `telegram` from its
 * name/short maps. Adopting the full 4-entry maps here surfaces Telegram in that
 * UI — verify that's intended before migrating that call site.
 */

/** Full display names, e.g. "Hugging Face". */
export const PLATFORM_NAMES: Record<string, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  huggingface: "Hugging Face",
  telegram: "Telegram",
};

/** Two-letter short codes for compact chips/badges. */
export const PLATFORM_SHORT: Record<string, string> = {
  github: "GH",
  gitlab: "GL",
  huggingface: "HF",
  telegram: "TG",
};

/** Brand hex colors for charts / accents. */
export const PLATFORM_COLORS: Record<string, string> = {
  github: "#6366f1",
  gitlab: "#f97316",
  huggingface: "#eab308",
  telegram: "#0ea5e9",
};

/** Display name for a platform id, falling back to the raw id when unknown. */
export function platformName(id: string): string {
  return PLATFORM_NAMES[id] ?? id;
}
