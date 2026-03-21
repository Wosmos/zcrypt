"use client";

import Link from "next/link";
import { Send, ArrowRight } from "@/lib/icons";

export function SendCard() {
  return (
    <Link
      href="/send"
      className="flex flex-col items-start gap-3 p-5 card hover:border-[var(--color-accent)]/30 transition-colors group"
    >
      <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
        <Send className="h-5 w-5" />
      </div>
      <div>
        <h3 className="text-sm font-semibold group-hover:text-[var(--color-accent)] transition-colors">
          Quick Send
        </h3>
        <p className="text-xs text-[var(--color-text-muted)] mt-1 leading-relaxed">
          Send encrypted files to anyone — no account needed on their end. Files are encrypted in your browser and shared via a one-time link.
        </p>
      </div>
      <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-accent)] mt-auto">
        Open Quick Send <ArrowRight className="h-3 w-3" />
      </span>
    </Link>
  );
}
