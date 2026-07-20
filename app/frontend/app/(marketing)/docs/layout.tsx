import { DocsSidebar, DocsMobileNav } from "@/components/docs/docs-sidebar";

// The Cmd+K search provider is mounted once in the marketing layout above,
// so the palette works here and on every other marketing page. The site
// footer also comes from the marketing layout — docs adds no second footer.
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar — flush left, full height */}
      <DocsSidebar />

      {/* Content column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile nav bar — sticks below main navbar, hidden on desktop */}
        <DocsMobileNav />

        <main className="mx-auto w-full max-w-4xl flex-1 px-6 pb-16 pt-10 md:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
