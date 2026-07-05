import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, MapPin, ShieldCheck } from "@/lib/icons";
import { Section, PullQuote } from "@/components/marketing/prose";
import { WOSMO, WOSMO_SOCIALS, WosmoMark } from "@/components/marketing/wosmo";
import { PersonJsonLd, BreadcrumbJsonLd } from "@/components/seo/json-ld";

// Server Component (statically generated) — metadata lives here, and the only
// client parts are the <Section> scroll-reveal islands from prose.tsx.
export const metadata: Metadata = {
  title: "About — The person behind zcrypt",
  description:
    "zcrypt is built by Wasif Malik (Wosmo), a full-stack engineer from Karachi. A privacy tool should tell you who's behind it — so here I am. My story, the other things I've built, and how to reach me.",
  alternates: {
    canonical: "https://zcrypt.cloud/about",
  },
  openGraph: {
    title: "About — The person behind zcrypt",
    description:
      "zcrypt isn't a faceless company. It's built by one engineer, in the open. Meet Wasif Malik (Wosmo).",
    url: "https://zcrypt.cloud/about",
  },
};

// ─── Other things Wasif has shipped (portfolio proof) ────────────────────────
const PROJECTS: {
  name: string;
  blurb: string;
  stack: string;
  href: string;
}[] = [
  {
    name: "Learnity",
    blurb: "AI-powered learning platform with gamified courses and progress tracking.",
    stack: "Next.js 15 · PostgreSQL · Firebase",
    href: "https://github.com/Wosmos/Learnity",
  },
  {
    name: "DocXO",
    blurb: "Real-time collaborative documents — multiple cursors, live editing, zero lag.",
    stack: "Next.js · Liveblocks · Lexical",
    href: "https://github.com/Wosmos/DocXO",
  },
  {
    name: "Tellow",
    blurb: "Cross-platform video calling app with rooms, chat, and screen share.",
    stack: "React Native · Expo · GetStream",
    href: "https://github.com/Wosmos/Tellow",
  },
  {
    name: "NetLink",
    blurb: "A Go chat backend built to hold thousands of concurrent WebSocket connections.",
    stack: "Go · WebSockets · Concurrency",
    href: "https://github.com/Wosmos/NetLink",
  },
  {
    name: "DevToolsHQ",
    blurb: "A dashboard of everyday developer tools — formatters, converters, generators.",
    stack: "Next.js · TypeScript · Firebase",
    href: "https://github.com/Wosmos/DevToolsHQ",
  },
  {
    name: "ResumeRight",
    blurb: "An AI resume optimizer that scores against ATS checks and rewrites weak lines.",
    stack: "Next.js · AI · TypeScript",
    href: "https://github.com/Wosmos/AI-Resume-checker",
  },
];

const STACK = [
  "TypeScript",
  "React",
  "Next.js",
  "Go",
  "PostgreSQL",
  "React Native",
  "Flutter",
  "Node.js",
  "Tailwind CSS",
  "AI / LLMs",
];

export default function AboutPage() {
  return (
    <div className="pt-28 pb-20">
      <PersonJsonLd />
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: "https://zcrypt.cloud" },
          { name: "About", url: "https://zcrypt.cloud/about" },
        ]}
      />
      <article className="mx-auto max-w-3xl px-4">
        {/* ─── Hero ─────────────────────────────────────────── */}
        <Section>
          <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
            The person behind zcrypt
          </p>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <WosmoMark className="h-16 w-auto flex-shrink-0 rounded-2xl shadow-lg shadow-cyan-500/10" />
            <div>
              <h1 className="text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
                Hi, I&apos;m Wasif.
                <br />
                <span className="text-[var(--color-text-secondary)]">
                  I built zcrypt.
                </span>
              </h1>
            </div>
          </div>

          <p className="mt-7 max-w-2xl text-lg leading-relaxed text-[var(--color-text-secondary)]">
            {WOSMO.name} — better known online as{" "}
            <span className="font-semibold text-[var(--color-text)]">
              {WOSMO.handle}
            </span>
            . A {WOSMO.role.toLowerCase()} who&apos;s obsessed with building
            high-performance, real-world systems. zcrypt is one of them, built
            end to end: the crypto, the pipeline, the drive, and every pixel of
            this site.
          </p>

          {/* Identity chips */}
          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--color-text-secondary)]">
              <MapPin className="h-3.5 w-3.5 text-cyan-500" />
              {WOSMO.location}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--color-text-secondary)]">
              {WOSMO.role}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/20 bg-cyan-500/5 px-3.5 py-1.5 text-[13px] font-medium text-cyan-600 dark:text-cyan-400">
              Building in the open
            </span>
          </div>

          {/* Primary links */}
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={WOSMO.portfolio}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#2de0ed] via-[#00d5e4] to-[#0093a3] px-6 py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-cyan-500/25 transition-shadow hover:shadow-xl hover:shadow-cyan-500/40"
            >
              View my portfolio
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
            <a
              href={WOSMO.github}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-3 text-sm font-semibold text-[var(--color-text)] transition-colors hover:border-cyan-500/40"
            >
              GitHub
              <ArrowUpRight className="h-4 w-4" />
            </a>
          </div>

          <div className="mt-12 h-px bg-[var(--color-border)]" />
        </Section>

        {/* ─── Not anonymous (the trust angle) ──────────────── */}
        <Section className="mt-12">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-8">
            <div className="mb-3 inline-flex items-center gap-2 text-cyan-600 dark:text-cyan-400">
              <ShieldCheck className="h-5 w-5" />
              <span className="text-xs font-semibold uppercase tracking-wider">
                Why my name is on this
              </span>
            </div>
            <p className="text-base leading-relaxed text-[var(--color-text-secondary)] sm:text-lg">
              A tool that holds the keys to your files should tell you who&apos;s
              behind it. I&apos;m not a faceless &ldquo;we,&rdquo; and I&apos;m
              not the anonymous founder who ships a privacy app and vanishes.
              I&apos;m a real person, with a name, a face, and a track record you
              can check &mdash; and every line of zcrypt is open source, so you
              never have to take my word for any of it.
            </p>
          </div>
        </Section>

        {/* ─── Why I built it ───────────────────────────────── */}
        <Section className="mt-16">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Why I built zcrypt
          </h2>
          <div className="mt-6 space-y-4 text-base leading-relaxed text-[var(--color-text-secondary)]">
            <p>
              I kept running into the same wall: cloud storage is absurdly
              expensive, and the &ldquo;free&rdquo; tiers pay for themselves by
              reading your data. Meanwhile I already had gigabytes of free space
              sitting unused across accounts I owned — GitHub, GitLab, Hugging
              Face, Telegram.
            </p>
            <p>
              So I built the thing I wanted to exist: a real encrypted drive that
              lives inside storage you already own, where files are encrypted on
              your device before they ever leave it. No rent, no lock-in, nothing
              I can read.
            </p>
          </div>
          <PullQuote>
            I didn&apos;t want to trust a cloud provider. So I made sure you
            never have to trust me either.
          </PullQuote>
          <Link
            href="/philosophy"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-600 transition-all hover:gap-2.5 dark:text-cyan-400"
          >
            Read the full philosophy
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Section>

        {/* ─── Other things I've built ──────────────────────── */}
        <Section className="mt-20">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Other things I&apos;ve shipped
          </h2>
          <p className="mt-3 text-base leading-relaxed text-[var(--color-text-secondary)]">
            zcrypt isn&apos;t a one-off. I ship end-to-end products across web,
            mobile, and backend — here&apos;s a sample.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {PROJECTS.map((p) => (
              <a
                key={p.name}
                href={p.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group card p-5 transition-colors hover:border-cyan-500/40"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold tracking-tight">
                    {p.name}
                  </h3>
                  <ArrowUpRight className="h-4 w-4 text-cyan-500 opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {p.blurb}
                </p>
                <p className="mt-3 font-mono text-[11px] tracking-tight text-[var(--color-text-muted)]">
                  {p.stack}
                </p>
              </a>
            ))}
          </div>

          <div className="mt-8">
            <a
              href={WOSMO.portfolio}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-600 transition-all hover:gap-2.5 dark:text-cyan-400"
            >
              See everything on my portfolio
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </Section>

        {/* ─── The stack ────────────────────────────────────── */}
        <Section className="mt-20">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            What I work with
          </h2>
          <p className="mt-3 text-base leading-relaxed text-[var(--color-text-secondary)]">
            Frontend to infrastructure — comfortable across the whole stack.
          </p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            {STACK.map((tech) => (
              <span
                key={tech}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 text-[13px] font-medium text-[var(--color-text-secondary)]"
              >
                {tech}
              </span>
            ))}
          </div>
        </Section>

        {/* ─── Contact / CTA ────────────────────────────────── */}
        <Section className="mt-20 border-t border-[var(--color-border)] pt-12">
          <div className="rounded-3xl border border-[var(--color-border)] bg-gradient-to-b from-[var(--color-surface-1)] to-[var(--color-surface)] p-8 text-center sm:p-10">
            <WosmoMark className="mx-auto h-12 w-auto rounded-xl shadow-lg shadow-cyan-500/10" />
            <h2 className="mt-6 text-2xl font-bold tracking-tight sm:text-3xl">
              Let&apos;s build something.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-[var(--color-text-secondary)]">
              Open to new projects and consulting. The fastest way to reach me is
              anywhere below.
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-2.5">
              {WOSMO_SOCIALS.map(({ label, href, Icon }) => (
                <a
                  key={label}
                  href={href}
                  target={href.startsWith("mailto:") ? undefined : "_blank"}
                  rel={href.startsWith("mailto:") ? undefined : "noopener noreferrer"}
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5 text-[13px] font-medium text-[var(--color-text-secondary)] transition-colors hover:border-cyan-500/40 hover:text-[var(--color-text)]"
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </a>
              ))}
            </div>
          </div>
        </Section>
      </article>
    </div>
  );
}
