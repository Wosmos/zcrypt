import { DocsSidebar, DocsMobileNav } from "@/components/docs/docs-sidebar";
import { DocsFooter } from "@/components/docs/docs-footer";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar — flush left, full height */}
      <DocsSidebar />

      {/* Content column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile nav bar — sticks below main navbar, hidden on desktop */}
        <DocsMobileNav />

        <main className="mx-auto w-full max-w-3xl flex-1 px-6 pb-16 pt-24 md:px-10 lg:pt-24">
          {children}
        </main>

        <DocsFooter />
      </div>
    </div>
  );
}
