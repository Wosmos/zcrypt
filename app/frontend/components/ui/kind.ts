import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "@/lib/icons";
import type { Severity } from "@/lib/utils";

/** The colour token and default icon for each message kind, shared by toasts, banners and dialogs. */
export const KIND: Record<Severity, { color: string; Icon: typeof CheckCircle2 }> = {
  success: { color: "var(--toast-success)", Icon: CheckCircle2 },
  error: { color: "var(--toast-error)", Icon: AlertCircle },
  info: { color: "var(--color-accent)", Icon: Info },
  warning: { color: "var(--toast-warning)", Icon: AlertTriangle },
};

/** A soft wash of a kind colour, for icon tiles and banner backgrounds. */
export function tint(color: string, percent: number, base = "transparent"): string {
  return `color-mix(in srgb, ${color} ${percent}%, ${base})`;
}
