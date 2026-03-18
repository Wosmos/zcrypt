"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/auth";
import { Role } from "@/types";
import { cn } from "@/lib/utils";
import { LayoutGrid, Users, FileText, Crown, ChevronDown } from "@/lib/icons";

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
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user && user.role !== Role.Admin) {
      router.push("/dashboard");
    }
  }, [user, router]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

  // Close dropdown on route change
  useEffect(() => { setDropdownOpen(false); }, [pathname]);

  if (!user || user.role !== Role.Admin) {
    return null;
  }

  const activeTab = tabs.find(({ href }) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href)
  ) ?? tabs[0];

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

      {/* Mobile: dropdown nav */}
      <div className="sm:hidden relative" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center justify-between w-full px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm font-medium"
        >
          <span className="flex items-center gap-2">
            <activeTab.icon className="h-4 w-4 text-[var(--color-accent)]" />
            {activeTab.label}
          </span>
          <ChevronDown className={cn("h-4 w-4 text-[var(--color-text-muted)] transition-transform", dropdownOpen && "rotate-180")} />
        </button>
        {dropdownOpen && (
          <div className="absolute z-30 top-full mt-1 left-0 right-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg overflow-hidden animate-fade-in">
            {tabs.map(({ href, label, icon: Icon }) => {
              const isActive = href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-2.5 px-4 py-3 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                      : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)]"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Desktop: tab navigation */}
      <nav className="hidden sm:flex gap-1 border-b border-[var(--color-border)] -mb-px">
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
