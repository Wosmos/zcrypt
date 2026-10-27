"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, type ComponentType, type MouseEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PAGE_SIZES, type AdminList } from "@/hooks/useAdminList";
import { Checkbox } from "@/components/ui/checkbox";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadErrorPanel } from "@/components/admin/load-error-panel";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  MoreHorizontal,
  Search,
  X,
} from "@/lib/icons";

type IconComponent = ComponentType<{ className?: string }>;

export interface DataTableColumn<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Server sort key; the header becomes a sort button when set. */
  sortKey?: string;
  align?: "start" | "end";
  className?: string;
  /** Hidden in the table below this width (cards always show every column). */
  hideBelow?: "lg" | "xl";
  /** Left out of the mobile card (the first column is always its title). */
  card?: false;
}

export interface RowAction {
  label: string;
  icon?: IconComponent;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
}

export interface TableSelection {
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
}

interface DataTableProps<T> {
  label: string;
  rows: T[];
  rowKey: (row: T) => string;
  columns: DataTableColumn<T>[];
  list: AdminList;
  total: number;
  loading: boolean;
  fetching?: boolean;
  error: boolean;
  onRetry: () => void;
  empty: { icon: ReactNode; title: string; description: string };
  /** The whole row opens this page; the first cell holds the real link. */
  rowHref?: (row: T) => string;
  /** The whole row runs this instead (a drawer); used when there is no page. */
  onRowOpen?: (row: T) => void;
  rowActions?: (row: T) => RowAction[];
  selection?: TableSelection;
  title?: ReactNode;
  toolbar?: ReactNode;
  /** Content between the title bar and the rows, such as an add form. */
  subheader?: ReactNode;
}

// Clicks on these never navigate the row: they do their own thing.
const INTERACTIVE =
  "a,button,input,select,textarea,label,[role=menuitem],[role=checkbox],[data-row-stop]";

function fromInteractive(e: MouseEvent) {
  return (e.target as Element).closest(INTERACTIVE) !== null;
}

const ALIGN = { start: "text-start", end: "text-end" } as const;
const HIDE = { lg: "hidden lg:table-cell", xl: "hidden xl:table-cell" } as const;

function SortHeader({
  label,
  sortKey,
  list,
}: {
  label: ReactNode;
  sortKey: string;
  list: AdminList;
}) {
  const t = useTranslations("admin.table");
  const active = list.sort === sortKey;
  const Icon = !active ? ArrowUpDown : list.order === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => list.toggleSort(sortKey)}
      aria-label={t("sortBy", { column: typeof label === "string" ? label : sortKey })}
      className={cn(
        "-mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 uppercase tracking-wider transition-colors hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40",
        active && "text-[var(--color-text)]",
      )}
    >
      {label}
      <Icon className={cn("h-3 w-3", !active && "opacity-40")} />
    </button>
  );
}

/** Kebab menu of a row's actions. Keyboard reachable; never opens the row. */
export function RowActionsMenu({ actions, label }: { actions: RowAction[]; label: string }) {
  if (actions.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          data-row-stop
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40 data-[state=open]:bg-[var(--color-surface-2)] data-[state=open]:text-[var(--color-text)]"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[11rem]">
        {actions.map((a) => (
          <div key={a.label}>
            {a.separatorBefore && <DropdownMenuSeparator />}
            <DropdownMenuItem
              disabled={a.disabled}
              onSelect={a.onSelect}
              className={cn(a.destructive && "text-red-600 focus:text-red-600 dark:text-red-400")}
            >
              {a.icon && <a.icon className="h-4 w-4" />}
              {a.label}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Debounced search box bound to an admin list. */
export function TableSearch({ list, placeholder }: { list: AdminList; placeholder: string }) {
  const t = useTranslations("admin.table");
  return (
    <div className="relative w-full sm:w-64">
      <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
      <input
        type="search"
        value={list.search}
        onChange={(e) => list.setSearch(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] ps-9 pe-8 text-sm text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)]/40 focus:ring-2 focus:ring-[var(--color-accent)]/10 [&::-webkit-search-cancel-button]:hidden"
      />
      {list.search && (
        <button
          type="button"
          onClick={() => list.setSearch("")}
          aria-label={t("clearSearch")}
          className="absolute end-1.5 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** A labelled select filter bound to one of an admin list's filters. */
export function TableFilter({
  list,
  name,
  label,
  options,
}: {
  list: AdminList;
  name: string;
  label: string;
  options: { value: string; label: string }[];
}) {
  const t = useTranslations("admin.table");
  return (
    <Select
      value={list.filters[name] || "__all"}
      onValueChange={(v) => list.setFilter(name, v === "__all" ? "" : v)}
    >
      <SelectTrigger className="h-9 w-full rounded-lg text-xs sm:w-40" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all">{t("allOf", { label })}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** A table's heading: icon, title and how many rows match. */
export function TableTitle({
  icon: Icon,
  title,
  count,
}: {
  icon: IconComponent;
  title: string;
  count: number;
}) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-[var(--color-text)]">
      <Icon className="h-4 w-4 text-[var(--color-text-muted)]" />
      {title}
      <span className="text-xs font-normal tabular-nums text-[var(--color-text-muted)]">
        {count.toLocaleString()}
      </span>
    </h2>
  );
}

/** Sticky bar for acting on the checked rows of a table. */
export function BulkBar({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear: () => void;
  children: ReactNode;
}) {
  const t = useTranslations("admin.table");
  if (count === 0) return null;
  return (
    <div
      role="toolbar"
      aria-label={t("bulkLabel")}
      className="sticky bottom-4 z-30 mx-auto flex w-fit max-w-full flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/95 px-2.5 py-2 shadow-2xl backdrop-blur"
    >
      <span className="px-2 text-sm font-medium tabular-nums text-[var(--color-text)]">
        {t("selected", { count })}
      </span>
      <span aria-hidden className="h-5 w-px bg-[var(--color-border)]" />
      {children}
      <button
        type="button"
        onClick={onClear}
        aria-label={t("clearSelection")}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function SkeletonRows({ columns }: { columns: number }) {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <tr key={i} className="border-b border-[var(--color-border)] last:border-0">
          {Array.from({ length: columns }).map((__, j) => (
            <td key={j} className="px-4 py-3.5">
              <Skeleton className={cn("h-3.5 rounded-md", j === 0 ? "w-40" : "w-16")} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function TableFooter({ list, total }: { list: AdminList; total: number }) {
  const t = useTranslations("admin.table");
  const start = total === 0 ? 0 : (list.page - 1) * list.pageSize + 1;
  const end = Math.min(list.page * list.pageSize, total);
  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-[var(--color-border)] px-4 py-3 sm:flex-row">
      <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
        <span className="tabular-nums">{t("range", { start, end, total })}</span>
        <span aria-hidden className="h-4 w-px bg-[var(--color-border)]" />
        <label className="flex items-center gap-2">
          {t("rowsPerPage")}
          <Select value={String(list.pageSize)} onValueChange={(v) => list.setPageSize(Number(v))}>
            <SelectTrigger
              className="h-8 w-[4.5rem] rounded-lg text-xs"
              aria-label={t("rowsPerPage")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>
      <Pagination
        currentPage={list.page}
        totalPages={Math.max(1, Math.ceil(total / list.pageSize))}
        onPageChange={list.setPage}
        totalItems={total}
        pageSize={list.pageSize}
        summary={false}
      />
    </div>
  );
}

/**
 * The admin console's table: server-side sort, paging and search through an
 * {@link AdminList}, optional row selection and a per-row actions menu, and
 * rows that open a page (cmd/ctrl/middle click open it in a new tab) or a
 * drawer. Below the md breakpoint the rows render as cards.
 */
export function DataTable<T>({
  label,
  rows,
  rowKey,
  columns,
  list,
  total,
  loading,
  fetching = false,
  error,
  onRetry,
  empty,
  rowHref,
  onRowOpen,
  rowActions,
  selection,
  title,
  toolbar,
  subheader,
}: DataTableProps<T>) {
  const t = useTranslations("admin.table");
  const router = useRouter();
  const { clampTo } = list;
  const paramsKey = JSON.stringify(list.params);
  const clearSelection = selection?.onChange;

  useEffect(() => {
    if (!loading) clampTo(total);
  }, [loading, total, clampTo]);

  // A selection belongs to the rows on screen: another page, sort or filter
  // drops it, so a bulk action never reaches rows the admin cannot see.
  useEffect(() => {
    clearSelection?.(new Set());
  }, [paramsKey, clearSelection]);

  const keys = rows.map(rowKey);
  const checked = selection ? keys.filter((k) => selection.selected.has(k)).length : 0;
  const pageState = checked === 0 ? false : checked === keys.length ? true : "indeterminate";
  const togglePage = () => {
    if (!selection) return;
    const next = new Set(selection.selected);
    for (const k of keys) {
      if (pageState === true) next.delete(k);
      else next.add(k);
    }
    selection.onChange(next);
  };
  const toggleRow = (k: string) => {
    if (!selection) return;
    const next = new Set(selection.selected);
    if (!next.delete(k)) next.add(k);
    selection.onChange(next);
  };

  const open = (row: T, e: MouseEvent, newTab: boolean) => {
    if (fromInteractive(e) || window.getSelection()?.toString()) return;
    const href = rowHref?.(row);
    if (href) {
      if (newTab) window.open(href, "_blank", "noopener");
      else router.push(href);
    } else onRowOpen?.(row);
  };
  const clickable = Boolean(rowHref || onRowOpen);

  const primary = (row: T) => {
    const content = columns[0].cell(row);
    const href = rowHref?.(row);
    if (href) {
      return (
        <Link
          href={href}
          className="block min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
        >
          {content}
        </Link>
      );
    }
    if (onRowOpen) {
      return (
        <button
          type="button"
          onClick={() => onRowOpen(row)}
          className="block w-full min-w-0 rounded-md text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
        >
          {content}
        </button>
      );
    }
    return content;
  };

  const rowProps = (row: T) =>
    clickable
      ? {
          onClick: (e: MouseEvent) => open(row, e, e.metaKey || e.ctrlKey || e.shiftKey),
          onAuxClick: (e: MouseEvent) => {
            if (e.button === 1) open(row, e, true);
          },
        }
      : {};

  const showEmpty = !loading && !error && rows.length === 0;
  const showError = error && rows.length === 0;
  const span = columns.length + (selection ? 1 : 0) + (rowActions ? 1 : 0);

  return (
    <section className="panel overflow-hidden" aria-label={label}>
      {(title || toolbar) && (
        <div className="flex flex-col gap-3 border-b border-[var(--color-border)] px-4 py-3.5 lg:flex-row lg:items-center lg:justify-between">
          {title && <div className="min-w-0">{title}</div>}
          {toolbar && (
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:justify-end">
              {toolbar}
            </div>
          )}
        </div>
      )}

      {subheader}

      {showError ? (
        <div className="p-4">
          <LoadErrorPanel
            icon={<AlertTriangle className="h-7 w-7 text-[var(--color-text-muted)]" />}
            title={t("errorTitle")}
            description={t("errorDesc")}
            onRetry={onRetry}
          />
        </div>
      ) : showEmpty ? (
        <EmptyState
          icon={empty.icon}
          title={list.q || Object.values(list.filters).some(Boolean) ? t("noMatches") : empty.title}
          description={
            list.q || Object.values(list.filters).some(Boolean)
              ? t("noMatchesDesc")
              : empty.description
          }
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm" aria-label={label} aria-busy={loading || fetching}>
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-1)]/60 text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                  {selection && (
                    <th className="w-10 py-2.5 ps-4">
                      <Checkbox
                        checked={pageState}
                        onCheckedChange={togglePage}
                        aria-label={t("selectPage")}
                        disabled={rows.length === 0}
                      />
                    </th>
                  )}
                  {columns.map((c) => (
                    <th
                      key={c.id}
                      scope="col"
                      aria-sort={
                        c.sortKey && list.sort === c.sortKey
                          ? list.order === "asc"
                            ? "ascending"
                            : "descending"
                          : undefined
                      }
                      className={cn(
                        "px-4 py-2.5 font-medium",
                        ALIGN[c.align ?? "start"],
                        c.hideBelow && HIDE[c.hideBelow],
                        c.className,
                      )}
                    >
                      {c.sortKey ? (
                        <SortHeader label={c.header} sortKey={c.sortKey} list={list} />
                      ) : (
                        c.header
                      )}
                    </th>
                  ))}
                  {rowActions && (
                    <th className="w-12 py-2.5 pe-3">
                      <span className="sr-only">{t("actions")}</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className={cn("transition-opacity", fetching && !loading && "opacity-60")}>
                {loading && rows.length === 0 ? (
                  <SkeletonRows columns={span} />
                ) : (
                  rows.map((row) => {
                    const k = rowKey(row);
                    const isChecked = selection?.selected.has(k) ?? false;
                    return (
                      <tr
                        key={k}
                        data-state={isChecked ? "selected" : undefined}
                        {...rowProps(row)}
                        className={cn(
                          "group border-b border-[var(--color-border)] transition-colors last:border-0 focus-within:bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-1)]",
                          clickable && "cursor-pointer",
                          isChecked &&
                            "bg-[var(--color-accent)]/[0.06] hover:bg-[var(--color-accent)]/10",
                        )}
                      >
                        {selection && (
                          <td className="w-10 py-3 ps-4">
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={() => toggleRow(k)}
                              aria-label={t("selectRow")}
                            />
                          </td>
                        )}
                        {columns.map((c, i) => (
                          <td
                            key={c.id}
                            className={cn(
                              "px-4 py-3 align-middle",
                              ALIGN[c.align ?? "start"],
                              c.hideBelow && HIDE[c.hideBelow],
                              c.className,
                            )}
                          >
                            {i === 0 ? primary(row) : c.cell(row)}
                          </td>
                        ))}
                        {rowActions && (
                          <td className="w-12 py-3 pe-3 text-end">
                            <RowActionsMenu actions={rowActions(row)} label={t("rowActions")} />
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <ul
            className={cn(
              "divide-y divide-[var(--color-border)] md:hidden",
              fetching && !loading && "opacity-60",
            )}
          >
            {loading && rows.length === 0
              ? Array.from({ length: 4 }).map((_, i) => (
                  <li key={i} className="space-y-2 p-4">
                    <Skeleton className="h-4 w-2/5 rounded-md" />
                    <Skeleton className="h-3 w-3/5 rounded-md" />
                  </li>
                ))
              : rows.map((row) => {
                  const k = rowKey(row);
                  return (
                    <li
                      key={k}
                      {...rowProps(row)}
                      className={cn(
                        "flex gap-3 p-4 transition-colors active:bg-[var(--color-surface-1)]",
                        clickable && "cursor-pointer",
                      )}
                    >
                      {selection && (
                        <div className="pt-0.5">
                          <Checkbox
                            checked={selection.selected.has(k)}
                            onCheckedChange={() => toggleRow(k)}
                            aria-label={t("selectRow")}
                          />
                        </div>
                      )}
                      <div className="min-w-0 flex-1 space-y-2.5">
                        <div className="min-w-0">{primary(row)}</div>
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                          {columns.slice(1).map((c) =>
                            c.card === false ? null : (
                              <div key={c.id} className="min-w-0">
                                <dt className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                                  {c.header}
                                </dt>
                                <dd className="mt-0.5 min-w-0 text-[var(--color-text-secondary)]">
                                  {c.cell(row)}
                                </dd>
                              </div>
                            ),
                          )}
                        </dl>
                      </div>
                      {rowActions && (
                        <div className="-me-1 -mt-1">
                          <RowActionsMenu actions={rowActions(row)} label={t("rowActions")} />
                        </div>
                      )}
                    </li>
                  );
                })}
          </ul>
        </>
      )}

      {(total > 0 || list.page > 1) && <TableFooter list={list} total={total} />}
    </section>
  );
}
