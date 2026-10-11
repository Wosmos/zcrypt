"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { create } from "zustand";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { useFilesQuery } from "@/store/files";
import { useAuthStore } from "@/store/auth";
import { usePreferencesStore } from "@/store/preferences";
import { usePendingAction } from "@/store/pending-action";
import { useTheme } from "@/components/providers/theme-provider";
import { useVaultLockContext } from "@/components/providers/vault-lock-provider";
import { useGetAppsDialog } from "@/components/ui/get-apps-dialog";
import { paletteActions, type PaletteActionId } from "@/components/ui/palette-actions";
import { useIsMobile } from "@/hooks/useIsMobile";
import { isTauri } from "@/lib/tauri";
import { Role } from "@/types";
import {
  Shield,
  Settings,
  Cog,
  Users,
  BarChart3,
  Layers,
  Trash2,
  RefreshCcw,
  File as FileIcon,
} from "@/lib/icons";

interface CommandPaletteState {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

const useCommandPalette = create<CommandPaletteState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}));

// Lets the palette seed the Vault's file filter without a remount or ?q param.
interface VaultSearchState {
  query: string;
  setQuery: (query: string) => void;
  pendingOpen: string | null;
  requestOpen: (fileId: string | null) => void;
}
export const useVaultSearch = create<VaultSearchState>((set) => ({
  query: "",
  setQuery: (query) => set({ query }),
  pendingOpen: null,
  requestOpen: (pendingOpen) => set({ pendingOpen }),
}));

const NAV = [
  { key: "shell.vault", href: "/dashboard", icon: Shield },
  { key: "shell.spaces", href: "/spaces", icon: Layers },
  { key: "ui.palette.analytics", href: "/analytics", icon: BarChart3 },
  { key: "shell.trash", href: "/trash", icon: Trash2 },
  { key: "ui.palette.deviceTransfer", href: "/transfer", icon: RefreshCcw },
  { key: "shell.settings", href: "/settings", icon: Settings },
  { key: "shell.tools", href: "/tools", icon: Cog },
];

const ADMIN_NAV = { key: "shell.admin", href: "/admin", icon: Users };

// Matches are picked here, from the whole library, before cmdk ranks them, so
// any file is findable while the list stays small enough to render instantly.
const MAX_FILE_RESULTS = 50;

export function CommandPalette() {
  const t = useTranslations();
  const router = useRouter();
  const open = useCommandPalette((s) => s.open);
  const setOpen = useCommandPalette((s) => s.setOpen);
  const toggle = useCommandPalette((s) => s.toggle);
  const files = useFilesQuery().data;
  const isAdmin = useAuthStore((s) => s.user?.role === Role.Admin);
  const vault = useVaultLockContext();
  const { resolvedTheme, toggleTheme } = useTheme();
  const advancedMode = usePreferencesStore((s) => s.advancedMode);
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const nav = isAdmin ? [...NAV, ADMIN_NAV] : NAV;
  const actions = paletteActions({
    unlocked: vault.unlocked,
    resolvedTheme,
    advancedMode,
    hasAppsDialog: !isTauri,
    hasKeyboard: !isMobile,
  });

  const fileResults = useMemo(() => {
    const all = files ?? [];
    const q = search.trim().toLowerCase();
    const hits = q ? all.filter((f) => f.original_name.toLowerCase().includes(q)) : all;
    return hits.slice(0, MAX_FILE_RESULTS);
  }, [files, search]);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setSearch("");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  const runAction = (id: PaletteActionId) => {
    onOpenChange(false);
    const { request } = usePendingAction.getState();
    switch (id) {
      case "upload":
      case "newFolder":
      case "shortcuts":
        request(id);
        router.push("/dashboard");
        return;
      case "toggleLock":
        if (vault.unlocked) vault.lock();
        else vault.unlock();
        return;
      case "toggleTheme":
        toggleTheme();
        return;
      case "toggleAdvanced":
        usePreferencesStore.getState().setAdvancedMode(!advancedMode);
        return;
      case "openSpaces":
        router.push("/spaces");
        return;
      case "newSpace":
        router.push("/spaces/new");
        return;
      case "getApps":
        useGetAppsDialog.getState().setOpen(true);
        return;
    }
  };

  const openFile = (name: string) => {
    useVaultSearch.getState().setQuery(name);
    onOpenChange(false);
    router.push("/dashboard");
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder={t("ui.palette.placeholder")}
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>{t("ui.palette.empty")}</CommandEmpty>
        <CommandGroup heading={t("ui.palette.actionsHeading")}>
          {actions.map((a) => (
            <CommandItem
              key={a.id}
              value={`action ${t(a.labelKey as never)}`}
              onSelect={() => runAction(a.id)}
            >
              <a.icon className="h-4 w-4 text-[var(--color-text-muted)]" />
              {t(a.labelKey as never)}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading={t("ui.palette.goTo")}>
          {nav.map((n) => (
            <CommandItem key={n.href} value={`go ${t(n.key as never)}`} onSelect={() => go(n.href)}>
              <n.icon className="h-4 w-4 text-[var(--color-text-muted)]" />
              {t(n.key as never)}
            </CommandItem>
          ))}
        </CommandGroup>
        {fileResults.length > 0 && (
          <CommandGroup heading={t("ui.palette.files")}>
            {fileResults.map((f) => (
              <CommandItem
                key={f.id}
                value={`file ${f.original_name}`}
                onSelect={() => openFile(f.original_name)}
              >
                <FileIcon className="h-4 w-4 text-[var(--color-text-muted)]" />
                <span className="truncate">{f.original_name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
