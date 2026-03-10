import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastContainer } from "@/components/ui/toast-container";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { NavProgress } from "@/components/ui/nav-progress";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://zpush.io"),
  title: {
    default: "zpush — Encrypted Cloud Storage",
    template: "%s | zpush",
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
  authors: [{ name: "zpush Team" }],
  creator: "zpush",
  publisher: "zpush",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://zpush.io",
    title: "zpush — Encrypted Cloud Storage",
    description:
      "Zero-knowledge encrypted personal cloud storage built for complete mathematical privacy.",
    siteName: "zpush",
  },
  twitter: {
    card: "summary_large_image",
    title: "zpush — Encrypted Cloud Storage",
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
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('zpush-theme') || 'system';
                  var resolved = theme;
                  if (theme === 'system') {
                    resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                  }
                  document.documentElement.className = resolved;
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
