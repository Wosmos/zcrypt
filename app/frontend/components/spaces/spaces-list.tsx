"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listSharedVaults } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { useAuthStore } from "@/store/auth";
import { useSpaceMeta } from "@/hooks/useSpaceMeta";
import { useKeyboardSelection } from "@/hooks/useKeyboardSelection";
import { useAutoTour } from "@/components/onboarding/tour-provider";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SpaceCard, SpaceCardSkeleton } from "@/components/spaces/space-ui";
import {
  LiveRegion,
  Notice,
  PageShell,
  ShortcutsHelp,
  plural,
  useGridColumns,
  useSlashToFocus,
} from "@/components/spaces/shared";
import type { SharedVault } from "@/types";
import { Plus, Search, Users } from "@/lib/icons";

const SHORTCUTS: [string, string][] = [
  ["Arrow keys", "Move between spaces"],
  ["Enter", "Open the space"],
  ["/", "Search spaces"],
  ["?", "Show these shortcuts"],
];

interface Meta {
  name: string;
  description: string;
}

function MetaProbe({
  vault,
  onMeta,
}: {
  vault: SharedVault;
  onMeta: (id: string, meta: Meta) => void;
}) {
  const { name, description } = useSpaceMeta(vault);
  useEffect(() => {
    onMeta(vault.id, { name, description });
  }, [name, description, vault.id, onMeta]);
  return null;
}

export function SpacesList() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const vaultsQuery = useQuery({ queryKey: qk.spaces, queryFn: listSharedVaults });
  const vaults = useMemo(() => vaultsQuery.data ?? [], [vaultsQuery.data]);
  const loading = vaultsQuery.isPending;

  useAutoTour("spaces", !loading);

  const [metas, setMetas] = useState<Record<string, Meta>>({});
  const onMeta = useCallback((id: string, meta: Meta) => {
    setMetas((prev) => {
      const cur = prev[id];
      if (cur && cur.name === meta.name && cur.description === meta.description) return prev;
      return { ...prev, [id]: meta };
    });
  }, []);

  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  useSlashToFocus(searchRef);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return vaults;
    return vaults.filter((v) => {
      const m = metas[v.id];
      return !!m && (m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q));
    });
  }, [vaults, metas, query]);

  const ids = useMemo(() => visible.map((v) => v.id), [visible]);
  const gridRef = useRef<HTMLDivElement>(null);
  const columns = useGridColumns(gridRef, ids.length > 0);
  const noSelection = useMemo(() => new Set<string>(), []);
  const nav = useKeyboardSelection<string>({
    ids,
    columns,
    selected: noSelection,
    onSelectedChange: () => {},
    onOpen: (id) => router.push(`/spaces/${id}`),
  });

  const announce = query.trim() ? `${plural(visible.length, "space")} match` : "";

  return (
    <PageShell>
      <PageHeader
        eyebrow="Collaboration"
        title="Spaces"
        description="Share encrypted files with people you invite. The space key is sealed to each member's key: the server never sees it."
        actions={
          <>
            <ShortcutsHelp items={SHORTCUTS} title="Spaces shortcuts" />
            <Link href="/spaces/new" data-tour="space-new" className={buttonClass("primary", "sm")}>
              <Plus className="h-3.5 w-3.5" />
              New Space
            </Link>
          </>
        }
      />

      {vaults.map((v) => (
        <MetaProbe key={`${v.id}|${v.name}|${v.description}`} vault={v} onMeta={onMeta} />
      ))}
      <LiveRegion message={announce} />

      {vaultsQuery.isError && !vaultsQuery.data ? (
        <Notice tone="error">
          Couldn&apos;t load your spaces.{" "}
          <button
            type="button"
            className="font-medium underline"
            onClick={() => void vaultsQuery.refetch()}
          >
            Try again
          </button>
        </Notice>
      ) : loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <SpaceCardSkeleton key={i} />
          ))}
        </div>
      ) : vaults.length === 0 ? (
        <div
          className="panel flex flex-col items-center justify-center gap-3 px-6 py-16 text-center"
          data-tour="space-list"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-accent)]/10 text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/20">
            <Users className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-[var(--color-text)]">No spaces yet</p>
            <p className="mx-auto max-w-sm text-sm text-[var(--color-text-secondary)]">
              A space is a shared, end-to-end encrypted folder. Invite people, pick who can edit,
              and revoke access any time.
            </p>
          </div>
          <Link href="/spaces/new" className={buttonClass("secondary", "sm")}>
            <Plus className="h-3.5 w-3.5" />
            Create your first space
          </Link>
        </div>
      ) : (
        <div className="space-y-4" data-tour="space-list">
          {vaults.length > 1 && (
            <div className="max-w-md">
              <Input
                ref={searchRef}
                icon={<Search className="h-4 w-4" />}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    if (query) setQuery("");
                    else e.currentTarget.blur();
                  }
                  if (e.key === "ArrowDown" && ids[0]) {
                    e.preventDefault();
                    nav.moveFocus(null, 0, false);
                  }
                }}
                placeholder="Search spaces  ( / )"
                aria-label="Search spaces"
              />
            </div>
          )}
          {visible.length === 0 ? (
            <p className="panel px-5 py-10 text-center text-sm text-[var(--color-text-muted)]">
              No spaces match &ldquo;{query.trim()}&rdquo;.
            </p>
          ) : (
            <div
              ref={gridRef}
              role="listbox"
              aria-label="Spaces"
              onKeyDown={nav.onContainerKeyDown}
              className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
            >
              {visible.map((vault, i) => {
                const {
                  onClick: _click,
                  onKeyDown,
                  onFocus,
                  tabIndex,
                } = nav.getItemProps(vault.id);
                return (
                  <SpaceCard
                    key={vault.id}
                    vault={vault}
                    name={metas[vault.id]?.name ?? ""}
                    description={metas[vault.id]?.description ?? ""}
                    userId={user?.id}
                    index={i}
                    itemProps={{
                      "data-item-id": vault.id,
                      tabIndex,
                      onKeyDown,
                      onFocus,
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}
