import { Globe, Monitor, Smartphone, Terminal } from "@/lib/icons";
import { desktopEngine } from "@/lib/data";
import type { ReactNode } from "react";

export interface AppsPageData {
  hero: {
    eyebrow: string;
    headlineTop: string;
    headlineGradient: string;
    subtext: ReactNode;
    secondaryLabel: string;
    secondaryHref: string;
  };
  sharedCoreNote: ReactNode;
  surfacesSection: { heading: string; subheading: string };
  surfaces: {
    Icon: typeof Globe;
    name: string;
    tagline: string;
    desc: string;
    points: string[];
    href: string;
    cta: string;
    badge?: string;
  }[];
  comparisonSection: { heading: string; subheading: string; footnote: string };
  comparison: { surface: string; bestFor: string; install: string; runsOn: string }[];
  related: { href: string; title: string; desc: string }[];
  cta: { heading: string; subtext: string };
}

export const apps: AppsPageData = {
  hero: {
    eyebrow: "Web, desktop, Android & terminal",
    headlineTop: "One vault.",
    headlineGradient: "Four ways to reach it.",
    subtext: (
      <>
        The same zero-knowledge core, wherever you work: a web app in any
        browser, a native desktop app for macOS, Windows and Linux, an Android
        app you sideload in a minute, and a single-binary terminal app that runs
        over SSH. The encryption never changes — only the interface does.
      </>
    ),
    secondaryLabel: "See the terminal app",
    secondaryHref: "/tui",
  },

  sharedCoreNote: (
    <>
      <span className="font-semibold text-[var(--color-text)]">The same encryption everywhere.</span>{" "}
      The web app runs the pipeline in Web Workers; desktop and Android run{" "}
      {desktopEngine.name}, the in-process {desktopEngine.language} engine; the
      terminal app runs the same pipeline in Go. Every surface compresses,
      encrypts with AES-256-GCM, chunks, and uploads entirely on your device.
      Pick a surface for the workflow, not for the security — it&apos;s the same
      vault and the same guarantees on all four.
    </>
  ),

  surfacesSection: {
    heading: "Pick where you work",
    subheading: "Four front ends over one encrypted backend. Use whichever fits the moment — or all four.",
  },
  surfaces: [
    {
      Icon: Globe,
      name: "Web app",
      tagline: "Any browser, nothing to install",
      desc: "The full vault in any modern browser. Encryption runs in the page itself, so your files are sealed before they leave the tab — no extension, no download.",
      points: ["Works on any OS", "Drag-and-drop uploads", "In-browser previews", "Always the latest build"],
      href: "/docs/web-app",
      cta: "Web app docs",
    },
    {
      Icon: Monitor,
      name: "Desktop app",
      tagline: "Native on macOS, Windows & Linux",
      desc: `A native desktop build running ${desktopEngine.name}, the in-process ${desktopEngine.language} engine. Sits in your dock or tray, uploads straight to your own storage, and handles large transfers comfortably.`,
      points: ["macOS, Windows, Linux", "In-process Rust engine", "Uploads direct to your storage", "Same encrypted vault"],
      href: "/docs/desktop-app",
      cta: "Desktop app docs",
    },
    {
      Icon: Smartphone,
      name: "Android app",
      tagline: "Sideload the APK in a minute",
      desc: `Your vault on your phone, running the same ${desktopEngine.name} ${desktopEngine.language} engine as desktop. Not on the Play Store yet — grab the APK, enable install, and you're in. No wait, no gatekeeper.`,
      points: ["Same Rust engine as desktop", "Installs in about a minute", "No Play Store wait", "Uploads direct to your storage"],
      href: "/docs/android-app",
      cta: "Android app docs",
      badge: "Beta",
    },
    {
      Icon: Terminal,
      name: "Terminal app (TUI)",
      tagline: "One binary, works over SSH",
      desc: "A single-binary terminal app written in Go. No runtime, no browser — just one small executable that runs anywhere you have a shell, including headless servers over SSH.",
      points: ["Single binary", "Zero dependencies", "Runs over SSH", "Scriptable & fast"],
      href: "/tui",
      cta: "Explore the TUI",
    },
  ],

  comparisonSection: {
    heading: "Which one when?",
    subheading: "A quick way to choose. There's no wrong answer — they all open the same vault.",
    footnote: "One account, one encrypted vault — switch surfaces any time without re-uploading a thing.",
  },
  comparison: [
    { surface: "Web app", bestFor: "Quick access from any machine", install: "Nothing — open a browser", runsOn: "Any OS with a modern browser" },
    { surface: "Desktop app", bestFor: "Daily use and big transfers", install: "Native installer", runsOn: "macOS, Windows, Linux" },
    { surface: "Android app", bestFor: "Your vault on the go", install: "Sideload the APK (beta)", runsOn: "Android phones & tablets" },
    { surface: "Terminal (TUI)", bestFor: "Servers, SSH, and the keyboard", install: "One binary", runsOn: "Linux, macOS, Windows · amd64 & arm64" },
  ],

  related: [
    { href: "/features/encrypted-drive", title: "The encrypted drive", desc: "The file explorer at the heart of every surface." },
    { href: "/docs/android-app", title: "Android app guide", desc: "Sideload the beta APK in about a minute." },
    { href: "/docs/desktop-app", title: "Desktop app guide", desc: "Install the native build for your platform." },
  ],

  cta: {
    heading: "The same vault, wherever you are",
    subtext: "Free and open source. Create an account once and reach it from the web, your desktop, your phone, or a terminal.",
  },
};
