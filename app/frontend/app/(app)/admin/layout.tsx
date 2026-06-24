"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/auth";
import { Role } from "@/types";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LayoutGrid, Users, FileText, Crown } from "@/lib/icons";

const tabs = [
  { href: "/admin", label: "Overview", icon: LayoutGrid },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/audit-logs", label: "Audit logs", icon: FileText },
  { href: "/admin/pricing", label: "Pricing", icon: Crown },
];

function isTabActive(href: string, pathname: string) {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

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

  const activeTab = tabs.find(({ href }) => isTabActive(href, pathname)) ?? tabs[0];

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Admin"
        description="Manage users, platform tokens, plans, and review system activity."
      />

      {/* Mobile: select-based nav */}
      <div className="sm:hidden">
        <Select
          value={activeTab.href}
          onValueChange={(href) => router.push(href)}
        >
          <SelectTrigger aria-label="Select admin section">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {tabs.map(({ href, label, icon: Icon }) => (
              <SelectItem key={href} value={href}>
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-[var(--color-text-muted)]" />
                  {label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Desktop: tab navigation */}
      <nav className="-mb-px hidden gap-1 border-b border-[var(--color-border)] sm:flex">
        {tabs.map(({ href, label, icon: Icon }) => {
          const isActive = isTabActive(href, pathname);
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-bg)]",
                isActive
                  ? "border-[var(--color-accent)] text-[var(--color-text)]"
                  : "border-transparent text-[var(--color-text-muted)] hover:border-[var(--color-border-hover)] hover:text-[var(--color-text)]"
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
