// output:export (desktop) rejects an empty param set. This page is
// client-rendered (id read from the URL at runtime); the shell below is a
// throwaway to satisfy the export. NOTE: in the desktop static build only this
// one path is emitted, so admin user-detail deep-links don't resolve there:
// admin is a web-first surface. The web build has no layout here, so it stays
// dynamic instead of storing an ISR page per id.
export function generateStaticParams() {
  return [{ id: "placeholder" }];
}

export default function UserDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
