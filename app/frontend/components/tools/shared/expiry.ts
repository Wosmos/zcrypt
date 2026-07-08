/**
 * Shared expiry choices for the anonymous tool composers (pad + send). Identical
 * `{ label, hours }` options duplicated in pad-tool and send-tool.
 *
 * NOTE: distinct from the expiring-tab `EXPIRY_CHOICES`, which uses a different
 * `{ value, label }` shape and a wider set of durations — do not merge them.
 */
export interface ExpiryOption {
  label: string;
  hours: number;
}

export const EXPIRY_OPTIONS: ExpiryOption[] = [
  { label: "1 hour", hours: 1 },
  { label: "24 hours", hours: 24 },
  { label: "7 days", hours: 168 },
];
