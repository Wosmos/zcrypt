"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { warmSpaceKeys } from "@/lib/spaces";
import { useFilesQuery } from "@/store/files";
import { useSpaceAdds } from "@/store/space-adds";
import { useSpaceMeta } from "@/hooks/useSpaceMeta";
import { useSpaceBatchLimit } from "@/hooks/useSpaceBatchLimit";
import { Button, buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { FilePicker } from "@/components/spaces/file-picker";
import {
  Notice,
  PageShell,
  ShortcutsHelp,
  SpaceBreadcrumb,
  plural,
} from "@/components/spaces/shared";
import { useSpaceDetail } from "@/components/spaces/use-space";

const SHORTCUTS: [string, string][] = [
  ["Arrow keys", "Move between files and folders"],
  ["Space / Enter", "Select a file, or open a folder"],
  ["Shift + Arrow", "Extend the selection"],
  ["Ctrl/Cmd + A", "Select all files in this folder"],
  ["Esc", "Clear the selection"],
  ["/", "Search your files"],
  ["?", "Show these shortcuts"],
];

export function SpaceAdd() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { query, detail, perms } = useSpaceDetail(id);
  const meta = useSpaceMeta(detail ?? undefined);
  const { data: files = [], isPending: filesLoading } = useFilesQuery();
  const job = useSpaceAdds((s) => s.jobs[id]);
  const batchLimit = useSpaceBatchLimit();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  const fileIds = useMemo(() => [...selected], [selected]);
  useEffect(() => {
    if (fileIds.length === 0) return;
    const t = setTimeout(() => warmSpaceKeys(fileIds), 300);
    return () => clearTimeout(t);
  }, [fileIds]);

  const available = useMemo(() => {
    if (!detail) return [];
    const taken = new Set(detail.files.map((f) => f.file_id));
    if (job && job.status !== "done") for (const fid of job.fileIds) taken.add(fid);
    return files.filter((f) => !taken.has(f.id));
  }, [files, detail, job]);

  const spaceName = meta.name || "Space";
  const crumbs = [
    { label: "Spaces", href: "/spaces" },
    { label: spaceName, href: `/spaces/${id}` },
    { label: "Add files" },
  ];

  if (query.isPending && !detail) {
    return (
      <PageShell>
        <Skeleton className="h-5 w-52 rounded-md" />
        <Skeleton className="h-8 w-64 rounded-md" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </PageShell>
    );
  }

  if (!detail || !perms) {
    return (
      <PageShell>
        <SpaceBreadcrumb crumbs={crumbs} />
        <Notice tone="error">Couldn&apos;t load this space.</Notice>
      </PageShell>
    );
  }

  const blockedReason = !perms.editFiles
    ? "Only editors and admins can add files to this space."
    : detail.needs_rotation
      ? "A member was removed, so adding files is paused until the space key is rotated."
      : null;

  const over = selected.size - batchLimit;
  const overLimit = over > 0;

  const submit = () => {
    if (selected.size === 0 || overLimit || blockedReason) return;
    useSpaceAdds.getState().enqueue(detail, fileIds, spaceName);
    router.push(`/spaces/${id}`);
  };

  return (
    <PageShell>
      <SpaceBreadcrumb crumbs={crumbs} />
      <PageHeader
        title="Add files"
        description={`Choose files from your vault to share into ${spaceName}. They are re-sealed under the space key in the background.`}
        actions={<ShortcutsHelp items={SHORTCUTS} title="Picker shortcuts" />}
      />

      {blockedReason ? (
        <Notice tone="warn">
          {blockedReason}{" "}
          {perms.rotate && detail.needs_rotation && (
            <Link href={`/spaces/${id}/settings#rotate`} className="font-medium underline">
              Rotate the key
            </Link>
          )}
        </Notice>
      ) : (
        <div className="mx-auto max-w-3xl space-y-4">
          <FilePicker
            files={available}
            loading={filesLoading}
            selected={selected}
            onSelectedChange={(next) => setSelected(next)}
            emptyLabel="Every file in your vault is already in this space."
            listClassName="max-h-[min(32rem,55dvh)]"
            autoFocusSearch
          />

          {overLimit && (
            <Notice tone="warn">
              Your plan adds up to {batchLimit} files at a time. Deselect {plural(over, "file")} to
              continue, then add the rest in another batch.
            </Notice>
          )}
        </div>
      )}

      <div className="sticky bottom-[calc(5rem+var(--safe-bottom))] z-10 md:bottom-0 -mx-3 border-t border-[var(--color-border)] bg-[var(--color-surface)]/95 px-3 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
          <p className="text-sm tabular-nums text-[var(--color-text-secondary)]" aria-live="polite">
            <span className="font-medium text-[var(--color-text)]">{selected.size} selected</span>
            {Number.isFinite(batchLimit) && (
              <span className="text-[var(--color-text-muted)]">
                {" "}
                &middot; up to {batchLimit} at a time on your plan
              </span>
            )}
          </p>
          <div className="flex items-center gap-2">
            <Link href={`/spaces/${id}`} className={buttonClass("ghost", "md")}>
              Cancel
            </Link>
            <Button onClick={submit} disabled={selected.size === 0 || overLimit || !!blockedReason}>
              {selected.size > 0 ? `Add ${plural(selected.size, "file")}` : "Add files"}
            </Button>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
