import type { Metadata } from "next";

// Under `output: export` (the Tauri desktop build) Next 16 requires at least
// one concrete param per dynamic segment; an empty array is rejected with
// "missing generateStaticParams()". These share pages are fully client-rendered
// (token read from the URL at runtime) and are stripped from the desktop bundle
// anyway, so a single throwaway shell satisfies the export. On the web build
// (no export) the route stays fully dynamic — dynamicParams defaults to true.
export function generateStaticParams() {
  return [{ token: "placeholder" }];
}

export const metadata: Metadata = {
  title: "Shared File",
  robots: { index: false, follow: false },
};

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh flex items-center justify-center bg-[var(--color-bg)] p-4">
      {children}
    </main>
  );
}
