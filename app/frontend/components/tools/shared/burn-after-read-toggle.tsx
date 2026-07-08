"use client";

import { Switch } from "@/components/ui/switch";

/**
 * The "Burn after read" toggle row shared by pad-tool and send-tool. Only the
 * description copy differs between the two composers.
 */
export function BurnAfterReadToggle({
  checked,
  onCheckedChange,
  description,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  description: string;
}) {
  return (
    <label className="flex items-center gap-3 p-3 rounded-xl border border-[var(--color-border)] hover:border-[var(--color-border-hover)] cursor-pointer transition-colors">
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
      <div>
        <p className="text-sm font-medium">Burn after read</p>
        <p className="text-xs text-[var(--color-text-muted)]">{description}</p>
      </div>
    </label>
  );
}
