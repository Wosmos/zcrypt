"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
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
import { Shield, Settings, Cog, Users, BarChart3, Layers, Trash2, RefreshCcw, File as FileIcon } from "@/lib/icons";

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
}
export const useVaultSearch = create<VaultSearchState>((set) => ({
  query: "",
  setQuery: (query) => set({ query }),
}));

const NAV = [
  { label: "Vault", href: "/dashboard", icon: Shield },
  { label: "Spaces", href: "/spaces", icon: Layers },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Deleted Files", href: "/trash", icon: Trash2 },
  { label: "Device Transfer", href: "/transfer", icon: RefreshCcw },
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Tools", href: "/tools", icon: Cog },
  { label: "Admin", href: "/admin", icon: Users },
];

export function CommandPalette() {
  const router = useRouter();
  const open = useCommandPalette((s) => s.open);
  const setOpen = useCommandPalette((s) => s.setOpen);
  const toggle = useCommandPalette((s) => s.toggle);
  const files = useFilesQuery().data ?? [];

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
    setOpen(false);
    router.push(href);
  };

  const openFile = (name: string) => {
    useVaultSearch.getState().setQuery(name);
    setOpen(false);
    router.push("/dashboard");
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search files or jump to…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Go to">
          {NAV.map((n) => (
            <CommandItem key={n.href} value={`go ${n.label}`} onSelect={() => go(n.href)}>
              <n.icon className="h-4 w-4 text-[var(--color-text-muted)]" />
              {n.label}
            </CommandItem>
          ))}
        </CommandGroup>
        {files.length > 0 && (
          <CommandGroup heading="Files">
            {files.slice(0, 200).map((f) => (
              <CommandItem key={f.id} value={`file ${f.original_name}`} onSelect={() => openFile(f.original_name)}>
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
