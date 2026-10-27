import { useCallback, useEffect, useState } from "react";
import type { AdminListParams } from "@/lib/api";

export type SortOrder = "asc" | "desc";

/** Page sizes offered by every admin table. */
export const PAGE_SIZES = [10, 25, 50, 100] as const;

/** How long the search box waits after the last keystroke before it queries. */
export const SEARCH_DEBOUNCE_MS = 300;

export interface AdminListState {
  page: number;
  pageSize: number;
  search: string;
  sort: string;
  order: SortOrder;
  filters: Record<string, string>;
}

export interface AdminListDefaults {
  sort: string;
  order?: SortOrder;
  pageSize?: number;
  filters?: Record<string, string>;
}

// Each list's state outlives the component, so leaving a table for a user's
// page and coming back lands on the same page, search and sort.
const remembered = new Map<string, AdminListState>();

/** Forget every remembered list state. */
export function resetAdminLists() {
  remembered.clear();
}

function initial(id: string, d: AdminListDefaults): AdminListState {
  return (
    remembered.get(id) ?? {
      page: 1,
      pageSize: d.pageSize ?? 25,
      search: "",
      sort: d.sort,
      order: d.order ?? "desc",
      filters: d.filters ?? {},
    }
  );
}

/**
 * Paging, search, sort and filter state for one server-side admin table.
 * Every change but a page change goes back to page 1; the search is debounced
 * before it reaches `params`, which is what the list endpoint is called with.
 */
export function useAdminList(id: string, defaults: AdminListDefaults) {
  const [state, setState] = useState(() => initial(id, defaults));
  const [q, setQ] = useState(state.search.trim());

  useEffect(() => {
    remembered.set(id, state);
  }, [id, state]);

  useEffect(() => {
    const next = state.search.trim();
    const timer = setTimeout(() => setQ(next), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [state.search]);

  const setPage = useCallback(
    (page: number) => setState((prev) => ({ ...prev, page: Math.max(1, page) })),
    [],
  );
  const setPageSize = useCallback(
    (pageSize: number) => setState((prev) => ({ ...prev, page: 1, pageSize })),
    [],
  );
  const setSearch = useCallback(
    (search: string) => setState((prev) => ({ ...prev, page: 1, search })),
    [],
  );
  const setFilter = useCallback(
    (name: string, value: string) =>
      setState((prev) =>
        prev.filters[name] === value
          ? prev
          : { ...prev, page: 1, filters: { ...prev.filters, [name]: value } },
      ),
    [],
  );
  const toggleSort = useCallback(
    (key: string) =>
      setState((prev) => ({
        ...prev,
        page: 1,
        sort: key,
        order: prev.sort === key && prev.order === "desc" ? "asc" : "desc",
      })),
    [],
  );
  const setSort = useCallback(
    (sort: string, order: SortOrder) => setState((prev) => ({ ...prev, page: 1, sort, order })),
    [],
  );
  const clampTo = useCallback(
    (total: number) =>
      setState((prev) => {
        const last = Math.max(1, Math.ceil(total / prev.pageSize));
        return prev.page > last ? { ...prev, page: last } : prev;
      }),
    [],
  );

  const params: AdminListParams = {
    limit: state.pageSize,
    offset: (state.page - 1) * state.pageSize,
    q,
    sort: state.sort,
    order: state.order,
    ...state.filters,
  };

  return {
    ...state,
    q,
    params,
    setPage,
    setPageSize,
    setSearch,
    setFilter,
    toggleSort,
    setSort,
    /** Steps back to the last page when the current one no longer exists (rows were deleted). */
    clampTo,
  };
}

export type AdminList = ReturnType<typeof useAdminList>;
