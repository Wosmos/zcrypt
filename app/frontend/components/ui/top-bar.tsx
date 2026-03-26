"use client";

import { usePathname } from "next/navigation";
import { NotificationCenter } from "@/components/ui/notification-center";
import { AvatarDropdown } from "@/components/ui/avatar-dropdown";

const TITLES: Record<string, string> = {
  "/dashboard": "My Vault",
  "/notes": "Secure Notes",
  "/share": "Share",
  "/settings": "Settings",
  "/tools": "Tools",
  "/admin": "Admin",
  "/transfer": "Transfer",
};

function getTitle(pathname: string) {
  if (TITLES[pathname]) return TITLES[pathname];
  for (const [key, title] of Object.entries(TITLES)) {
    if (pathname.startsWith(key + "/")) return title;
  }
  return "zcrypt";
}

export function TopBar() {
  const pathname = usePathname();
  const title = getTitle(pathname);

  return (
    <header className="sticky top-0 z-30 bg-[var(--color-bg)]/80 backdrop-blur-xl">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-4">
          <h1 className="text-base font-semibold tracking-tight truncate">
            {title}
          </h1>
          <div className="flex items-center gap-0.5">
            <NotificationCenter />
            <AvatarDropdown />
          </div>
        </div>
      </div>
    </header>
  );
}
