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
  title: "Web app | zcrypt Docs",
  description:
    "zcrypt runs in any modern browser. How the vault lock works (one passphrase per session), the optional 'keep me unlocked on this device' that stores your passphrase encrypted in IndexedDB under a non-extractable key, and background notifications for uploads and downloads.",
  alternates: { canonical: "https://zcrypt.cloud/docs/web-app" },
  openGraph: {
    title: "Web app | zcrypt Docs",
    description:
      "The zcrypt web app: the session vault lock, an encrypted-at-rest 'keep me unlocked on this device' option, and background transfer notifications — all in your browser.",
    url: "https://zcrypt.cloud/docs/web-app",
  },
};

const toc = [
  { id: "browser", title: "Runs in your browser" },
  { id: "vault-lock", title: "The vault lock" },
  { id: "remember", title: "Keep me unlocked on this device" },
  { id: "notifications", title: "Background notifications" },
  { id: "next", title: "Where to go next" },
];

export default function WebAppDocPage() {
  return (
    <DocPage
      href="/docs/web-app"
      title="Web app"
      description="The zcrypt web app is the full product in a browser tab: a real encrypted drive with client-side encryption, a single session lock, and an optional way to stay unlocked on a device you trust."
      toc={toc}
    >
      <DocSection id="browser" title="Runs in your browser">
        <DocP>
          zcrypt works in any modern browser on desktop or mobile — there is
          nothing to install. All encryption and decryption happen on your device
          using the Web Crypto API, so your files are sealed and opened locally
          and the server only ever handles ciphertext.
        </DocP>
      </DocSection>

      <DocSection id="vault-lock" title="The vault lock">
        <DocP>
          zcrypt uses <strong>one passphrase to unlock everything for a
          session</strong>. Rather than prompting you per file or per action,
          the app shows a single lock indicator — a small pill in the interface
          — and a single unlock modal. Enter your vault passphrase once and the
          whole vault opens for that session.
        </DocP>
        <DocList
          items={[
            <>
              <strong>Locked</strong> — folder names show as placeholders and
              nothing can be decrypted. The pill invites you to unlock.
            </>,
            <>
              <strong>Unlocked</strong> — your passphrase is held in memory for
              the session so previews, downloads, and search work without
              re-prompting.
            </>,
            <>
              By default a session unlock lasts <strong>15 minutes</strong> of
              activity and then auto-locks, dropping the passphrase and any
              decrypted data from memory.
            </>,
          ]}
        />
        <DocNote type="info">
          Folders you protect with their own password are the one exception: they
          ask for that folder&apos;s password the first time you open them in a
          session. See{" "}
          <Link href="/docs/folder-encryption" className="text-cyan-600 hover:underline dark:text-cyan-400">
            per-folder encryption
          </Link>
          .
        </DocNote>
      </DocSection>

      <DocSection id="remember" title="Keep me unlocked on this device">
        <DocP>
          On a device that&apos;s yours, you can opt in to{" "}
          <strong>keep me unlocked on this device</strong> so a page reload
          doesn&apos;t make you re-enter your passphrase. This is convenience
          with real engineering behind it — not a plaintext shortcut.
        </DocP>
        <DocList
          items={[
            <>
              Your passphrase is <strong>encrypted at rest</strong> and stored in{" "}
              <strong>IndexedDB</strong>, never in <code>localStorage</code> and
              never as plaintext.
            </>,
            <>
              It&apos;s encrypted with an AES-GCM key that is{" "}
              <strong>non-extractable</strong>: the browser can use the key to
              decrypt but its raw bytes can never be read back out, even by zcrypt&apos;s
              own code.
            </>,
            <>
              The passphrase <strong>never leaves your device</strong> and is
              never sent to the server — turning this on changes nothing about
              what the server can see.
            </>,
            <>
              Locking the vault, or switching the option off, wipes the on-device
              copy so a later reload stays locked.
            </>,
          ]}
        />
        <DocNote type="security" title="The honest trade-off">
          Staying unlocked on a device is strictly your opt-in choice. The
          non-extractable key makes it far safer than a stored plaintext string,
          but it is not a defense against malware or a hostile script already
          running in your browser — such code could ask the key to decrypt. Leave
          it off on shared or untrusted machines.
        </DocNote>
      </DocSection>

      <DocSection id="notifications" title="Background notifications">
        <DocP>
          Uploads and downloads keep running while you work in other tabs. With
          your permission, zcrypt can post a browser notification when a transfer
          finishes, so you don&apos;t have to babysit a long job. Notifications
          are shown only while the zcrypt tab is in the background — when
          it&apos;s focused, the in-app progress UI is enough — and they request
          permission only when there&apos;s something worth telling you.
        </DocP>
        <DocNote type="info">
          Notifications are entirely local to your browser and purely
          informational. Denying the permission has no effect on transfers; you
          just won&apos;t get the desktop pop-up.
        </DocNote>
      </DocSection>

      <DocSection id="next" title="Where to go next">
        <DocList
          items={[
            <Link key="a" href="/docs/desktop-app" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Desktop app — the native build for macOS, Windows, and Linux
            </Link>,
            <Link key="b" href="/docs/folders" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Folders & the file explorer — organize your encrypted drive
            </Link>,
            <Link key="c" href="/docs/key-management" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Key management — what the passphrase unlocks and why
            </Link>,
            <Link key="d" href="/features/apps" className="text-cyan-600 hover:underline dark:text-cyan-400">
              zcrypt everywhere — the same vault across web, desktop, and terminal
            </Link>,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
