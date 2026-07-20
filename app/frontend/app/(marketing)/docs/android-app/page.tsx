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
  title: "Android app | zcrypt Docs",
  description:
    "The zcrypt Android app is a beta sideload APK built on the same in-process zcrypt-core Rust engine as the desktop app. How to install it, what beta means today, and why the encryption is identical to every other platform.",
  alternates: { canonical: "https://zcrypt.cloud/docs/android-app" },
  openGraph: {
    title: "Android app | zcrypt Docs",
    description:
      "zcrypt for Android (beta): a sideloaded APK on the same zcrypt-core Rust engine as desktop, with the same zero-knowledge encryption.",
    url: "https://zcrypt.cloud/docs/android-app",
  },
};

const toc = [
  { id: "what", title: "What it is" },
  { id: "install", title: "Installing the APK" },
  { id: "beta", title: "What beta means" },
  { id: "same-core", title: "Same zero-knowledge core" },
  { id: "next", title: "Where to go next" },
];

export default function AndroidAppDocPage() {
  return (
    <DocPage
      href="/docs/android-app"
      title="Android app"
      description="zcrypt on your phone: a beta Android build on the same in-process encryption engine as the desktop app, installed by sideloading an APK rather than through the Play Store."
      toc={toc}
    >
      <DocSection id="what" title="What it is">
        <DocP>
          The zcrypt Android app is a <strong>beta</strong> build that runs the
          same zcrypt interface on your phone. Under the shell, encryption,
          compression, chunking, and storage sync run in{" "}
          <strong>{desktopEngine.name}</strong>, the same in-process{" "}
          {desktopEngine.language} engine that powers the desktop app — not a
          browser sandbox and not a background subprocess. Because the engine is
          the same, a file encrypted on desktop opens cleanly on Android, and
          vice versa.
        </DocP>
        <DocP>
          It is <strong>not on the Play Store</strong>. You install it by
          sideloading an APK directly, which takes about a minute.
        </DocP>
      </DocSection>

      <DocSection id="install" title="Installing the APK">
        <DocP>
          The APK is published alongside the other zcrypt builds. Grab it from
          the download page and install it yourself:
        </DocP>
        <DocList
          items={[
            <>
              Open{" "}
              <Link href="/download#android" className="text-cyan-600 hover:underline dark:text-cyan-400">
                the Android section of the download page
              </Link>{" "}
              on your phone and download the APK.
            </>,
            <>
              When Android asks, allow installing from this source — sideloading
              an app from outside the Play Store needs that one-time permission.
            </>,
            <>
              Open the downloaded APK to install, then launch zcrypt and sign in
              as you would anywhere else.
            </>,
          ]}
        />
        <DocNote type="info">
          Because it is sideloaded, the app does not auto-update through the Play
          Store. To move to a newer build, download and install the latest APK
          again from the same place.
        </DocNote>
      </DocSection>

      <DocSection id="beta" title="What beta means">
        <DocP>
          The Android app is genuinely early, and we would rather say so than
          oversell it. The encrypted drive works — sign in, upload, browse, and
          download — but the app is younger than the web and desktop builds, so
          expect rough edges and fewer conveniences for now. Offline access and
          camera backup are on the roadmap, not shipped.
        </DocP>
        <DocNote type="info">
          If a build for your phone gives you trouble, the{" "}
          <Link href="/docs/web-app" className="text-cyan-600 hover:underline dark:text-cyan-400">
            web app
          </Link>{" "}
          runs the full product in your mobile browser in the meantime.
        </DocNote>
      </DocSection>

      <DocSection id="same-core" title="Same zero-knowledge core">
        <DocP>
          The Android app is the same zcrypt, not a stripped-down sibling.
          Encryption and decryption happen entirely on your device, your vault
          passphrase is still never sent to the server, and everything you learn
          about how zcrypt protects your data applies here unchanged.
        </DocP>
        <DocP>
          Like the desktop app, Android uploads directly to your own storage:{" "}
          {desktopEngine.dataPlane}
        </DocP>
        <DocNote type="security">
          Because the cryptography is identical to every other platform, the
          recovery rules are too: lose your vault passphrase and your files
          cannot be decrypted on any device. Keep it in a password manager — see{" "}
          <Link href="/docs/recovery" className="text-cyan-600 hover:underline dark:text-cyan-400">
            Account recovery
          </Link>
          .
        </DocNote>
      </DocSection>

      <DocSection id="next" title="Where to go next">
        <DocList
          items={[
            <Link key="a" href="/docs/desktop-app" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Desktop app — the same engine as a native build for your computer
            </Link>,
            <Link key="b" href="/docs/web-app" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Web app — the full product in any modern browser
            </Link>,
            <Link key="c" href="/download#android" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Download — get the current Android APK
            </Link>,
            <Link key="d" href="/features/apps" className="text-cyan-600 hover:underline dark:text-cyan-400">
              zcrypt everywhere — one vault across web, desktop, terminal, and mobile
            </Link>,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
