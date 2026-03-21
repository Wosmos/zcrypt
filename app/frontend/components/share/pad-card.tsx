"use client";

import Link from "next/link";
import { FileText, ArrowRight } from "@/lib/icons";

export function PadCard() {
  return (
    <Link
      href="/pad"
      className="flex flex-col items-start gap-3 p-5 card hover:border-[var(--color-accent)]/30 transition-colors group"
    >
      <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-purple-500/10 text-purple-500 dark:text-purple-400">
        <FileText className="h-5 w-5" />
      </div>
      <div>
        <h3 className="text-sm font-semibold group-hover:text-[var(--color-accent)] transition-colors">
          Text Pad
        </h3>
        <p className="text-xs text-[var(--color-text-muted)] mt-1 leading-relaxed">
          Share encrypted text snippets, notes, or code. Content is encrypted client-side and accessible via a secret link.
        </p>
      </div>
      <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-accent)] mt-auto">
        Open Text Pad <ArrowRight className="h-3 w-3" />
      </span>
    </Link>
  );
}
