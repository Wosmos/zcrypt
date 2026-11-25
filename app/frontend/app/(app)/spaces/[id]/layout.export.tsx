import { ROUTE_SHELL_PARAMS } from "@/lib/route-shell";

// Every Space is served by the one prerendered `/spaces/_` page; the id rides
// in `?id=` (see lib/route-shell).
export function generateStaticParams() {
  return ROUTE_SHELL_PARAMS;
}

export default function SpaceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
