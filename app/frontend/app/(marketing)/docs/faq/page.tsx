import type { Metadata } from "next";
import Link from "next/link";
import {
  DocPage,
  DocSection,
  DocP,
  DocNote,
} from "@/components/docs/doc-page";

export const metadata: Metadata = {
  title: "FAQ | zcrypt Docs",
  description:
    "Common questions about zcrypt: what it costs, how much storage you get, how the AES-256-GCM zero-knowledge encryption works, multi-device access, real folders, previewing files, password-protected folders, and what happens if you forget your passphrase.",
  alternates: { canonical: "https://zcrypt.cloud/docs/faq" },
  openGraph: {
    title: "FAQ | zcrypt Docs",
    description:
      "Cost, storage, encryption, multi-device, folders, previews, and passphrase recovery — answered plainly.",
    url: "https://zcrypt.cloud/docs/faq",
  },
};

const toc = [
  { id: "cost", title: "What does it cost?" },
  { id: "storage", title: "How much storage?" },
  { id: "encryption", title: "How secure is the encryption?" },
  { id: "devices", title: "Multiple devices?" },
  { id: "folders", title: "Real folders?" },
  { id: "preview", title: "Preview without downloading?" },
  { id: "folder-password", title: "Password-protect a folder?" },
  { id: "forgot", title: "Forgot my passphrase?" },
];

export default function FaqDocPage() {
  return (
    <DocPage
      href="/docs/faq"
      title="FAQ"
      description="Short, honest answers to the questions people ask most about zcrypt."
      toc={toc}
    >
      <DocSection id="cost" title="How much does zcrypt cost?">
        <DocP>
          zcrypt is free and open source. There are no paid plans and none are
          planned. You connect your own storage account, so your available space
          is bounded only by that platform's free space — not by us. Every line of
          code is public, so you can verify what it does rather than take our word
          for it.
        </DocP>
      </DocSection>

      <DocSection id="storage" title="How much storage do I get?">
        <DocP>
          You bring your own storage (BYOB). Connect a GitHub, GitLab, Hugging
          Face, or Telegram account and your capacity is whatever free space that
          platform gives you. zcrypt handles the compression, encryption, and
          chunking on top of it, and rotates across repositories as they fill, so
          you keep growing without hitting an artificial cap.
        </DocP>
      </DocSection>

      <DocSection id="encryption" title="How secure is the encryption?">
        <DocP>
          Files are sealed with AES-256-GCM, an authenticated encryption standard,
          before they leave your device. The key is derived locally from your
          passphrase and is never transmitted. This zero-knowledge design means
          even we cannot read your files — and neither can your storage platform,
          which only ever receives encrypted chunks.
        </DocP>
      </DocSection>

      <DocSection id="devices" title="Can I access my files across multiple devices?">
        <DocP>
          Yes. Sign in to zcrypt from any modern browser or the terminal app
          (TUI), enter your passphrase, and your encrypted files are there.
          Everything is decrypted locally on whichever device you're using — the
          plaintext is never reconstructed on our servers.
        </DocP>
      </DocSection>

      <DocSection id="folders" title="Does zcrypt have real folders, or just a flat list?">
        <DocP>
          Real folders. zcrypt is a full encrypted drive: create and nest folders,
          drag files to organize them, search, sort, and switch between grid and
          list views. Folder names are encrypted too, so even your structure stays
          private. See{" "}
          <Link href="/docs/folders" className="text-cyan-600 hover:underline dark:text-cyan-400">
            Folders &amp; the file explorer
          </Link>
          .
        </DocP>
      </DocSection>

      <DocSection id="preview" title="Can I preview files without downloading them?">
        <DocP>
          Yes. zcrypt previews images, video, audio, PDFs, documents (DOCX),
          Markdown, CSVs, and source code directly in the browser. Each file is
          decrypted on the fly on your device — the plaintext never touches our
          servers. See{" "}
          <Link href="/docs/viewing-files" className="text-cyan-600 hover:underline dark:text-cyan-400">
            Viewing &amp; previewing files
          </Link>
          .
        </DocP>
      </DocSection>

      <DocSection id="folder-password" title="Can I password-protect a single folder?">
        <DocP>
          Yes. Any folder can have its own password, separate from your account
          passphrase. The files inside are re-encrypted under that folder's key, so
          even with your vault unlocked, a protected folder stays sealed until you
          enter its password. See{" "}
          <Link href="/docs/folder-encryption" className="text-cyan-600 hover:underline dark:text-cyan-400">
            Per-folder encryption
          </Link>
          .
        </DocP>
      </DocSection>

      <DocSection id="forgot" title="What happens if I forget my passphrase?">
        <DocP>
          Because zcrypt is strictly zero-knowledge, your passphrase is never
          stored on our servers and key derivation is one-way. If you lose it, your
          encrypted files cannot be recovered — by us or anyone else. There is no
          reset link for the passphrase itself, by design.
        </DocP>
        <DocNote type="warning" title="Back up your passphrase">
          Store your passphrase in a password manager. It is the one secret that
          unlocks everything, and the one thing we genuinely cannot help you
          recover.
        </DocNote>
      </DocSection>
    </DocPage>
  );
}
