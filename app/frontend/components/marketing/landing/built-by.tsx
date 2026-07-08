import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "@/lib/icons";
import { ScrollReveal } from "./scroll-reveal";
import { WOSMO, WosmoWordmark } from "@/components/marketing/wosmo";

/**
 * Landing "built by" strip — a personal signature band that names the maker
 * before the final CTA. Ties the whole product back to a real, accountable
 * human (the trust play for a zero-knowledge tool).
 */
export function BuiltBy() {
  return (
    <section className="px-4 py-24">
      <div className="mx-auto max-w-4xl">
        <ScrollReveal>
          <div className="relative overflow-hidden rounded-3xl border border-[var(--color-border)] bg-gradient-to-b from-[var(--color-surface-1)] to-[var(--color-surface)] p-8 sm:p-12">
            {/* Soft cyan glow */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(60% 80% at 15% 0%, rgba(0,213,228,0.07), transparent 70%)",
              }}
            />

            <div className="relative flex flex-col items-center gap-8 text-center sm:flex-row sm:items-center sm:gap-10 sm:text-left">
              <WosmoWordmark className="h-9 w-auto flex-shrink-0 text-[var(--color-text)] sm:h-11" />

              <div className="min-w-0 flex-1">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
                  The human behind it
                </p>
                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  Built by one guy who just wanted free storage.
                </h2>
                <p className="mx-auto mt-3 max-w-xl leading-relaxed text-[var(--color-text-secondary)] sm:mx-0">
                  zcrypt is designed, built, and maintained by{" "}
                  <span className="font-semibold text-[var(--color-text)]">
                    {WOSMO.name}
                  </span>{" "}
                  &mdash; a {WOSMO.role.toLowerCase()} from {WOSMO.location} who
                  got tired of clouds reading his files and built one that
                  can&apos;t. It&apos;s open source, so you never have to take his
                  word for it.
                </p>

                <div className="mt-7 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
                  <Link
                    href="/about"
                    className="group inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-5 py-2.5 text-sm font-semibold text-[var(--color-text)] transition-colors hover:border-cyan-500/40"
                  >
                    About the maker
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                  <a
                    href={WOSMO.portfolio}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-cyan-600 transition-colors hover:text-cyan-500 dark:text-cyan-400"
                  >
                    Portfolio
                    <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
