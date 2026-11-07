import { SPACE_EXPORT_ID } from "@/lib/space-routes";

// output:export (desktop) needs at least one param; the desktop app reaches
// every Space through this path with the id in `?id=` (see lib/space-routes).
// The web build has no layout here, so it stays dynamic instead of storing an
// ISR page per id.
export function generateStaticParams() {
  return [{ id: SPACE_EXPORT_ID }];
}

export default function SpaceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
