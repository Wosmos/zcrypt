import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "@/lib/icons";
import { Section, PullQuote } from "@/components/marketing/prose";
import { WOSMO, WosmoMark } from "@/components/marketing/wosmo";

// Server Component (statically generated) — metadata lives here; the only client
// parts are the <Section>/<PullQuote> scroll-reveal islands from prose.tsx.
export const metadata: Metadata = {
  title: "Our Philosophy — Why We Built zcrypt",
  description:
    "The zcrypt manifesto. Why cloud storage is overpriced, why zero-knowledge encryption matters, and why your data should belong to you. Open source, free, and private.",
  alternates: {
    canonical: "https://zcrypt.cloud/philosophy",
  },
  openGraph: {
    title: "Our Philosophy — Why We Built zcrypt",
    description:
      "The zcrypt manifesto. Cloud storage is overpriced. Your data should belong to you.",
    url: "https://zcrypt.cloud/philosophy",
  },
};

export default function PhilosophyPage() {
  return (
    <div className="pt-28 pb-20">
      <article className="mx-auto max-w-2xl px-4">
        {/* Header */}
        <Section>
          <p className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider mb-4">
            Why zcrypt
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.15]">
            Why We Built zcrypt
          </h1>
          <p className="text-lg text-[var(--color-text-secondary)] mt-4 leading-relaxed">
            A long-overdue conversation about who owns your data,
            who&apos;s profiting from it, and why that needs to change.
          </p>
          <div className="h-px bg-[var(--color-border)] mt-10" />
        </Section>

        {/* TL;DR */}
        <Section className="mt-12">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-8">
            <p className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider mb-3">
              The short version
            </p>
            <p className="text-base sm:text-lg text-[var(--color-text-secondary)] leading-relaxed">
              Most cloud storage means renting space on someone else&apos;s servers,
              where <em>they</em> hold the keys to your files. zcrypt is different.
              Your files are encrypted on your device, then stored inside free space
              you already have on accounts <em>you</em> own &mdash; GitHub, GitLab,
              Hugging Face, or Telegram. Only you can read them, you&apos;re limited
              only by your own storage, and it&apos;s free and open source.
            </p>
          </div>
        </Section>

        {/* Section 1 */}
        <Section className="mt-16">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            The Cloud Is Just Someone Else&apos;s Computer
          </h2>
          <div className="mt-6 space-y-4 text-base text-[var(--color-text-secondary)] leading-relaxed">
            <p>
              And they&apos;re charging you rent to live in it.
            </p>
            <p>
              Somewhere in the last decade, the tech industry pulled off one of
              history&apos;s great marketing tricks: they convinced billions of
              people to stop storing files on hardware they own and start paying
              monthly for the privilege of storing them on hardware that someone
              else owns.
            </p>
            <p>
              This is the digital equivalent of renting a storage unit for things
              you already have room for at home. Except the storage unit also reads
              your mail, indexes your photo albums, and raises the rent every year.
            </p>
          </div>

          <PullQuote>
            Cloud storage is a landlord scheme with better PR.
          </PullQuote>

          <div className="space-y-4 text-base text-[var(--color-text-secondary)] leading-relaxed">
            <p>
              AWS S3 charges $23 per terabyte per month. That&apos;s $276 per year
              for a terabyte of storage. A 4TB hard drive costs $80 on Amazon —
              the same Amazon. You could buy the physical hardware to store your
              data four times over for what they charge you in a single year to
              store it on their servers.
            </p>
            <p>
              The markup isn&apos;t 100%. It isn&apos;t 500%. The markup on cloud
              storage is measured in thousands of percent, and the entire industry
              has collectively agreed to pretend this is normal.
            </p>
          </div>
        </Section>

        {/* Section 2 */}
        <Section className="mt-20">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Git Storage: The Loophole Nobody Talks About
          </h2>
          <div className="mt-6 space-y-4 text-base text-[var(--color-text-secondary)] leading-relaxed">
            <p>
              GitHub gives you up to 100GB per repository. For free. GitLab gives
              you 10GB. Hugging Face gives you 300GB. These aren&apos;t hidden
              terms buried in legalese — they&apos;re published limits that
              platform teams actively maintain and support.
            </p>
            <p>
              This isn&apos;t a bug. This is a feature. These platforms need generous
              storage to host large repositories, ML models, and binary assets. They
              built the infrastructure. They set the limits. We just use them as
              intended — for storing data.
            </p>
          </div>

          <PullQuote>
            Every terabyte we store for free is a terabyte AWS can&apos;t bill for.
          </PullQuote>

          <div className="space-y-4 text-base text-[var(--color-text-secondary)] leading-relaxed">
            <p>
              zcrypt takes your files, compresses them with Zstd, encrypts them with
              AES-256-GCM, splits them into manageable chunks, and stores them as
              ordinary-looking data in repositories on the platform you connect. To
              the platform, they look like build artifacts. To you, they&apos;re your
              encrypted files, accessible from anywhere, costing nothing.
            </p>
            <p>
              <strong className="text-[var(--color-text)]">Is this safe and durable?</strong>{" "}
              Yes. Your data is stored as standard private repository content &mdash;
              exactly the kind of large binary data these platforms are built to host.
              zcrypt automatically spreads data across repositories and rotates to
              fresh ones as they fill up, so you stay well within each platform&apos;s
              normal limits. And your files are always retrievable: encrypted chunks
              are integrity-checked and reassembled when you download.
            </p>
          </div>
        </Section>

        {/* Section 3 */}
        <Section className="mt-20">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Zero-Knowledge: Not a Marketing Buzzword
          </h2>
          <div className="mt-6 space-y-4 text-base text-[var(--color-text-secondary)] leading-relaxed">
            <p>
              When Dropbox says &ldquo;we take security seriously,&rdquo; what they
              mean is they encrypt your files with keys they control. They can read
              your files. Their employees can read your files. They scan your files
              to build search indices. Government subpoenas? They hand over your
              data because they can.
            </p>
            <p>
              When we say &ldquo;zero-knowledge,&rdquo; we mean the mathematical
              kind. Your passphrase never leaves your device. We derive encryption
              keys locally using PBKDF2 with 600,000 iterations. The encrypted
              data that gets uploaded is indistinguishable from random noise.
            </p>
          </div>

          <PullQuote>
            We can&apos;t read your files. Not because we&apos;re polite. Because
            we literally don&apos;t have the keys.
          </PullQuote>

          <div className="space-y-4 text-base text-[var(--color-text-secondary)] leading-relaxed">
            <p>
              AES-256-GCM provides authenticated encryption — meaning tampering
              with the ciphertext is detectable. The GCM mode gives you both
              confidentiality and integrity in a single pass. No separate HMAC
              step. No room for implementation mistakes.
            </p>
            <p>
              This isn&apos;t security theater. This is the same encryption standard
              used by intelligence agencies. The difference is we give it to you
              for free, not for $23/TB/month.
            </p>
          </div>
        </Section>

        {/* Section 4 */}
        <Section className="mt-20">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Open Source Because Talk Is Cheap
          </h2>
          <div className="mt-6 space-y-4 text-base text-[var(--color-text-secondary)] leading-relaxed">
            <p>
              Every cloud provider asks you to trust them. Trust their encryption.
              Trust their access controls. Trust that the engineer with admin access
              won&apos;t peek at your vacation photos.
            </p>
            <p>
              We don&apos;t ask you to trust us. We ask you to read the code.
            </p>
            <p>
              Every line of zcrypt is open source. The encryption implementation.
              The chunking algorithm. The upload pipeline. The key derivation.
              If there&apos;s a vulnerability, you&apos;ll find it before we do,
              because you have the same access to the source that we do.
            </p>
          </div>

          <PullQuote>
            The best security audit is 10,000 strangers reading your code.
          </PullQuote>
        </Section>

        {/* Section 5 */}
        <Section className="mt-20">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            The Endgame
          </h2>
          <div className="mt-6 space-y-4 text-base text-[var(--color-text-secondary)] leading-relaxed">
            <p>
              A world where personal file storage costs $0 and your data belongs
              to you.
            </p>
            <p>
              Revolutionary? No. Obvious? Yes. Done? Finally.
            </p>
            <p>
              The technology for free, encrypted, distributed storage has existed
              for years. Git hosting has been free for over a decade. AES-256 has
              been an open standard since 2001. Zstd compression has been open
              source since 2016. All zcrypt does is connect the dots that the
              industry had every incentive to leave disconnected.
            </p>
            <p>
              Because every dot connected is a revenue stream severed.
            </p>
          </div>

          <PullQuote>
            They had every incentive to never build this. So we did.
          </PullQuote>
        </Section>

        {/* Who's behind this */}
        <Section className="mt-20">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            So Who&apos;s &ldquo;We&rdquo;?
          </h2>
          <div className="mt-6 space-y-4 text-base text-[var(--color-text-secondary)] leading-relaxed">
            <p>
              Mostly one person. I&apos;m {WOSMO.name} &mdash; a{" "}
              {WOSMO.role.toLowerCase()} who got tired of paying rent on his own
              files and built the alternative. zcrypt is mine end to end: the
              encryption, the upload pipeline, the drive, and this page
              you&apos;re reading right now.
            </p>
            <p>
              I say &ldquo;we&rdquo; out of habit, not to hide behind a logo. And
              that matters here: a tool that asks you to trust it with your keys
              should tell you exactly who wrote the code that holds them. No
              anonymous founder, no shell company. Just my name, on the record.
            </p>
          </div>

          <Link
            href="/about"
            className="group mt-8 flex items-center gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-colors hover:border-cyan-500/40"
          >
            <WosmoMark className="h-12 w-auto flex-shrink-0 rounded-xl" />
            <div className="min-w-0">
              <p className="font-bold tracking-tight text-[var(--color-text)]">
                {WOSMO.name}{" "}
                <span className="font-normal text-[var(--color-text-muted)]">
                  / {WOSMO.handle}
                </span>
              </p>
              <p className="mt-0.5 inline-flex items-center gap-1 text-sm font-semibold text-cyan-600 dark:text-cyan-400">
                More about the maker
                <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </p>
            </div>
          </Link>
        </Section>

        {/* CTA */}
        <Section className="mt-20 pt-10 border-t border-[var(--color-border)]">
          <div className="text-center">
            <h3 className="text-xl font-bold">Ready to stop renting?</h3>
            <p className="text-sm text-[var(--color-text-secondary)] mt-2">
              Your files. Your keys. Your freedom. Zero dollars.
            </p>
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 mt-6 rounded-xl bg-cyan-500 px-8 py-3.5 text-sm font-semibold text-slate-900 hover:bg-cyan-400 transition-colors shadow-xl shadow-cyan-500/25"
            >
              Get started for free <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </Section>
      </article>
    </div>
  );
}
