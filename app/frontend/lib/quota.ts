/**
 * Pure admin storage-quota logic, extracted from the two admin quota editors
 * (user table + user detail). The component-local busy-state / refresh wiring
 * stays in the components; this module owns only the value semantics:
 *   - stored quota `null`  → follow the plan default
 *   - stored quota `0`     → unlimited
 *   - stored quota `> 0`   → a custom byte override (edited in GB)
 */
import { formatBytes, gbToBytes } from "@/lib/utils";

export type QuotaMode = "default" | "unlimited" | "custom";

/** Which editor mode a stored quota value corresponds to. */
export function quotaModeFor(bytes: number | null): QuotaMode {
  if (bytes === null) return "default";
  if (bytes === 0) return "unlimited";
  return "custom";
}

/**
 * Turn an editor (mode, GB-input) into the byte value to persist.
 *   - "default"   → null (defer to the plan)
 *   - "unlimited" → 0
 *   - "custom"    → Math.round(GB → bytes); rejects non-numeric / non-positive
 *
 * NOTE: `bytes` is `number | null` (not just `number`) so the "default" mode can
 * round-trip a null quota to the API, matching the original saveQuota logic.
 */
export function parseQuotaInput(
  mode: QuotaMode,
  input: string
): { ok: true; bytes: number | null } | { ok: false; error: string } {
  if (mode === "unlimited") return { ok: true, bytes: 0 };
  if (mode === "default") return { ok: true, bytes: null };
  const gb = parseFloat(input);
  if (isNaN(gb) || gb <= 0) return { ok: false, error: "Enter a valid quota in GB" };
  return { ok: true, bytes: Math.round(gbToBytes(gb)) };
}

/**
 * Human-readable quota display.
 *   - null  → the plan's own display string if given, else the configured
 *             default (formatted) or "Unlimited" when there is no default.
 *   - 0     → "Unlimited"
 *   - > 0   → formatBytes(bytes)
 */
export function formatQuotaDisplay(
  bytes: number | null,
  opts?: { planDisplay?: string; defaultBytes?: number }
): string {
  if (bytes === null) {
    if (opts?.planDisplay) return opts.planDisplay;
    const def = opts?.defaultBytes ?? 0;
    return def > 0 ? formatBytes(def) : "Unlimited";
  }
  if (bytes === 0) return "Unlimited";
  return formatBytes(bytes);
}
