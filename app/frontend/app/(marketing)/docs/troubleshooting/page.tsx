import type { Metadata } from "next";
import Link from "next/link";
import {
  DocPage,
  DocSection,
  DocP,
  DocList,
  DocNote,
} from "@/components/docs/doc-page";

export const metadata: Metadata = {
  title: "Troubleshooting | zcrypt Docs",
  description:
    "Fixes for common zcrypt issues: a wrong passphrase or stuck unlock, a protected folder that won't open, a stalled but resumable upload, a file too large for a platform, a disconnected or expired storage token, and rate limiting.",
  alternates: { canonical: "https://zcrypt.cloud/docs/troubleshooting" },
  openGraph: {
    title: "Troubleshooting | zcrypt Docs",
    description:
      "Quick fixes for stuck unlocks, protected folders, stalled uploads, oversized files, disconnected tokens, and rate limits.",
    url: "https://zcrypt.cloud/docs/troubleshooting",
  },
};

const toc = [
  { id: "wrong-passphrase", title: "Wrong passphrase / stuck unlock" },
  { id: "protected-folder", title: "A protected folder won't open" },
  { id: "upload-stalled", title: "An upload stalled" },
  { id: "too-large", title: "File too large for a platform" },
  { id: "disconnected", title: "Platform disconnected or token expired" },
  { id: "rate-limited", title: "Rate limited" },
];

export default function TroubleshootingDocPage() {
  return (
    <DocPage
      href="/docs/troubleshooting"
      title="Troubleshooting"
      description="The handful of issues people hit most, and how to clear them. Most have a simple cause — the wrong key, a transient network hiccup, or a platform limit doing its job."
      toc={toc}
    >
      <DocSection id="wrong-passphrase" title="Wrong passphrase / stuck unlock">
        <DocP>
          If decryption keeps failing or you land in a unlock/Retry loop, the most
          likely cause is a passphrase that doesn't match the one a file was
          encrypted with — a typo, a different keyboard layout, or an old
          passphrase. zcrypt can't tell you the passphrase is wrong before it tries
          to decrypt, because there's nothing readable on the server to check it
          against.
        </DocP>
        <DocList
          items={[
            "Re-enter the passphrase carefully — watch for caps lock and trailing spaces.",
            "Lock the vault and unlock again to clear any cached attempt, then retry.",
            "If you have multiple accounts, confirm you're signed into the right one.",
          ]}
        />
        <DocNote type="warning" title="If it's genuinely lost">
          A passphrase is never stored and cannot be reset. If it's truly gone, the
          affected files cannot be recovered. See{" "}
          <Link href="/docs/recovery" className="text-cyan-600 hover:underline dark:text-cyan-400">
            Account recovery
          </Link>
          .
        </DocNote>
      </DocSection>

      <DocSection id="protected-folder" title="A protected folder won't open">
        <DocP>
          A password-protected folder is sealed under its own key, separate from
          your account passphrase. Having the vault unlocked is not enough — the
          folder stays locked until you enter its specific password.
        </DocP>
        <DocList
          items={[
            "Open the folder and enter the folder password (not your account passphrase) when prompted.",
            "Remember that each protected folder can have a different password — use the one set for that folder.",
            "If you removed the password earlier, the folder's files were re-keyed back to your account passphrase; unlock the vault normally.",
          ]}
        />
        <DocP>
          More detail in{" "}
          <Link href="/docs/folder-encryption" className="text-cyan-600 hover:underline dark:text-cyan-400">
            Per-folder encryption
          </Link>
          .
        </DocP>
      </DocSection>

      <DocSection id="upload-stalled" title="An upload stalled">
        <DocP>
          Uploads are chunked and resumable, so a stall is rarely fatal. If
          progress stops — a dropped connection, a closed tab, a sleeping laptop —
          the chunks already received are kept server-side, and the transfer can
          pick up where it left off.
        </DocP>
        <DocList
          items={[
            "Retry or resume the transfer from the transfer manager — only the missing chunks are re-sent.",
            "Check your network connection; large files over flaky links may pause and resume several times.",
            "Leave the tab open while a big upload finishes, or use the desktop or terminal app for long transfers.",
          ]}
        />
        <DocP>
          See{" "}
          <Link href="/docs/transfer-manager" className="text-cyan-600 hover:underline dark:text-cyan-400">
            Transfer manager
          </Link>{" "}
          for pause, resume, and retry controls.
        </DocP>
      </DocSection>

      <DocSection id="too-large" title="File too large for a platform">
        <DocP>
          Each storage platform has its own size ceiling per repository, and zcrypt
          stores a given file's chunks on a single platform. A very large file can
          exceed what a platform comfortably holds. zcrypt rotates to a fresh
          repository automatically as repos fill, but the per-platform headroom
          still varies a lot between backends.
        </DocP>
        <DocList
          items={[
            "For large files, connect Hugging Face — it offers by far the most room per repository.",
            "Confirm the target platform actually has free space; rotation creates new repos but can't exceed your account's quota.",
            "Splitting a huge archive into smaller files can also help spread it across the pool.",
          ]}
        />
        <DocP>
          How rotation works:{" "}
          <Link href="/docs/repo-pool" className="text-cyan-600 hover:underline dark:text-cyan-400">
            Repo pool &amp; rotation
          </Link>
          .
        </DocP>
      </DocSection>

      <DocSection id="disconnected" title="Platform disconnected or token expired">
        <DocP>
          If uploads or downloads start failing for a whole platform, its access
          token may have been revoked, expired, or had its scopes changed on the
          provider's side. zcrypt can't push or pull chunks without a valid token.
        </DocP>
        <DocList
          items={[
            "Open Settings and check the platform's connection status.",
            "Reconnect the platform with a fresh token that has the required scopes.",
            "If you rotated the token on the provider (GitHub, GitLab, and so on), update it in zcrypt to match.",
          ]}
        />
        <DocP>
          Token setup is covered in{" "}
          <Link href="/docs/platform-adapters" className="text-cyan-600 hover:underline dark:text-cyan-400">
            Bring your own storage
          </Link>
          .
        </DocP>
      </DocSection>

      <DocSection id="rate-limited" title="Rate limited">
        <DocP>
          The API limits how many requests an IP can make in a short window to keep
          the service healthy and to blunt brute-force attempts. Auth and public
          share/send links are limited more tightly. A burst of activity — or
          retrying too aggressively after a failure — can trip these limits.
        </DocP>
        <DocList
          items={[
            "Wait a short while, then retry — limits reset on a rolling window.",
            "Avoid hammering retries in a tight loop; space them out.",
            "On your own self-hosted instance behind a proxy, make sure the trusted-proxy setting is correct so legitimate traffic isn't grouped under one IP.",
          ]}
        />
        <DocNote type="info" title="Storage platforms rate-limit too">
          Some failures originate with the storage provider, not zcrypt. If a
          single platform is throttling you, give it time and the sync worker will
          retry the affected chunks.
        </DocNote>
      </DocSection>
    </DocPage>
  );
}
