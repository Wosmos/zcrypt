import { ROUTE_SHELL_PARAMS } from "@/lib/route-shell";

// Every user is served by the one prerendered `/admin/users/_` page; the id
// rides in `?id=` (see lib/route-shell).
export function generateStaticParams() {
  return ROUTE_SHELL_PARAMS;
}

export default function UserDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
