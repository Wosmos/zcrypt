"use client";

import { spaceHref } from "@/lib/space-routes";
import { useSpaceId } from "@/hooks/useSpaceId";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { FileMetadata } from "@/types";
import { useVaultReady } from "@/components/spaces/use-vault-ready";
import { useRouter } from "next/navigation";
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
import { Notice, PageShell, ShortcutsHelp, SpaceBreadcrumb } from "@/components/spaces/shared";
import { useSpaceDetail } from "@/components/spaces/use-space";

const NO_FILES: FileMetadata[] = [];

export function SpaceAdd() {
  const t = useTranslations("spaces");
  const shortcuts: [string, string][] = [
    [t("shared.arrowKeys"), t("add.moveBetween")],
    ["Space / Enter", t("add.selectOrOpen")],
    [t("shared.shiftArrow"), t("shared.extendSelection")],
    ["Ctrl/Cmd + A", t("add.selectAllHere")],
    ["Esc", t("shared.clearTheSelection")],
    ["/", t("add.search")],
    ["?", t("shared.showShortcuts")],
  ];
  const id = useSpaceId();
  const router = useRouter();
  const { query, detail, perms } = useSpaceDetail(id);
  const meta = useSpaceMeta(detail ?? undefined);
  const { data: files = NO_FILES, isPending: filesLoading } = useFilesQuery();
  const job = useSpaceAdds((s) => s.jobs[id]);
  const batchLimit = useSpaceBatchLimit();
  const ready = useVaultReady();
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

  const spaceName = meta.name || t("shared.space");
  const crumbs = [
    { label: t("shared.spaces"), href: "/spaces" },
    { label: spaceName, href: spaceHref(id) },
    { label: t("add.crumb") },
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
        <Notice tone="error">{t("shared.loadSpaceError")}</Notice>
      </PageShell>
    );
  }

  const blockedReason = !perms.editFiles
    ? t("add.blockedPerms")
    : detail.needs_rotation
      ? t("add.blockedRotate")
      : null;

  const over = selected.size - batchLimit;
  const overLimit = over > 0;

  const submit = () => {
    if (selected.size === 0 || overLimit || blockedReason) return;
    ready(async () => {
      useSpaceAdds.getState().enqueue(detail, fileIds, spaceName);
      router.push(spaceHref(id));
    });
  };

  return (
    <PageShell>
      <SpaceBreadcrumb crumbs={crumbs} />
      <PageHeader
        title={t("add.crumb")}
        description={t("add.description", { name: spaceName })}
        actions={<ShortcutsHelp items={shortcuts} title={t("add.shortcutsTitle")} />}
      />

      {blockedReason ? (
        <Notice tone="warn">
          {blockedReason}{" "}
          {perms.rotate && detail.needs_rotation && (
            <Link href={spaceHref(id, "/settings", "#rotate")} className="font-medium underline">
              {t("add.rotateLink")}
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
            emptyLabel={t("add.empty")}
            listClassName="max-h-[min(32rem,55dvh)]"
            autoFocusSearch
          />

          {overLimit && (
            <Notice tone="warn">{t("add.overLimit", { limit: batchLimit, over })}</Notice>
          )}
        </div>
      )}

      <div className="sticky bottom-[calc(5rem+var(--safe-bottom))] z-10 md:bottom-0 -mx-3 border-t border-[var(--color-border)] bg-[var(--color-surface)]/95 px-3 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
          <p className="text-sm tabular-nums text-[var(--color-text-secondary)]" aria-live="polite">
            <span className="font-medium text-[var(--color-text)]">
              {t("shared.selectedShort", { count: selected.size })}
            </span>
            {Number.isFinite(batchLimit) && (
              <span className="text-[var(--color-text-muted)]">
                {" "}
                &middot; {t("shared.batchHint", { limit: batchLimit })}
              </span>
            )}
          </p>
          <div className="flex items-center gap-2">
            <Link href={spaceHref(id)} className={buttonClass("ghost", "md")}>
              {t("common.cancel")}
            </Link>
            <Button onClick={submit} disabled={selected.size === 0 || overLimit || !!blockedReason}>
              {selected.size > 0 ? t("add.submitN", { count: selected.size }) : t("add.crumb")}
            </Button>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
