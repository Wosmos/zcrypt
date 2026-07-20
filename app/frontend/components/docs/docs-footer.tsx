import Link from "next/link";
import { Github, Heart } from "@/lib/icons";

const GITHUB_REPO_URL = "https://github.com/Wosmos/zcrypt";
const SPONSOR_URL = "https://github.com/sponsors/Wosmos";

/**
 * The docs section's own footer — deliberately smaller than the marketing
 * site's footer (no sitemap columns, no newsletter). Docs are a reference
 * you're scanning, not a landing page you're browsing.
 */
export function DocsFooter() {
  return (
    <footer className="border-t border-[var(--color-border)]">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-6 py-6 sm:flex-row md:px-10">
        <p className="text-[12px] text-[var(--color-text-muted)]">© zcrypt</p>
        <div className="flex items-center gap-5 text-[12px] text-[var(--color-text-muted)]">
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 transition-colors hover:text-[var(--color-text)]"
          >
            <Github className="h-3.5 w-3.5" />
            GitHub
          </a>
          <Link href="/docs/license" className="transition-colors hover:text-[var(--color-text)]">
            License
          </Link>
          <Link href="/privacy" className="transition-colors hover:text-[var(--color-text)]">
            Privacy
          </Link>
          <Link href="/terms" className="transition-colors hover:text-[var(--color-text)]">
            Terms
          </Link>
          <a
            href={SPONSOR_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 transition-colors hover:text-cyan-600 dark:hover:text-cyan-400"
          >
            <Heart className="h-3.5 w-3.5" />
            Sponsor
          </a>
        </div>
      </div>
    </footer>
  );
}
