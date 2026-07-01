import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Poppins, Manrope } from "next/font/google";
import "./globals.css";
import { ToastContainer } from "@/components/ui/toast-container";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { NavProgress } from "@/components/ui/nav-progress";
import {
  OrganizationJsonLd,
  WebSiteJsonLd,
} from "@/components/seo/json-ld";
import { Analytics } from "@vercel/analytics/react";

const satoshi = localFont({
  src: [
    {
      path: "../public/fonts/satoshi/Satoshi-Variable.woff2",
      style: "normal",
    },
  ],
  variable: "--font-heading",
  display: "swap",
  weight: "400 700",
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-logo",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://zcrypt.cloud"),
  title: {
    default: "zcrypt — The Encrypted Cloud Drive You Actually Own | Zero-Knowledge",
    template: "%s | zcrypt",
  },
  description:
    "zcrypt is a zero-knowledge encrypted cloud drive: real folders, instant in-browser file previews, and per-folder passwords. Files are encrypted on your device with AES-256-GCM and stored in accounts you already own. Free, open source, no artificial limits. The private alternative to Dropbox, Google Drive, and Proton Drive.",
  keywords: [
    "encrypted cloud storage",
    "zero knowledge cloud storage",
    "private cloud storage",
    "secure file storage",
    "encrypted file sharing",
    "zero knowledge encryption",
    "end to end encrypted storage",
    "open source cloud storage",
    "AES-256 cloud storage",
    "free encrypted storage",
    "private file upload",
    "secure cloud backup",
    "dropbox alternative",
    "google drive alternative",
    "encrypted file hosting",
    "self hosted cloud storage",
    "privacy focused cloud storage",
    "zcrypt",
    "zcrypt cloud",
    "military grade encryption storage",
    "BYOB cloud storage",
    "bring your own backend storage",
    "git based cloud storage",
    "cheap cloud storage",
    "affordable encrypted storage",
    "encrypted drive",
    "private cloud drive",
    "encrypted cloud drive",
    "encrypted file manager",
    "encrypted folders",
    "password protected folders",
    "encrypted file viewer",
    "preview encrypted files",
    "secure file organization",
    "online encrypted drive",
    "proton drive alternative",
    "tresorit alternative",
    "sync.com alternative",
  ],
  authors: [{ name: "zcrypt Team", url: "https://zcrypt.cloud" }],
  creator: "zcrypt",
  publisher: "zcrypt",
  category: "technology",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
  alternates: {
    canonical: "https://zcrypt.cloud",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://zcrypt.cloud",
    title: "zcrypt — The Encrypted Cloud Drive You Actually Own",
    description:
      "A zero-knowledge encrypted cloud drive with real folders and instant file previews. Encrypted on your device with AES-256-GCM, stored in accounts you already own. Free, open source, no artificial limits.",
    siteName: "zcrypt",
  },
  twitter: {
    card: "summary_large_image",
    title: "zcrypt — The Encrypted Cloud Drive You Actually Own",
    description:
      "A zero-knowledge encrypted cloud drive: real folders, instant previews, AES-256-GCM, your own storage. Free and open source.",
    creator: "@zcryptcloud",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    // Add your Google Search Console verification code here
    // google: "your-verification-code",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`dark ${satoshi.variable} ${poppins.variable} ${manrope.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('zcrypt-theme') || 'system';
                  var resolved = theme;
                  if (theme === 'system') {
                    resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                  }
                  document.documentElement.classList.remove('light', 'dark');
                  document.documentElement.classList.add(resolved);
                  var colorTheme = localStorage.getItem('zcrypt-color-theme');
                  if (colorTheme && colorTheme !== 'default') {
                    document.documentElement.setAttribute('data-theme', colorTheme);
                  }
                } catch(e) {}
              })();
            `,
          }}
        />
        <OrganizationJsonLd />
        <WebSiteJsonLd />
      </head>
      <body>
        {/* Shared squircle clip-path (superellipse n=4). Referenced by the
            `.squircle` utility as the cross-browser fallback where CSS
            `corner-shape` is unsupported. objectBoundingBox → scales to any
            element. Rendered once, hidden. */}
        <svg
          aria-hidden="true"
          width="0"
          height="0"
          style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
        >
          <defs>
            <clipPath id="zc-squircle" clipPathUnits="objectBoundingBox">
              <path d="M1.0000,0.5000L0.9969,0.6978L0.9876,0.7779L0.9720,0.8369L0.9497,0.8833L0.9204,0.9204L0.8833,0.9497L0.8369,0.9720L0.7779,0.9876L0.6978,0.9969L0.5000,1.0000L0.3022,0.9969L0.2221,0.9876L0.1631,0.9720L0.1167,0.9497L0.0796,0.9204L0.0503,0.8833L0.0280,0.8369L0.0124,0.7779L0.0031,0.6978L0.0000,0.5000L0.0031,0.3022L0.0124,0.2221L0.0280,0.1631L0.0503,0.1167L0.0796,0.0796L0.1167,0.0503L0.1631,0.0280L0.2221,0.0124L0.3022,0.0031L0.5000,0.0000L0.6978,0.0031L0.7779,0.0124L0.8369,0.0280L0.8833,0.0503L0.9204,0.0796L0.9497,0.1167L0.9720,0.1631L0.9876,0.2221L0.9969,0.3022Z" />
            </clipPath>
          </defs>
        </svg>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-4 focus:left-4 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-neutral-900 focus:shadow-lg"
        >
          Skip to content
        </a>
        <noscript>
          <div style={{ padding: "2rem", maxWidth: "600px", margin: "0 auto", fontFamily: "system-ui, sans-serif", color: "#e4e4e7", backgroundColor: "#09090b", minHeight: "100vh" }}>
            <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>zcrypt — Private Cloud Storage</h1>
            <p style={{ lineHeight: 1.6, color: "#a1a1aa" }}>
              zcrypt is a zero-knowledge encrypted cloud storage platform. Your files are encrypted with AES-256-GCM before they ever leave your device.
            </p>
            <p style={{ lineHeight: 1.6, color: "#a1a1aa", marginTop: "1rem" }}>
              JavaScript is required to use the zcrypt web app. If you prefer not to enable JavaScript, try our <strong>terminal app (TUI)</strong> which works entirely from the command line.
            </p>
            <p style={{ marginTop: "1.5rem" }}>
              <a href="https://zcrypt.cloud/tui" style={{ color: "#00d5e4", textDecoration: "underline" }}>Learn about the TUI</a>
            </p>
          </div>
        </noscript>
        <ThemeProvider>
          <QueryProvider>
            <NavProgress />
            {children}
            <ToastContainer />
            <Analytics />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
