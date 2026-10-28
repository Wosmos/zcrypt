import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { PAGE_SIZES, SEARCH_DEBOUNCE_MS, resetAdminLists, useAdminList } from "@/hooks/useAdminList";

describe("useAdminList", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetAdminLists();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts on page 1 with the defaults and builds the query params", () => {
    const { result } = renderHook(() => useAdminList("a", { sort: "created_at" }));
    expect(result.current.page).toBe(1);
    expect(result.current.pageSize).toBe(25);
    expect(result.current.params).toEqual({ limit: 25, offset: 0, q: "", sort: "created_at", order: "desc" });
    expect(PAGE_SIZES).toContain(25);
  });

  it("honours a default order, page size and filters", () => {
    const { result } = renderHook(() =>
      useAdminList("b", { sort: "rating", order: "asc", pageSize: 10, filters: { status: "pending" } }),
    );
    expect(result.current.params).toEqual({
      limit: 10,
      offset: 0,
      q: "",
      sort: "rating",
      order: "asc",
      status: "pending",
    });
  });

  it("pages, and every other change returns to page 1", () => {
    const { result } = renderHook(() => useAdminList("c", { sort: "created_at" }));
    act(() => result.current.setPage(3));
    expect(result.current.params.offset).toBe(50);
    act(() => result.current.setPage(0));
    expect(result.current.page).toBe(1);

    act(() => result.current.setPage(4));
    act(() => result.current.setPageSize(50));
    expect(result.current.page).toBe(1);
    expect(result.current.params.limit).toBe(50);

    act(() => result.current.setPage(2));
    act(() => result.current.setFilter("country", "DE"));
    expect(result.current.page).toBe(1);
    expect(result.current.params.country).toBe("DE");

    act(() => result.current.setPage(2));
    act(() => result.current.setFilter("country", "DE"));
    expect(result.current.page).toBe(2);
  });

  it("debounces the search before it reaches the params", () => {
    const { result } = renderHook(() => useAdminList("d", { sort: "created_at" }));
    act(() => result.current.setPage(2));
    act(() => result.current.setSearch("  ali "));
    expect(result.current.search).toBe("  ali ");
    expect(result.current.page).toBe(1);
    expect(result.current.params.q).toBe("");
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(result.current.q).toBe("ali");
    expect(result.current.params.q).toBe("ali");
  });

  it("flips the order on the active column and starts a new column descending", () => {
    const { result } = renderHook(() => useAdminList("e", { sort: "created_at" }));
    act(() => result.current.toggleSort("created_at"));
    expect(result.current.order).toBe("asc");
    act(() => result.current.toggleSort("created_at"));
    expect(result.current.order).toBe("desc");
    act(() => result.current.toggleSort("username"));
    expect(result.current.sort).toBe("username");
    expect(result.current.order).toBe("desc");
    act(() => result.current.setSort("email", "asc"));
    expect(result.current.params).toMatchObject({ sort: "email", order: "asc" });
  });

  it("steps back to the last page that still exists", () => {
    const { result } = renderHook(() => useAdminList("f", { sort: "created_at", pageSize: 10 }));
    act(() => result.current.setPage(5));
    act(() => result.current.clampTo(45));
    expect(result.current.page).toBe(5);
    act(() => result.current.clampTo(31));
    expect(result.current.page).toBe(4);
    act(() => result.current.clampTo(0));
    expect(result.current.page).toBe(1);
  });

  it("remembers a list's state across remounts", () => {
    const first = renderHook(() => useAdminList("g", { sort: "created_at" }));
    act(() => first.result.current.setSearch("bob"));
    act(() => first.result.current.setPage(3));
    first.unmount();
    const again = renderHook(() => useAdminList("g", { sort: "created_at" }));
    expect(again.result.current.page).toBe(3);
    expect(again.result.current.search).toBe("bob");
    expect(again.result.current.q).toBe("bob");
  });
});
