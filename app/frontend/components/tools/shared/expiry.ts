/**
 * Shared expiry choices for the anonymous tool composers (pad + send). Identical
 * `{ label, hours }` options duplicated in pad-tool and send-tool.
 *
 * NOTE: distinct from the expiring-tab `EXPIRY_CHOICES`, which uses a different
 * `{ value, label }` shape and a wider set of durations: do not merge them.
 */
export interface ExpiryOption {
  key: string;
  hours: number;
}

export const EXPIRY_OPTIONS: ExpiryOption[] = [
  { key: "h1", hours: 1 },
  { key: "h24", hours: 24 },
  { key: "d7", hours: 168 },
];
