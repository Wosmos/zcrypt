"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { FileMetadata } from "@/types";
import { useFileList } from "@/hooks/useFileList";
import { useFolders } from "@/hooks/useFolders";
import { StatCard } from "@/components/ui/stat-card";
import { Section } from "@/components/ui/section";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatBytes, formatDate, getFileTypeInfo } from "@/lib/utils";
import {
  File, FileText, Image, Video, Music, Archive, Code, Cog, Table,
  Folder as FolderIcon, ShieldCheck, HardDrive, TrendingDown, Sparkles,
} from "@/lib/icons";

type IconComponent = typeof File;

const iconMap: Record<string, IconComponent> = {
  File, FileText, Image, Video, Music, Archive, Code, Cog, Table,
};

/** How many recent files + top-level folders to surface in the row. */
const MAX_FILES = 4;
const MAX_FOLDERS = 4;

interface QuickAccessProps {
  /** Open a file's details drawer. */
  onOpenFile: (file: FileMetadata) => void;
}

/**
 * "Quick access" strip for the top of the vault: a complementary stat trio
 * (files, space saved, encryption) plus a responsive row of the most recent
 * files and top-level folders. Files open the details drawer; folders open
 * in the folder browser. Complements — does not duplicate — the sidebar
 * storage meter.
 */
export function QuickAccess({ onOpenFile }: QuickAccessProps) {
  const reduce = useReducedMotion() ?? false;
  const { files, loading: filesLoading } = useFileList();
  const {
    folders,
    loading: foldersLoading,
    openFolder,
    currentFolderId,
  } = useFolders();

  // Only surface quick access at the vault root — inside a folder the browser
  // already shows that folder's contents.
  const atRoot = currentFolderId === null;

  // Most-recent root-level files by created_at.
  const recentFiles = useMemo(() => {
    return files
      .filter((f) => (f.folder_id ?? null) === null)
      .slice()
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      .slice(0, MAX_FILES);
  }, [files]);

  // Complementary stats — distinct from the sidebar storage meter.
  const fileCount = files.length;
  const totalOriginal = useMemo(
    () => files.reduce((sum, f) => sum + f.original_size, 0),
    [files]
  );
  const totalEncrypted = useMemo(
    () => files.reduce((sum, f) => sum + f.encrypted_size, 0),
    [files]
  );
  const savedBytes = Math.max(0, totalOriginal - totalEncrypted);
  const savedPct =
    totalOriginal > 0 ? Math.round((savedBytes / totalOriginal) * 100) : 0;

  const topFolders = folders.slice(0, MAX_FOLDERS);

  const loading = filesLoading || foldersLoading;
  const isEmpty =
    !loading && recentFiles.length === 0 && topFolders.length === 0;

  // Don't render the row when navigated into a subfolder.
  if (!atRoot) return null;

  const transition = reduce
    ? { duration: 0 }
    : { duration: 0.25, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] };

  return (
    <div className="space-y-6">
      {/* Complementary stat trio */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="panel flex items-start gap-4 p-5">
              <Skeleton className="h-10 w-10 flex-shrink-0 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-20 rounded-md" />
                <Skeleton className="h-6 w-24 rounded-md" />
              </div>
            </div>
          ))
        ) : (
          <>
            <StatCard
              label="Files"
              value={fileCount.toLocaleString()}
              hint={fileCount === 1 ? "encrypted item" : "encrypted items"}
              icon={HardDrive}
            />
            <StatCard
              label="Space saved"
              value={formatBytes(savedBytes)}
              hint={savedPct > 0 ? `${savedPct}% by compression` : "before upload"}
              icon={TrendingDown}
            />
            <StatCard
              label="Encryption"
              value="AES-256"
              hint="end-to-end, client-side"
              icon={ShieldCheck}
              accent
            />
          </>
        )}
      </div>

      {/* Quick access row */}
      <Section
        title="Quick access"
        description="Your latest files and top-level folders."
      >
        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <QuickCardSkeleton key={i} />
            ))}
          </div>
        ) : isEmpty ? (
          <div className="panel flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-surface-1)] text-[var(--color-text-muted)] ring-1 ring-[var(--color-border)]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-[var(--color-text)]">
                Your vault is empty
              </p>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Upload a file or create a folder to see it surface here.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {topFolders.map((folder, i) => (
              <motion.div
                key={folder.id}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...transition, delay: reduce ? 0 : i * 0.03 }}
              >
                <FolderCard name={folder.name} onOpen={() => openFolder(folder)} />
              </motion.div>
            ))}
            {recentFiles.map((file, i) => (
              <motion.div
                key={file.id}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  ...transition,
                  delay: reduce ? 0 : (topFolders.length + i) * 0.03,
                }}
              >
                <FileQuickCard file={file} onOpen={() => onOpenFile(file)} />
              </motion.div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function QuickCardSkeleton() {
  return (
    <div className="panel flex flex-col gap-3 p-4">
      <Skeleton className="h-10 w-10 rounded-xl" />
      <div className="space-y-2">
        <Skeleton className="h-3.5 w-3/4 rounded-md" />
        <Skeleton className="h-3 w-1/2 rounded-md" />
      </div>
    </div>
  );
}

interface CardShellProps {
  icon: IconComponent;
  iconClassName: string;
  iconChipClassName: string;
  name: string;
  meta: string;
  ariaLabel: string;
  onOpen: () => void;
}

/** Shared interactive quick-access card: type chip, truncated name, meta line. */
function CardShell({
  icon: Icon,
  iconClassName,
  iconChipClassName,
  name,
  meta,
  ariaLabel,
  onOpen,
}: CardShellProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={ariaLabel}
      className={cn(
        "panel group flex w-full items-center gap-3 p-3.5 text-left transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-md hover:ring-1 hover:ring-[var(--color-border-hover)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
        "active:translate-y-0 active:shadow-sm"
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ring-1 transition-colors",
          iconChipClassName
        )}
      >
        <Icon className={cn("h-5 w-5", iconClassName)} />
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="truncate text-sm font-medium text-[var(--color-text)]">
          {name}
        </p>
        <p className="truncate text-xs tabular-nums text-[var(--color-text-muted)]">
          {meta}
        </p>
      </div>
    </button>
  );
}

function FolderCard({ name, onOpen }: { name: string; onOpen: () => void }) {
  return (
    <CardShell
      icon={FolderIcon}
      iconClassName="text-[var(--color-accent)]"
      iconChipClassName="bg-[var(--color-accent)]/10 text-[var(--color-accent)] ring-[var(--color-accent)]/20 group-hover:bg-[var(--color-accent)]/15"
      name={name}
      meta="Folder"
      ariaLabel={`Open folder ${name}`}
      onOpen={onOpen}
    />
  );
}

function FileQuickCard({
  file,
  onOpen,
}: {
  file: FileMetadata;
  onOpen: () => void;
}) {
  const info = getFileTypeInfo(file.original_name);
  const Icon = iconMap[info.icon] ?? File;
  return (
    <CardShell
      icon={Icon}
      iconClassName={info.color}
      iconChipClassName={cn(info.bg, "ring-[var(--color-border)]")}
      name={file.original_name}
      meta={`${formatBytes(file.original_size)} · ${formatDate(file.created_at)}`}
      ariaLabel={`Open details for ${file.original_name}`}
      onOpen={onOpen}
    />
  );
}
