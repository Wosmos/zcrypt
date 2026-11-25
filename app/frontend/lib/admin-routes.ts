import { shellHref } from "@/lib/route-shell";

export function adminUserHref(id: string): string {
  return shellHref("/admin/users", id);
}
