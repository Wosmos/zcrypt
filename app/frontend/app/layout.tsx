import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Poppins, Manrope } from "next/font/google";
import "./globals.css";
import { ToastContainer } from "@/components/ui/toast-container";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { NavProgress } from "@/components/ui/nav-progress";

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
    default: "zcrypt — Encrypted Cloud Storage",
    template: "%s | zcrypt",
  },
  description: "Zero-knowledge encrypted personal cloud storage.",
  keywords: [
    "cloud storage",
    "encryption",
    "privacy",
    "zero-knowledge",
    "file sharing",
    "secure file upload",
  ],
  authors: [{ name: "zcrypt Team" }],
  creator: "zcrypt",
  publisher: "zcrypt",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://zcrypt.cloud",
    title: "zcrypt — Encrypted Cloud Storage",
    description:
      "Zero-knowledge encrypted personal cloud storage built for complete mathematical privacy.",
    siteName: "zcrypt",
  },
  twitter: {
    card: "summary_large_image",
    title: "zcrypt — Encrypted Cloud Storage",
    description: "Zero-knowledge encrypted personal cloud storage.",
  },
  robots: {
    index: true,
    follow: true,
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
