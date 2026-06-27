"use client";

import { useState } from "react";
import { Copy, Check } from "@/lib/icons";

type InstallMethod = { label: string; command: string; note: string };

/**
 * Dark terminal panel listing install commands, each with a copy button.
 * Matches the install block on /tui but makes every command copyable.
 */
export function InstallCommands({ methods }: { methods: readonly InstallMethod[] }) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (label: string, command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(label);
      window.setTimeout(() => setCopied((c) => (c === label ? null : c)), 1600);
    } catch {
      // Clipboard unavailable (insecure context) — silently ignore.
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[#09090b] shadow-2xl shadow-black/30">
      <div className="flex items-center px-4 py-3 border-b border-white/5 bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <div className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <div className="h-3 w-3 rounded-full bg-[#28c840]" />
          </div>
          <span className="font-mono text-xs text-white/30">install &mdash; zcrypt</span>
        </div>
      </div>
      <div className="divide-y divide-white/5 font-mono text-sm">
        {methods.map((m) => {
          const isCopied = copied === m.label;
          return (
            <div
              key={m.label}
              className="group flex items-start gap-3 px-5 py-3 transition-colors hover:bg-white/[0.02]"
            >
              <span className="select-none pt-px text-cyan-500/60">$</span>
              <code className="min-w-0 flex-1 break-all text-cyan-400">{m.command}</code>
              <span className="hidden flex-shrink-0 items-center gap-1.5 pt-1 text-[10px] sm:flex">
                <span className="font-sans font-medium text-white/40">{m.label}</span>
                <span className="font-sans text-white/20">{m.note}</span>
              </span>
              <button
                type="button"
                onClick={() => copy(m.label, m.command)}
                aria-label={isCopied ? "Copied" : `Copy ${m.label} command`}
                className="flex-shrink-0 rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/5 hover:text-white/80"
              >
                {isCopied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
