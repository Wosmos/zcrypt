import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { Github } from "@/lib/icons";
import { WOSMO, WosmoWordmark } from "@/components/marketing/wosmo";

const GITHUB_REPO_URL = "https://github.com/Wosmos/zcrypt";

type FooterLink = { label: string; href: string; external?: boolean };

const FOOTER_COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Features",
    links: [
      { label: "Encrypted drive", href: "/features/encrypted-drive" },
      { label: "File viewers", href: "/features/file-viewers" },
      { label: "Encrypted folders", href: "/features/folders" },
      { label: "Sharing", href: "/features/sharing" },
      { label: "All features", href: "/features" },
    ],
  },
  {
    title: "Compare & apps",
    links: [
      { label: "Download", href: "/download" },
      { label: "vs Dropbox", href: "/vs/dropbox" },
      { label: "vs Google Drive", href: "/vs/google-drive" },
      { label: "vs Proton Drive", href: "/vs/proton-drive" },
      { label: "Terminal app", href: "/tui" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "Documentation", href: "/docs" },
      { label: "Self-hosting", href: "/docs/self-hosting" },
      { label: "API reference", href: "/docs/api" },
      { label: "GitHub", href: GITHUB_REPO_URL, external: true },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About the maker", href: "/about" },
      { label: "Philosophy", href: "/philosophy" },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      {
        label: "Security",
        href: `${GITHUB_REPO_URL}/blob/main/SECURITY.md`,
        external: true,
      },
    ],
  },
];

const LINK_CLASS =
  "block text-[0.9rem] text-[var(--color-text-secondary)] mb-[0.7rem] transition-colors hover:text-[var(--color-accent-hover)]";

function FooterNavLink({ label, href, external }: FooterLink) {
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={LINK_CLASS}
      >
        {label}
      </a>
    );
  }
  return (
    <Link href={href} className={LINK_CLASS}>
      {label}
    </Link>
  );
}

export function MarketingFooter() {
  return (
    <footer className="relative z-[2] mt-28 px-5 sm:px-[50px]">
      {/* Cyan glow bleeding up from behind the footer box */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[-90px] z-[1] h-[300px] w-[min(1100px,92%)] -translate-x-1/2"
        style={{
          background:
            "radial-gradient(ellipse 55% 100% at 50% 100%, rgba(0,213,228,0.08), transparent 72%)",
          filter: "blur(14px)",
        }}
      />

      <div
        className="relative overflow-hidden rounded-t-[32px] border border-b-0 border-[var(--color-border)]"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 0%, rgba(0,213,228,0.05), transparent 55%), linear-gradient(180deg, var(--color-surface), var(--color-bg) 62%)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.07), 0 -22px 60px -34px rgba(0,213,228,0.12)",
        }}
      >
        {/* Giant faint wordmark watermark */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-[-1.8vw] left-1/2 z-0 -translate-x-1/2 select-none whitespace-nowrap font-heading text-[clamp(6rem,24vw,20rem)] font-extrabold leading-[0.8] tracking-[-0.04em]"
          style={{ color: "color-mix(in oklab, var(--color-text) 5%, transparent)" }}
        >
          zcrypt
        </div>

        <div className="relative z-[2] mx-auto max-w-[1180px] px-[clamp(1.6rem,4vw,3rem)] pt-[4.5rem] pb-8">
          <div className="mb-14 grid grid-cols-2 gap-8 md:grid-cols-[1.6fr_repeat(4,1fr)] md:gap-9">
            {/* Brand */}
            <div className="col-span-2 md:col-span-1">
              <Link href="/" aria-label="zcrypt home" className="inline-flex">
                <Logo size="xl" />
              </Link>
              <p className="mt-4 mb-[1.4rem] max-w-[280px] text-[0.88rem] leading-[1.7] text-[var(--color-text-muted)]">
                A zero-knowledge encrypted cloud drive — real folders, instant
                previews, your own storage. Encrypted on your device, readable
                only by you. Open source and self-hostable.
              </p>
              <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-[0.85rem] py-[0.4rem] text-[0.76rem] text-[var(--color-text-secondary)]">
                <span className="h-[7px] w-[7px] rounded-full bg-[#34c779]" />
                All systems operational
              </span>
            </div>

            {/* Link columns */}
            {FOOTER_COLUMNS.map((column) => (
              <div key={column.title}>
                <h4 className="mb-4 font-heading text-[0.74rem] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                  {column.title}
                </h4>
                <ul className="list-none">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <FooterNavLink {...link} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Bottom bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--color-border)] pt-8">
            <p className="text-[0.82rem] text-[var(--color-text-muted)]">
              &copy; {new Date().getFullYear()} zcrypt — your files, your keys.
            </p>

            {/* Built by Wosmo */}
            <a
              href={WOSMO.portfolio}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Built by ${WOSMO.name}`}
              className="group inline-flex items-center gap-2 text-[0.82rem] text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
            >
              <span>Built by</span>
              <WosmoWordmark className="h-3.5 w-auto opacity-80 transition-opacity group-hover:opacity-100" />
            </a>

            <div className="flex gap-[0.7rem]">
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
                className="grid h-[34px] w-[34px] place-items-center rounded-[9px] border border-[var(--color-border)] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-border-hover)] hover:text-[var(--color-accent-hover)]"
              >
                <Github className="h-[17px] w-[17px]" />
              </a>
              <Link
                href="/docs"
                aria-label="Docs"
                className="grid h-[34px] w-[34px] place-items-center rounded-[9px] border border-[var(--color-border)] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-border-hover)] hover:text-[var(--color-accent-hover)]"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
