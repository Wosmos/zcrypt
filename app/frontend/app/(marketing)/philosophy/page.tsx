import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "@/lib/icons";
import { ProseSection, PullQuote, ReadingPage, proseBody } from "@/components/marketing/prose";
import { Section } from "@/components/marketing/section-reveal";
import { ClosingCta } from "@/components/marketing/landing/closing-cta";
import { MarketingCard, cardSurface } from "@/components/marketing/ui/card";
import { WOSMO, WosmoWordmark } from "@/components/marketing/wosmo";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Our Philosophy. Why We Built zcrypt",
  description:
    "The zcrypt manifesto. Why cloud storage is overpriced, why zero-knowledge encryption matters, and why your data should belong to you. Open source, free, and private.",
  alternates: {
    canonical: `${SITE_URL}/philosophy`,
  },
  openGraph: {
    title: "Our Philosophy. Why We Built zcrypt",
    description:
      "The zcrypt manifesto. Cloud storage is overpriced. Your data should belong to you.",
    url: `${SITE_URL}/philosophy`,
  },
};

export default function PhilosophyPage() {
  return (
    <ReadingPage
      eyebrow="Why zcrypt"
      title="Why we built zcrypt"
      lede={
        <>
          A long-overdue conversation about who owns your data, who&apos;s profiting from it, and
          why that needs to change.
        </>
      }
      after={<ClosingCta id="philosophy-cta" />}
    >
      <Section>
        <MarketingCard className="p-6 sm:p-8">
          <p className="pv2-eyebrow">The short version</p>
          <p className="mt-3 text-base leading-relaxed text-[var(--color-text-secondary)] sm:text-lg">
            Most cloud storage means renting space on someone else&apos;s servers, where{" "}
            <em>they</em> hold the keys to your files. zcrypt is different. Your files are encrypted
            on your device, then stored inside free space you already have on accounts <em>you</em>{" "}
            own: GitHub, GitLab, Hugging Face, or Telegram. Only you can read them, you&apos;re
            limited only by your own storage, and it&apos;s free and open source.
          </p>
        </MarketingCard>
      </Section>

      <ProseSection
        id="phi-rent"
        eyebrow="The rent"
        title="The cloud is just someone else's computer"
      >
        <div className={proseBody}>
          <p>And they&apos;re charging you rent to live in it.</p>
          <p>
            Somewhere in the last decade, the tech industry pulled off one of history&apos;s great
            marketing tricks: they convinced billions of people to stop storing files on hardware
            they own and start paying monthly for the privilege of storing them on hardware that
            someone else owns.
          </p>
          <p>
            This is the digital equivalent of renting a storage unit for things you already have
            room for at home. Except the storage unit also reads your mail, indexes your photo
            albums, and raises the rent every year.
          </p>
        </div>

        <PullQuote>Cloud storage is a landlord scheme with better PR.</PullQuote>

        <div className={proseBody}>
          <p>
            AWS S3 charges $23 per terabyte per month. That&apos;s $276 per year for a terabyte of
            storage. A 4TB hard drive costs $80 on Amazon, the same Amazon. You could buy the
            physical hardware to store your data four times over for what they charge you in a
            single year to store it on their servers.
          </p>
          <p>
            The markup isn&apos;t 100%. It isn&apos;t 500%. The markup on cloud storage is measured
            in thousands of percent, and the entire industry has collectively agreed to pretend this
            is normal.
          </p>
        </div>
      </ProseSection>

      <ProseSection
        id="phi-loophole"
        eyebrow="The loophole"
        title="Git storage, the loophole nobody talks about"
      >
        <div className={proseBody}>
          <p>
            GitLab gives you 10GB per repo. For free. Hugging Face gives you 100GB per account.
            GitHub doesn&apos;t even publish a hard cap: just stay under a few gigabytes and nobody
            blinks. These aren&apos;t hidden terms buried in legalese, they&apos;re published limits
            (and unwritten norms) that platform teams actively maintain and support.
          </p>
          <p>
            This isn&apos;t a bug. This is a feature. These platforms need generous storage to host
            large repositories, ML models, and binary assets. They built the infrastructure. They
            set the limits. We just use them as intended, for storing data.
          </p>
        </div>

        <PullQuote>
          Every terabyte we store for free is a terabyte AWS can&apos;t bill for.
        </PullQuote>

        <div className={proseBody}>
          <p>
            zcrypt takes your files, compresses them with Zstd, encrypts them with AES-256-GCM,
            splits them into manageable chunks, and stores them as ordinary-looking data in
            repositories on the platform you connect. To the platform, they look like build
            artifacts. To you, they&apos;re your encrypted files, accessible from anywhere, costing
            nothing.
          </p>
          <p>
            <strong className="text-[var(--color-text)]">Is this safe and durable?</strong> Yes.
            Your data is stored as standard private repository content, exactly the kind of large
            binary data these platforms are built to host. zcrypt automatically spreads data across
            repositories and rotates to fresh ones as they fill up, so you stay well within each
            platform&apos;s normal limits. And your files are always retrievable: encrypted chunks
            are integrity-checked and reassembled when you download.
          </p>
        </div>
      </ProseSection>

      <ProseSection
        id="phi-zero-knowledge"
        eyebrow="The maths"
        title="Zero-knowledge is not a marketing buzzword"
      >
        <div className={proseBody}>
          <p>
            When Dropbox says &ldquo;we take security seriously,&rdquo; what they mean is they
            encrypt your files with keys they control. They can read your files. Their employees can
            read your files. They scan your files to build search indices. Government subpoenas?
            They hand over your data because they can.
          </p>
          <p>
            When we say &ldquo;zero-knowledge,&rdquo; we mean the mathematical kind. Your passphrase
            never leaves your device. We derive encryption keys locally using PBKDF2 with 600,000
            iterations. The encrypted data that gets uploaded is indistinguishable from random
            noise.
          </p>
        </div>

        <PullQuote>
          We can&apos;t read your files. Not because we&apos;re polite. Because we literally
          don&apos;t have the keys.
        </PullQuote>

        <div className={proseBody}>
          <p>
            AES-256-GCM provides authenticated encryption, meaning tampering with the ciphertext is
            detectable. The GCM mode gives you both confidentiality and integrity in a single pass.
            No separate HMAC step. No room for implementation mistakes.
          </p>
          <p>
            This isn&apos;t security theater. This is the same encryption standard used by
            intelligence agencies. The difference is we give it to you for free, not for
            $23/TB/month.
          </p>
        </div>
      </ProseSection>

      <ProseSection
        id="phi-open-source"
        eyebrow="The receipts"
        title="Open source, because talk is cheap"
      >
        <div className={proseBody}>
          <p>
            Every cloud provider asks you to trust them. Trust their encryption. Trust their access
            controls. Trust that the engineer with admin access won&apos;t peek at your vacation
            photos.
          </p>
          <p>We don&apos;t ask you to trust us. We ask you to read the code.</p>
          <p>
            Every line of zcrypt is open source. The encryption implementation. The chunking
            algorithm. The upload pipeline. The key derivation. If there&apos;s a vulnerability,
            you&apos;ll find it before we do, because you have the same access to the source that we
            do.
          </p>
        </div>

        <PullQuote>The best security audit is 10,000 strangers reading your code.</PullQuote>
      </ProseSection>

      <ProseSection id="phi-endgame" eyebrow="The endgame" title="Storage that costs nothing">
        <div className={proseBody}>
          <p>A world where personal file storage costs $0 and your data belongs to you.</p>
          <p>Revolutionary? No. Obvious? Yes. Done? Finally.</p>
          <p>
            The technology for free, encrypted, distributed storage has existed for years. Git
            hosting has been free for over a decade. AES-256 has been an open standard since 2001.
            Zstd compression has been open source since 2016. All zcrypt does is connect the dots
            that the industry had every incentive to leave disconnected.
          </p>
          <p>Because every dot connected is a revenue stream severed.</p>
        </div>

        <PullQuote>They had every incentive to never build this. So we did.</PullQuote>
      </ProseSection>

      <ProseSection id="phi-who" eyebrow="The author" title="The “we” is mostly one guy">
        <div className={proseBody}>
          <p>
            Honestly? Mostly one guy. I&apos;m {WOSMO.name}, a {WOSMO.role.toLowerCase()} who wanted
            a lot of free storage, couldn&apos;t find any that wouldn&apos;t read his files, and got
            annoyed enough to build the alternative instead of just posting about it. zcrypt is mine
            end to end: the encryption, the upload pipeline, the drive, and this exact page
            you&apos;re reading.
          </p>
          <p>
            I say &ldquo;we&rdquo; out of habit, not to hide behind a logo, and here of all places,
            that matters. A tool that asks you to trust it with your keys should tell you exactly
            who wrote the code that holds them. No anonymous founder. No shell company. Just my
            name, on the record, right here.
          </p>
        </div>

        <Link
          href="/about"
          className={`${cardSurface} pv2-card-link group mt-8 flex items-center justify-between gap-4 p-5 sm:p-6`}
        >
          <div className="min-w-0">
            <WosmoWordmark className="h-6 w-auto text-[var(--color-text)]" />
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              {WOSMO.name}, the one-person company behind zcrypt.
            </p>
          </div>
          <span className="inline-flex flex-shrink-0 items-center gap-1 text-sm font-semibold text-[var(--pv2-accent-ink)]">
            Read the story
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
        </Link>
      </ProseSection>
    </ReadingPage>
  );
}
