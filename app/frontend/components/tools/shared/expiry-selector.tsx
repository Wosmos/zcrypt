"use client";

import { Clock } from "@/lib/icons";
import { EXPIRY_OPTIONS } from "./expiry";

/**
 * The "Expires after" option group shared by pad-tool and send-tool.
 */
export function ExpirySelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (hours: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-secondary)]">
        <Clock className="h-3.5 w-3.5" /> Expires after
      </label>
      <div className="flex gap-2">
        {EXPIRY_OPTIONS.map((opt) => (
          <button key={opt.hours} onClick={() => onChange(opt.hours)}
            className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border transition-all ${
              value === opt.hours
                ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                : "border-[var(--color-border)] hover:border-[var(--color-border-hover)] text-[var(--color-text-muted)]"
            }`}>
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
