import { DocsSidebar } from "@/components/docs/docs-sidebar";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-24 sm:px-6 md:pt-28 lg:px-8">
      <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-12">
        <DocsSidebar />
        <div className="min-w-0 pt-6 lg:pt-2">{children}</div>
      </div>
    </div>
  );
}
