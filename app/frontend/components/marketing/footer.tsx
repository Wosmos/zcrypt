"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Logo } from "@/components/ui/logo";
import { ArrowUpRight, BookOpen, Github } from "@/lib/icons";
import { WOSMO, WosmoWordmark } from "@/components/marketing/wosmo";

const GITHUB_REPO_URL = "https://github.com/Wosmos/zcrypt";

type FooterLink = { key: string; href: string; external?: boolean };

const FOOTER_COLUMNS: { titleKey: string; links: FooterLink[] }[] = [
  {
    titleKey: "colFeatures",
    links: [
      { key: "encryptedDrive", href: "/features/encrypted-drive" },
      { key: "fileViewers", href: "/features/file-viewers" },
      { key: "folders", href: "/features/folders" },
      { key: "sharing", href: "/features/sharing" },
      { key: "allFeatures", href: "/features" },
    ],
  },
  {
    titleKey: "colCompare",
    links: [
      { key: "download", href: "/download" },
      { key: "vsDropbox", href: "/vs/dropbox" },
      { key: "vsGoogle", href: "/vs/google-drive" },
      { key: "vsProton", href: "/vs/proton-drive" },
      { key: "tui", href: "/tui" },
    ],
  },
  {
    titleKey: "colDevelopers",
    links: [
      { key: "documentation", href: "/docs" },
      { key: "selfHosting", href: "/docs/self-hosting" },
      { key: "api", href: "/docs/api" },
      { key: "github", href: GITHUB_REPO_URL, external: true },
    ],
  },
  {
    titleKey: "colCompany",
    links: [
      { key: "about", href: "/about" },
      { key: "philosophy", href: "/philosophy" },
      { key: "privacy", href: "/privacy" },
      { key: "terms", href: "/terms" },
      { key: "security", href: `${GITHUB_REPO_URL}/blob/main/SECURITY.md`, external: true },
    ],
  },
];

const LINK_CLASS =
  "group inline-flex items-center gap-1 rounded-md py-[10px] text-[0.9rem] leading-6 text-[var(--color-text-secondary)] transition-colors duration-200 hover:text-[var(--color-text)] focus-visible:text-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] md:py-[5px]";

const UNDERLINE =
  "bg-gradient-to-r from-current to-current bg-[length:0_1px] bg-left-bottom bg-no-repeat transition-[background-size] duration-200 ease-out group-hover:bg-[length:100%_1px] group-focus-visible:bg-[length:100%_1px] motion-reduce:transition-none";

const ICON_BUTTON =
  "grid h-11 w-11 place-items-center rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)]/50 text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-border-hover)] hover:text-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] md:h-10 md:w-10";

function FooterNavLink({
  linkKey,
  href,
  external,
}: {
  linkKey: string;
  href: string;
  external?: boolean;
}) {
  const t = useTranslations("marketing.footer");
  const label = t(`links.${linkKey}`);
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
        <span className={UNDERLINE}>{label}</span>
        <ArrowUpRight
          aria-hidden="true"
          className="h-3 w-3 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 rtl:-scale-x-100 motion-reduce:transition-none"
        />
        <span className="sr-only">{t("newTab")}</span>
      </a>
    );
  }
  return (
    <Link href={href} className={LINK_CLASS}>
      <span className={UNDERLINE}>{label}</span>
    </Link>
  );
}

export function MarketingFooter() {
  const t = useTranslations("marketing.footer");
  return (
    <footer className="relative z-[2] mt-28 px-5 sm:px-[50px]">
      {/* Cyan glow bleeding up from behind the footer box */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[-90px] z-[1] h-[300px] w-[min(1100px,92%)] -translate-x-1/2"
        style={{
          background:
            "radial-gradient(ellipse 60% 110% at 50% 100%, rgba(0,213,228,0.07), transparent 78%)",
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
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-0 z-[1] h-px w-[60%] -translate-x-1/2 bg-[linear-gradient(90deg,transparent,rgb(0_213_228/0.35),transparent)]"
        />

        {/* Giant faint wordmark watermark */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-[-1.8vw] left-1/2 z-0 -translate-x-1/2 select-none whitespace-nowrap font-heading text-[clamp(5rem,24vw,20rem)] font-extrabold leading-[0.8] tracking-[-0.04em] [-webkit-mask-image:linear-gradient(180deg,#000_30%,transparent_95%)] [mask-image:linear-gradient(180deg,#000_30%,transparent_95%)]"
          style={{ color: "color-mix(in oklab, var(--color-text) 5%, transparent)" }}
        >
          zcrypt
        </div>

        <div className="relative z-[2] mx-auto max-w-[1180px] px-[clamp(1.6rem,4vw,3rem)] pt-[4.5rem] pb-8">
          <div className="mb-14 grid grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-[1.6fr_repeat(4,1fr)] md:gap-9">
            <div className="col-span-2 md:col-span-1">
              <Link
                href="/"
                aria-label={t("home")}
                className="inline-flex rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
              >
                <Logo size="xl" />
              </Link>
              <p className="mt-4 mb-[1.4rem] max-w-[300px] text-[0.9rem] leading-[1.7] text-[var(--color-text-secondary)] text-pretty">
                {t("blurb")}
              </p>
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/40 px-[0.9rem] text-[0.76rem] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-border-hover)] hover:text-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] md:min-h-8"
              >
                <Github aria-hidden="true" className="h-3.5 w-3.5" />
                {t("openSource")}
                <span className="sr-only">{t("newTab")}</span>
              </a>
            </div>

            <h2 className="sr-only">{t("siteLinks")}</h2>
            {FOOTER_COLUMNS.map((column) => (
              <div key={column.titleKey}>
                <h3 className="mb-2 font-heading text-[0.74rem] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)] md:mb-3">
                  {t(column.titleKey)}
                </h3>
                <ul className="list-none">
                  {column.links.map((link) => (
                    <li key={link.key}>
                      <FooterNavLink linkKey={link.key} href={link.href} external={link.external} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="pb-safe flex flex-col items-start gap-4 border-t border-[var(--color-border)] pt-8 md:grid md:grid-cols-[1fr_auto_1fr] md:items-center">
            <p className="text-[0.82rem] text-[var(--color-text-muted)]">
              {t("copyright", { year: new Date().getFullYear() })}
            </p>

            <a
              href={WOSMO.portfolio}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("builtByAria", { name: WOSMO.name })}
              className="group inline-flex min-h-11 items-center gap-2 rounded-lg text-[0.82rem] text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] md:min-h-0 md:justify-self-center"
            >
              <span>{t("builtBy")}</span>
              <WosmoWordmark className="h-3.5 w-auto opacity-80 transition-opacity group-hover:opacity-100" />
            </a>

            <div className="flex flex-wrap items-center gap-[0.7rem] md:justify-self-end">
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("githubAria")}
                className={ICON_BUTTON}
              >
                <Github aria-hidden="true" className="h-[17px] w-[17px]" />
              </a>
              <Link href="/docs" aria-label={t("docs")} className={ICON_BUTTON}>
                <BookOpen aria-hidden="true" className="h-[17px] w-[17px]" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
