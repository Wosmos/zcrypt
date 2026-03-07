"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Upload,
  FolderOpen,
  Server,
  Settings,
  Shield,
} from "lucide-react";

const links = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/files", label: "Files", icon: FolderOpen },
  { href: "/platforms", label: "Platforms", icon: Server },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex h-screen w-[232px] flex-col border-r border-zinc-800/40 bg-zinc-950/80">
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-indigo-600/15 ring-1 ring-indigo-500/20">
            <Shield className="h-[18px] w-[18px] text-indigo-400" />
          </div>
          <div>
            <span className="text-[15px] font-bold text-zinc-100 tracking-tight">
              zpush
            </span>
            <p className="text-[10px] text-zinc-600 -mt-0.5">encrypted vault</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 space-y-1">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-150",
                  active
                    ? "bg-indigo-500/10 text-indigo-300 shadow-sm shadow-indigo-500/5"
                    : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50"
                )}
              >
                <Icon
                  className={cn(
                    "h-[18px] w-[18px]",
                    active ? "text-indigo-400" : ""
                  )}
                />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-zinc-800/30">
          <p className="text-[10px] text-zinc-700 leading-relaxed">
            zpush v0.2
            <br />
            zero-knowledge encrypted storage
          </p>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-zinc-800/40 bg-zinc-950/95 backdrop-blur-xl px-2 py-1 safe-area-pb">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl text-[10px] font-medium transition-colors",
                active ? "text-indigo-400" : "text-zinc-600"
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
