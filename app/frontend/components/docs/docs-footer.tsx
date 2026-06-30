import Link from "next/link";
import { Github } from "@/lib/icons";

export function DocsFooter() {
  return (
    <footer className="border-t border-[var(--color-border)]">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-6 md:px-10">
        <p className="text-[12px] text-[var(--color-text-muted)]">© 2025 zcrypt</p>
        <div className="flex items-center gap-5 text-[12px] text-[var(--color-text-muted)]">
          <a
            href="https://github.com/zcrypt/zcrypt"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 transition-colors hover:text-[var(--color-text)]"
          >
            <Github className="h-3.5 w-3.5" />
            GitHub
          </a>
          <Link href="/privacy" className="transition-colors hover:text-[var(--color-text)]">
            Privacy
          </Link>
          <Link href="/terms" className="transition-colors hover:text-[var(--color-text)]">
            Terms
          </Link>
        </div>
      </div>
    </footer>
  );
}
