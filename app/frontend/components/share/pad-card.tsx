import Link from "next/link";
import { FileText, ArrowRight } from "@/lib/icons";

export function PadCard() {
  return (
    <Link
      href="/pad"
      className="panel group flex flex-col items-start gap-4 p-6 outline-none transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-500/10 text-purple-500 ring-1 ring-purple-500/20 dark:text-purple-400">
        <FileText className="h-5 w-5" />
      </div>
      <div className="space-y-1.5">
        <h3 className="text-sm font-semibold tracking-tight text-[var(--color-text)] transition-colors group-hover:text-[var(--color-accent)]">
          Text Pad
        </h3>
        <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
          Share encrypted text snippets, notes, or code. Content is encrypted
          client-side and accessible via a secret link.
        </p>
      </div>
      <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-[var(--color-accent)]">
        Open Text Pad
        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
