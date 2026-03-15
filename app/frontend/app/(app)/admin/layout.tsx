"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/auth";
import { Role } from "@/types";
import { cn } from "@/lib/utils";
import { LayoutGrid, Users, FileText, Crown } from "@/lib/icons";

const tabs = [
  { href: "/admin", label: "Overview", icon: LayoutGrid },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/audit-logs", label: "Audit Logs", icon: FileText },
  { href: "/admin/pricing", label: "Pricing", icon: Crown },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuthStore();

  useEffect(() => {
    if (user && user.role !== Role.Admin) {
      router.push("/dashboard");
    }
  }, [user, router]);

  if (!user || user.role !== Role.Admin) {
    return null;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-violet-500/10 ring-1 ring-violet-500/20">
          <Users className="h-5 w-5 text-violet-500" />
        </div>
        <div>
          <p className="text-[10px] font-semibold text-[var(--color-accent)] uppercase tracking-widest">Administration</p>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight">Admin Dashboard</h1>
        </div>
      </div>

      {/* Tab navigation */}
      <nav className="flex gap-1 border-b border-[var(--color-border)] -mb-px">
        {tabs.map(({ href, label, icon: Icon }) => {
          const isActive = href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
                isActive
                  ? "border-[var(--color-accent)] text-[var(--color-text)]"
                  : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-border)]"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
