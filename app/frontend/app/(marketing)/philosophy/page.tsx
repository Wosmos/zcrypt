"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import { ArrowRight } from "lucide-react";

function Section({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <motion.section
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

function PullQuote({ children }: { children: React.ReactNode }) {
  return (
    <blockquote className="my-12 border-l-2 border-emerald-500/40 pl-6 py-2">
      <p className="text-xl sm:text-2xl font-medium italic text-[var(--color-text)] leading-relaxed">
        {children}
      </p>
    </blockquote>
  );
}

export default function PhilosophyPage() {
  return (
    <div className="pt-28 pb-20">
      <article className="mx-auto max-w-2xl px-4">
        {/* Header */}
        <Section>
          <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-4">
            The Manifesto
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.15]">
            Why We Built zpush
          </h1>
          <p className="text-lg text-[var(--color-text-secondary)] mt-4 leading-relaxed">
            A long-overdue conversation about who owns your data,
            who&apos;s profiting from it, and why that needs to change.
          </p>
          <div className="h-px bg-[var(--color-border)] mt-10" />
        </Section>

        {/* Section 1 */}
        <Section className="mt-16">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            The Cloud Is Just Someone Else&apos;s Computer
          </h2>
          <div className="mt-6 space-y-4 text-[15px] text-[var(--color-text-secondary)] leading-relaxed">
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

          <div className="space-y-4 text-[15px] text-[var(--color-text-secondary)] leading-relaxed">
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
          <div className="mt-6 space-y-4 text-[15px] text-[var(--color-text-secondary)] leading-relaxed">
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

          <div className="space-y-4 text-[15px] text-[var(--color-text-secondary)] leading-relaxed">
            <p>
              zpush takes your files, compresses them with Zstd, encrypts them with
              AES-256-GCM, chunks them into manageable pieces, and distributes them
              across your Git provider accounts. To the platform, they look like
              build artifacts. To you, they&apos;re your encrypted files, accessible
              from anywhere, costing nothing.
            </p>
            <p>
              Is this the intended use of Git LFS? Not exactly. But is paying $23/TB/month
              the intended use of your money? Also not exactly.
            </p>
          </div>
        </Section>

        {/* Section 3 */}
        <Section className="mt-20">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Zero-Knowledge: Not a Marketing Buzzword
          </h2>
          <div className="mt-6 space-y-4 text-[15px] text-[var(--color-text-secondary)] leading-relaxed">
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

          <div className="space-y-4 text-[15px] text-[var(--color-text-secondary)] leading-relaxed">
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
          <div className="mt-6 space-y-4 text-[15px] text-[var(--color-text-secondary)] leading-relaxed">
            <p>
              Every cloud provider asks you to trust them. Trust their encryption.
              Trust their access controls. Trust that the engineer with admin access
              won&apos;t peek at your vacation photos.
            </p>
            <p>
              We don&apos;t ask you to trust us. We ask you to read the code.
            </p>
            <p>
              Every line of zpush is open source. The encryption implementation.
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
          <div className="mt-6 space-y-4 text-[15px] text-[var(--color-text-secondary)] leading-relaxed">
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
              source since 2016. All zpush does is connect the dots that the
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

        {/* CTA */}
        <Section className="mt-20 pt-10 border-t border-[var(--color-border)]">
          <div className="text-center">
            <h3 className="text-xl font-bold">Ready to stop renting?</h3>
            <p className="text-sm text-[var(--color-text-secondary)] mt-2">
              Your files. Your keys. Your freedom. Zero dollars.
            </p>
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 mt-6 rounded-xl bg-emerald-500 px-8 py-3.5 text-sm font-semibold text-slate-900 hover:bg-emerald-400 transition-colors shadow-xl shadow-emerald-500/25"
            >
              Get started for free <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </Section>
      </article>
    </div>
  );
}
