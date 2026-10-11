"use client";

import { useTranslations } from "next-intl";
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
import { LayoutGrid, Users, FileText, Crown, Download, AlertTriangle, Star } from "@/lib/icons";

const tabs = [
  { href: "/admin", key: "overview", icon: LayoutGrid },
  { href: "/admin/users", key: "users", icon: Users },
  { href: "/admin/audit-logs", key: "auditLogs", icon: FileText },
  { href: "/admin/downloads", key: "downloads", icon: Download },
  { href: "/admin/reports", key: "reports", icon: AlertTriangle },
  { href: "/admin/reviews", key: "reviews", icon: Star },
  { href: "/admin/pricing", key: "pricing", icon: Crown },
];

function isTabActive(href: string, pathname: string) {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("admin.layout");
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
      <PageHeader title={t("title")} description={t("description")} />

      {/* Mobile: select-based nav */}
      <div className="sm:hidden">
        <Select value={activeTab.href} onValueChange={(href) => router.push(href)}>
          <SelectTrigger aria-label={t("selectSection")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {tabs.map(({ href, key, icon: Icon }) => (
              <SelectItem key={href} value={href}>
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-[var(--color-text-muted)]" />
                  {t(`tabs.${key}`)}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Desktop: tab navigation */}
      <nav className="-mb-px hidden gap-1 border-b border-[var(--color-border)] sm:flex">
        {tabs.map(({ href, key, icon: Icon }) => {
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
                  : "border-transparent text-[var(--color-text-muted)] hover:border-[var(--color-border-hover)] hover:text-[var(--color-text)]",
              )}
            >
              <Icon className="h-4 w-4" />
              {t(`tabs.${key}`)}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
