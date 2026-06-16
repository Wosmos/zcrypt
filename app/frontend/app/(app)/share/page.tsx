import { Send, Share2 } from "@/lib/icons";
import { SendCard } from "@/components/share/send-card";
import { PadCard } from "@/components/share/pad-card";
import { SharedVaultsContent } from "@/components/share/shared-vaults-content";

export default function SharePage() {
  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-[var(--color-surface-1)] ring-1 ring-[var(--color-border)]">
          <Share2 className="h-5 w-5 text-[var(--color-text-muted)]" />
        </div>
        <div>
          <p className="text-[10px] font-semibold text-[var(--color-accent)] uppercase tracking-widest">Sharing</p>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight">Share</h1>
        </div>
      </div>

      {/* Anonymous sharing hero cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SendCard />
        <PadCard />
      </div>

      {/* Shared Vaults (inline) */}
      <SharedVaultsContent />
    </div>
  );
}
