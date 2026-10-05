import { Globe, Monitor, Smartphone } from "@/lib/icons";
import { desktopEngine } from "@/lib/data";
import type { ReactNode } from "react";

export interface AppsPageData {
  hero: {
    eyebrow: string;
    title: string;
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
    eyebrow: "Web, desktop & Android",
    title: "One drive, three ways in",
    subtext: (
      <>
        The same zero-knowledge core, wherever you work: a web app in any browser, a native desktop
        app for macOS, Windows and Linux, and an Android app you sideload in a minute. The
        encryption never changes, only the interface does.
      </>
    ),
    secondaryLabel: "Download the apps",
    secondaryHref: "/download",
  },

  sharedCoreNote: (
    <>
      <span className="font-semibold text-[var(--color-text)]">
        The same encryption everywhere.
      </span>{" "}
      The web app runs the pipeline in Web Workers; desktop and Android run {desktopEngine.name},
      the in-process {desktopEngine.language} engine. Every surface compresses, encrypts with
      AES-256-GCM, chunks, and uploads entirely on your device. Pick a surface for the workflow, not
      for the security: it&apos;s the same vault and the same guarantees on all three.
    </>
  ),

  surfacesSection: {
    heading: "Pick where you work",
    subheading:
      "Three front ends over one encrypted backend. Use whichever fits the moment, or all three.",
  },
  surfaces: [
    {
      Icon: Globe,
      name: "Web app",
      tagline: "Any browser, nothing to install",
      desc: "The full vault in any modern browser. Encryption runs in the page itself, so your files are sealed before they leave the tab, no extension, no download.",
      points: [
        "Works on any OS",
        "Drag-and-drop uploads",
        "In-browser previews",
        "Always the latest build",
      ],
      href: "/docs/web-app",
      cta: "Web app docs",
    },
    {
      Icon: Monitor,
      name: "Desktop app",
      tagline: "Native on macOS, Windows & Linux",
      desc: `A native desktop build running ${desktopEngine.name}, the in-process ${desktopEngine.language} engine. Sits in your dock or tray, uploads straight to your own storage, and handles large transfers comfortably.`,
      points: [
        "macOS, Windows, Linux",
        "In-process Rust engine",
        "Uploads direct to your storage",
        "Same encrypted vault",
      ],
      href: "/docs/desktop-app",
      cta: "Desktop app docs",
    },
    {
      Icon: Smartphone,
      name: "Android app",
      tagline: "Sideload the APK in a minute",
      desc: `Your vault on your phone, running the same ${desktopEngine.name} ${desktopEngine.language} engine as desktop. Not on the Play Store yet: grab the APK, enable install, and you're in. No wait, no gatekeeper.`,
      points: [
        "Same Rust engine as desktop",
        "Installs in about a minute",
        "No Play Store wait",
        "Uploads direct to your storage",
      ],
      href: "/docs/android-app",
      cta: "Android app docs",
      badge: "Beta",
    },
  ],

  comparisonSection: {
    heading: "Which one when?",
    subheading: "A quick way to choose. There's no wrong answer: they all open the same drive.",
    footnote:
      "One account, one encrypted vault: switch surfaces any time without re-uploading a thing.",
  },
  comparison: [
    {
      surface: "Web app",
      bestFor: "Quick access from any machine",
      install: "Nothing. Open a browser",
      runsOn: "Any OS with a modern browser",
    },
    {
      surface: "Desktop app",
      bestFor: "Daily use and big transfers",
      install: "Native installer",
      runsOn: "macOS, Windows, Linux",
    },
    {
      surface: "Android app",
      bestFor: "Your vault on the go",
      install: "Sideload the APK (beta)",
      runsOn: "Android phones & tablets",
    },
  ],

  related: [
    {
      href: "/features/encrypted-drive",
      title: "The encrypted drive",
      desc: "The file explorer at the heart of every surface.",
    },
    {
      href: "/docs/android-app",
      title: "Android app guide",
      desc: "Sideload the beta APK in about a minute.",
    },
    {
      href: "/docs/desktop-app",
      title: "Desktop app guide",
      desc: "Install the native build for your platform.",
    },
  ],

  cta: {
    heading: "The same drive, wherever you are",
    subtext:
      "Free and open source. Create an account once and reach it from the web, your desktop, or your phone.",
  },
};
