import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, MapPin, ShieldCheck } from "@/lib/icons";
import { PullQuote } from "@/components/marketing/prose";
import { Section } from "@/components/marketing/section-reveal";
import { WOSMO, WOSMO_SOCIALS, WosmoWordmark } from "@/components/marketing/wosmo";
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
          <WosmoWordmark className="h-8 w-auto text-[var(--color-text)]" />

          <p className="mt-8 mb-4 text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
            Who&apos;s actually behind this
          </p>
          <h1 className="text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
            Hi, I&apos;m Wasif.
            <br />
            <span className="text-[var(--color-text-secondary)]">
              I just wanted free storage.
            </span>
          </h1>

          <p className="mt-7 max-w-2xl text-lg leading-relaxed text-[var(--color-text-secondary)]">
            {WOSMO.name} &mdash;{" "}
            <span className="font-semibold text-[var(--color-text)]">
              {WOSMO.handle}
            </span>{" "}
            to the internet. A {WOSMO.role.toLowerCase()} in {WOSMO.location} who
            needed somewhere to put a lot of files, couldn&apos;t find storage
            that didn&apos;t also want to read them, and &mdash; instead of
            letting it go like a reasonable person &mdash; spent a few months
            building his own. That&apos;s zcrypt. It&apos;s just me back here: no
            team, no investors, no &ldquo;zcrypt family.&rdquo; Which mostly means
            when something breaks, I already know whose fault it is.
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
              A tool that holds your keys should at least tell you who to blame
              &mdash; so, that&apos;s me. Right here. There&apos;s no mysterious
              &ldquo;we&rdquo; to vanish behind when something breaks, no
              &ldquo;the team is looking into it.&rdquo; There is a team. It&apos;s
              me. The encryption runs on your device before anything uploads, so I
              can&apos;t read your files. I&apos;ve tried it on my own test data.
              Can&apos;t. That&apos;s the entire point.
            </p>
          </div>
        </Section>

        {/* ─── The origin story ─────────────────────────────── */}
        <Section className="mt-16">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            How zcrypt actually happened
          </h2>
          <div className="mt-6 space-y-4 text-base leading-relaxed text-[var(--color-text-secondary)]">
            <p>
              A couple of months ago I was moving my whole life between machines
              &mdash; 50-something gigabytes of projects, RAW photos, and
              half-finished edits I keep swearing I&apos;ll get back to. The kind
              of files you can&apos;t just re-download.
            </p>
            <p>
              Google Drive tapped me on the shoulder at 15GB and asked for my
              card. So I did the very reasonable thing: I made a second account.
              Then a third. For about a week I was splitting one folder across
              three logins like a low-budget digital smuggler, quietly proud of a
              system held together with tape.
            </p>
            <p>
              Then I tried TeraBox. &ldquo;One terabyte, free,&rdquo; they said.
              What they didn&apos;t say: the download button is hidden like a
              state secret, your files quietly live on <em>their</em> servers, and
              the fine print treats your data as theirs to scan and learn from. It
              really clicked when I uploaded a 4GB folder, watched it crawl to
              80%, and watched it fail. My first thought wasn&apos;t &ldquo;let me
              retry.&rdquo; It was &ldquo;why am I handing my entire life to a
              company whose whole business is knowing what&apos;s inside it?&rdquo;
            </p>
            <p>
              And here&apos;s the part I genuinely can&apos;t take credit for,
              because it&apos;s just true: free storage was never free. I just
              hadn&apos;t read the price tag &mdash; because the price tag is me.
              These are billion-dollar companies; privacy isn&apos;t a feature
              they forgot to add, it&apos;s the thing they quietly sell against.
            </p>
            <p>
              So I stopped complaining online and started building, which is
              really just complaining with extra steps. The idea was simple even
              though the code very much wasn&apos;t: encrypt your files on your
              device before they leave, so not even I can read them, then store
              them across the infrastructure you already own and trust. No new
              data empire. No &ldquo;we value your privacy&rdquo; banner that
              means the exact opposite. Just your files, locked, yours.
            </p>
          </div>
          <PullQuote>
            Free storage was never free. I just hadn&apos;t read the price tag
            &mdash; because the price tag was me.
          </PullQuote>
          <div className="space-y-4 text-base leading-relaxed text-[var(--color-text-secondary)]">
            <p>
              I&apos;m building it in public &mdash; the wins, the bugs, and the
              2AM &ldquo;why is this WASM module re-initialising&rdquo; commits.
              It&apos;s me and a concerning amount of coffee, so yes, there will be
              rough edges. The encryption isn&apos;t one of them: it&apos;s open
              source, and I can&apos;t read your files even if I wanted to. (I
              don&apos;t. But I couldn&apos;t.)
            </p>
          </div>
          <Link
            href="/philosophy"
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-600 transition-all hover:gap-2.5 dark:text-cyan-400"
          >
            The longer, ranty version lives on the philosophy page
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Section>

        {/* ─── Other things I've built ──────────────────────── */}
        <Section className="mt-20">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Other things I&apos;ve built
          </h2>
          <p className="mt-3 text-base leading-relaxed text-[var(--color-text-secondary)]">
            I have a bad habit of building the whole thing myself &mdash;
            frontend, backend, and the awkward bits in between. A few others that
            (mostly) work:
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
            The usual suspects
          </h2>
          <p className="mt-3 text-base leading-relaxed text-[var(--color-text-secondary)]">
            The tools I reach for, from the browser all the way down to the bytes
            on disk:
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
            <WosmoWordmark className="mx-auto h-8 w-auto text-[var(--color-text)]" />
            <h2 className="mt-6 text-2xl font-bold tracking-tight sm:text-3xl">
              Let&apos;s build something.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-[var(--color-text-secondary)]">
              I&apos;m open to new projects and freelance work &mdash; and I
              answer my own messages, mostly because there&apos;s no one else to
              pass them to. Pick a door:
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
