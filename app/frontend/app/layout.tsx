import type { Metadata } from "next";
import "./globals.css";
import { ToastContainer } from "@/components/ui/toast-container";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { CircuitBackground } from "@/components/ui/circuit-background";

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
        <ThemeProvider>
          <CircuitBackground />
          {children}
          <ToastContainer />
        </ThemeProvider>
      </body>
    </html>
  );
}
