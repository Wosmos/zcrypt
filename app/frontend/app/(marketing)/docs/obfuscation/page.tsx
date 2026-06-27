import type { Metadata } from "next";
import Link from "next/link";
import {
  DocPage,
  DocSection,
  DocP,
  DocList,
  DocCode,
  DocNote,
} from "@/components/docs/doc-page";

export const metadata: Metadata = {
  title: "Storage obfuscation | zcrypt Docs",
  description:
    "Encryption hides file contents; obfuscation hides that there is anything interesting to look at. zcrypt stores chunks under random hex .bin names in repos with plausible dev-project names, rotating commit messages, and a generic build-artifacts README.",
  alternates: { canonical: "https://zcrypt.cloud/docs/obfuscation" },
  openGraph: {
    title: "Storage obfuscation | zcrypt Docs",
    description:
      "How zcrypt makes its storage repositories look like unremarkable build-cache projects — a second layer beneath the encryption.",
    url: "https://zcrypt.cloud/docs/obfuscation",
  },
};

const toc = [
  { id: "why", title: "Why obfuscate at all" },
  { id: "filenames", title: "Chunk filenames" },
  { id: "repos", title: "Repository disguise" },
  { id: "scope", title: "Storage access & scope" },
  { id: "limits", title: "What it does and doesn't do" },
  { id: "next", title: "Where to go next" },
];

export default function ObfuscationPage() {
  return (
    <DocPage
      href="/docs/obfuscation"
      title="Storage obfuscation"
      description="Strong encryption already protects your file contents. Obfuscation is the layer on top that keeps your storage from advertising itself — so the repositories holding your data read as ordinary developer projects."
      toc={toc}
    >
      <DocSection id="why" title="Why obfuscate at all">
        <DocP>
          Encryption answers &ldquo;can someone read this?&rdquo; with a firm no.
          Obfuscation answers a different question — &ldquo;does this look worth
          attacking?&rdquo; Your encrypted chunks live in repositories on
          general-purpose platforms like GitHub and GitLab. If those repos were
          obviously a stash of encrypted secrets, they would draw attention even
          though the contents are unreadable. So zcrypt makes them look mundane.
        </DocP>
        <DocNote type="info" title="A second layer, not a replacement">
          This is defense in depth. The confidentiality guarantee comes entirely
          from{" "}
          <Link href="/docs/security" className="text-cyan-600 hover:underline dark:text-cyan-400">
            encryption
          </Link>
          ; obfuscation just reduces the signal that there is anything to encrypt
          in the first place.
        </DocNote>
      </DocSection>

      <DocSection id="filenames" title="Chunk filenames">
        <DocP>
          Each encrypted chunk is stored under a random hex filename with a{" "}
          <span className="font-mono">.bin</span> extension — the kind of name a
          build tool or cache would produce. There is no sequence number, no
          original name, and no extension that hints at the underlying file type.
        </DocP>
        <DocCode label="example stored chunk names">{`a3f9c1e8b2740d56.bin
7d10e4ab9c3f8821.bin
0b5e2f7a16c94d3e.bin`}</DocCode>
        <DocP>
          Because names are random rather than ordered, the storage layout
          doesn&apos;t reveal how many files you have, how they relate, or which
          chunks belong together — that mapping lives only in your encrypted
          index.
        </DocP>
      </DocSection>

      <DocSection id="repos" title="Repository disguise">
        <DocP>
          The repositories themselves are dressed to look like routine internal
          tooling rather than a storage vault:
        </DocP>
        <DocList
          items={[
            <>
              <strong>Plausible project names</strong> assembled from
              developer-flavored words — things like{" "}
              <span className="font-mono">core-engine-v3</span> or{" "}
              <span className="font-mono">shared-cache-v1</span>.
            </>,
            <>
              <strong>Rotating commit messages</strong> in conventional-commit
              style, such as{" "}
              <span className="font-mono">chore: update cache artifacts</span> or{" "}
              <span className="font-mono">chore: refresh build cache</span>.
            </>,
            <>
              <strong>A generic README</strong> describing the repo as
              auto-managed build artifacts and cache storage, so a casual glance
              finds nothing of note.
            </>,
          ]}
        />
        <DocNote type="security" title="Stored as private repositories">
          These repositories are created as <strong>private</strong> — the
          disguise is what they look like to anyone who does gain access, not an
          invitation for the public to browse them.
        </DocNote>
      </DocSection>

      <DocSection id="scope" title="Storage access & scope">
        <DocP>
          For zcrypt to create and write these private repositories on your
          behalf, the storage token you connect needs the permission to do
          exactly that. We will be straight about it rather than calling it
          &ldquo;minimal.&rdquo;
        </DocP>
        <DocList
          items={[
            <>
              Connecting <strong>GitHub</strong> requires a token that can create
              and write to <strong>private repositories</strong> — a classic{" "}
              <span className="font-mono">repo</span> scope grants full control of
              private repos. That is the access level needed to manage your
              storage, not a read-only sliver.
            </>,
            <>
              The same principle applies to the other backends: the token must be
              able to create and write the repositories or channels that hold your
              chunks.
            </>,
            <>
              Whatever the scope, the token only ever lets zcrypt move{" "}
              <em>ciphertext</em> in and out. It confers no ability to read your
              files.
            </>,
          ]}
        />
        <DocP>
          Those tokens are encrypted at rest under a server-derived key, which is
          the one non-zero-knowledge surface in the system — detailed in{" "}
          <Link href="/docs/zero-knowledge" className="text-cyan-600 hover:underline dark:text-cyan-400">
            zero-knowledge architecture
          </Link>.
        </DocP>
      </DocSection>

      <DocSection id="limits" title="What it does and doesn't do">
        <DocList
          items={[
            <>
              <strong>It does</strong> make storage repos blend in, strip
              identifying detail from filenames, and keep file relationships out
              of the storage layout.
            </>,
            <>
              <strong>It does not</strong> hide that an account exists on the
              storage platform, nor the aggregate size of what is stored — a
              determined platform operator can see byte totals.
            </>,
            <>
              <strong>It is not</strong> the thing keeping your data
              confidential. If obfuscation were stripped away entirely, your files
              would remain unreadable, because they are encrypted.
            </>,
          ]}
        />
        <DocNote type="warning" title="Don't rely on it as secrecy">
          Treat obfuscation as reducing attention, not as a confidentiality
          control. The security argument always rests on the encryption; the
          disguise is there to keep the encrypted store from standing out.
        </DocNote>
      </DocSection>

      <DocSection id="next" title="Where to go next">
        <DocList
          items={[
            <Link key="a" href="/docs/zero-knowledge" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Zero-knowledge architecture — what the server stores, including tokens
            </Link>,
            <Link key="b" href="/docs/threat-model" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Threat model — where metadata defenses sit among the risks
            </Link>,
            <Link key="c" href="/docs/security" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Encryption model — the confidentiality guarantee underneath
            </Link>,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
