import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Poppins, Manrope } from "next/font/google";
import "./globals.css";
import { ToastContainer } from "@/components/ui/toast-container";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { NavProgress } from "@/components/ui/nav-progress";
import {
  OrganizationJsonLd,
  WebSiteJsonLd,
} from "@/components/seo/json-ld";

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
    default: "zcrypt — Private Encrypted Cloud Storage | Zero-Knowledge Security",
    template: "%s | zcrypt",
  },
  description:
    "Free zero-knowledge encrypted cloud storage. Military-grade AES-256 encryption, open source, 10 GB free. Your files, your keys, your privacy. Alternative to Dropbox, Google Drive & iCloud.",
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
    title: "zcrypt — Private Encrypted Cloud Storage",
    description:
      "Free zero-knowledge encrypted cloud storage with AES-256 encryption. 10 GB free, open source, no credit card required. The private alternative to Dropbox and Google Drive.",
    siteName: "zcrypt",
  },
  twitter: {
    card: "summary_large_image",
    title: "zcrypt — Private Encrypted Cloud Storage",
    description:
      "Free zero-knowledge encrypted cloud storage. 10 GB free, AES-256 encryption, open source.",
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
                } catch(e) {}
              })();
            `,
          }}
        />
        <OrganizationJsonLd />
        <WebSiteJsonLd />
      </head>
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-4 focus:left-4 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-neutral-900 focus:shadow-lg"
        >
          Skip to content
        </a>
        <ThemeProvider>
          <NavProgress />
          {children}
          <ToastContainer />
        </ThemeProvider>
      </body>
    </html>
  );
}
