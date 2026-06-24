import Link from "next/link";
import { Send, ArrowRight } from "@/lib/icons";

export function SendCard() {
  return (
    <Link
      href="/send"
      className="panel group flex flex-col items-start gap-4 p-6 outline-none transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-accent)]/10 text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/20">
        <Send className="h-5 w-5" />
      </div>
      <div className="space-y-1.5">
        <h3 className="text-sm font-semibold tracking-tight text-[var(--color-text)] transition-colors group-hover:text-[var(--color-accent)]">
          Quick Send
        </h3>
        <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
          Send encrypted files to anyone — no account needed on their end. Files
          are encrypted in your browser and shared via a one-time link.
        </p>
      </div>
      <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-[var(--color-accent)]">
        Open Quick Send
        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
