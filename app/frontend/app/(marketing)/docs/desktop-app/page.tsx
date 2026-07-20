import type { Metadata } from "next";
import Link from "next/link";
import {
  DocPage,
  DocSection,
  DocP,
  DocList,
  DocNote,
} from "@/components/docs/doc-page";
import { desktopEngine } from "@/lib/data";

export const metadata: Metadata = {
  title: "Desktop app | zcrypt Docs",
  description:
    "The native zcrypt desktop build for macOS, Windows, and Linux, built with Tauri. A native file picker, OAuth sign-in through your system browser, and the same zero-knowledge encryption as the web app.",
  alternates: { canonical: "https://zcrypt.cloud/docs/desktop-app" },
  openGraph: {
    title: "Desktop app | zcrypt Docs",
    description:
      "A native desktop build of zcrypt (Tauri) for macOS, Windows, and Linux — native file picker, system-browser OAuth, same zero-knowledge core.",
    url: "https://zcrypt.cloud/docs/desktop-app",
  },
};

const toc = [
  { id: "what", title: "What it is" },
  { id: "native", title: "Native conveniences" },
  { id: "same-core", title: "Same zero-knowledge core" },
  { id: "download", title: "Getting it" },
  { id: "next", title: "Where to go next" },
];

export default function DesktopAppDocPage() {
  return (
    <DocPage
      href="/docs/desktop-app"
      title="Desktop app"
      description="A native desktop build of zcrypt for people who'd rather have a real app window than a browser tab — with OS-level file handling and the exact same client-side encryption."
      toc={toc}
    >
      <DocSection id="what" title="What it is">
        <DocP>
          The zcrypt desktop app is a native build for{" "}
          <strong>macOS, Windows, and Linux</strong>, packaged with{" "}
          <strong>Tauri</strong>. Tauri renders the same zcrypt interface in a
          lightweight native shell using your operating system&apos;s own webview,
          so you get a proper application window and OS integration without a
          heavy bundled browser.
        </DocP>
        <DocP>
          Underneath that shell, encryption, compression, chunking, and
          storage sync run in <strong>{desktopEngine.name}</strong>, an
          in-process {desktopEngine.language} engine — not a browser sandbox
          and not a background subprocess. It replaces what used to be{" "}
          {desktopEngine.replaces}: {desktopEngine.why} The same engine backs
          the Android app, so a file encrypted on desktop opens cleanly there
          too.
        </DocP>
      </DocSection>

      <DocSection id="native" title="Native conveniences">
        <DocP>
          Running natively unlocks a few things a browser tab can&apos;t do as
          cleanly:
        </DocP>
        <DocList
          items={[
            <>
              <strong>Native file picker</strong> — choose files and folders to
              upload through your operating system&apos;s own dialog.
            </>,
            <>
              <strong>OAuth via your system browser</strong> — signing in with
              Google or GitHub opens your default browser rather than an embedded
              webview, so you authenticate in a trusted, familiar environment and
              the app receives your tokens through a one-time, single-use
              hand-off. See{" "}
              <Link href="/docs/oauth" className="text-cyan-600 hover:underline dark:text-cyan-400">
                Sign in with Google or GitHub
              </Link>
              .
            </>,
            <>
              A dedicated app window that lives in your dock or taskbar, separate
              from your browsing.
            </>,
          ]}
        />
      </DocSection>

      <DocSection id="same-core" title="Same zero-knowledge core">
        <DocP>
          The desktop app is the same zcrypt, not a stripped-down sibling.
          Encryption and decryption still happen entirely on your device, your
          vault passphrase is still never sent to the server, and the session
          vault lock behaves just as it does on the web. Anything you learn about
          how zcrypt protects your data applies here unchanged.
        </DocP>
        <DocP>
          One thing does differ: {desktopEngine.dataPlane}
        </DocP>
        <DocNote type="security">
          Because the cryptography is identical to the web app, the recovery
          rules are too: lose your vault passphrase and your files cannot be
          decrypted on any platform. Keep it in a password manager — see{" "}
          <Link href="/docs/recovery" className="text-cyan-600 hover:underline dark:text-cyan-400">
            Account recovery
          </Link>
          .
        </DocNote>
      </DocSection>

      <DocSection id="download" title="Getting it">
        <DocP>
          Desktop builds are published on the project&apos;s GitHub releases
          page. Grab the asset that matches your platform from there:
        </DocP>
        <DocList
          items={[
            <>
              <a
                href="https://github.com/Wosmos/zcrypt/releases"
                className="text-cyan-600 hover:underline dark:text-cyan-400"
                target="_blank"
                rel="noreferrer"
              >
                github.com/Wosmos/zcrypt/releases
              </a>{" "}
              — pick the latest release and download the build for macOS, Windows,
              or Linux.
            </>,
          ]}
        />
        <DocNote type="info">
          The desktop app is young and ships from GitHub releases, so available
          installers and platforms can vary between versions. If you don&apos;t
          see a build for your OS yet, the{" "}
          <Link href="/docs/web-app" className="text-cyan-600 hover:underline dark:text-cyan-400">
            web app
          </Link>{" "}
          gives you the full product in the meantime.
        </DocNote>
      </DocSection>

      <DocSection id="next" title="Where to go next">
        <DocList
          items={[
            <Link key="a" href="/docs/web-app" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Web app — the same product in any modern browser
            </Link>,
            <Link key="b" href="/tui" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Terminal app (TUI) — manage your vault from the command line
            </Link>,
            <Link key="d" href="/download#android" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Android app — the same engine, sideloaded on your phone
            </Link>,
            <Link key="c" href="/docs/oauth" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Sign in with Google or GitHub — including the desktop sign-in flow
            </Link>,
            <Link key="e" href="/features/apps" className="text-cyan-600 hover:underline dark:text-cyan-400">
              zcrypt everywhere — the same vault across web, desktop, and terminal
            </Link>,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
