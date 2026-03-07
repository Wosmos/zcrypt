import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/ui/sidebar";
import { ToastContainer } from "@/components/ui/toast-container";

export const metadata: Metadata = {
  title: "zpush — Encrypted Cloud Storage",
  description: "Zero-knowledge encrypted personal cloud storage",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>
        <div className="flex h-dvh">
          <Sidebar />
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-24 md:pb-8">
              {children}
            </div>
          </main>
        </div>
        <ToastContainer />
      </body>
    </html>
  );
}
