import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { resetAdminLists, useAdminList, type AdminList } from "@/hooks/useAdminList";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

type Row = { id: string; name: string; size: number };
const rows: Row[] = [
  { id: "a", name: "Alice", size: 2 },
  { id: "b", name: "Bob", size: 5 },
];
const columns: DataTableColumn<Row>[] = [
  { id: "name", header: "Name", sortKey: "name", cell: (r) => r.name },
  { id: "size", header: "Size", sortKey: "size", align: "end", cell: (r) => String(r.size) },
];

function makeList(): AdminList {
  return renderHook(() => useAdminList("t", { sort: "name" })).result.current;
}

function table(over: Partial<Parameters<typeof DataTable<Row>>[0]> = {}) {
  const list = over.list ?? makeList();
  return render(
    <DataTable<Row>
      label="People"
      rows={rows}
      rowKey={(r) => r.id}
      columns={columns}
      list={list}
      total={2}
      loading={false}
      error={false}
      onRetry={vi.fn()}
      empty={{ icon: null, title: "Nobody", description: "No people" }}
      {...over}
    />,
  );
}

describe("DataTable", () => {
  beforeEach(() => {
    resetAdminLists();
    push.mockClear();
  });
  afterEach(cleanup);

  it("renders headers, rows and a page summary", () => {
    table();
    const t = screen.getByRole("table", { name: "People" });
    expect(within(t).getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("1-2 of 2")).toBeInTheDocument();
  });

  it("sorts through the list and marks the active column", () => {
    const list = makeList();
    const toggle = vi.spyOn(list, "toggleSort");
    table({ list: { ...list, toggleSort: toggle } });
    const header = screen.getByRole("columnheader", { name: /Name/ });
    expect(header).toHaveAttribute("aria-sort", "descending");
    fireEvent.click(screen.getByRole("button", { name: "Sort by Size" }));
    expect(toggle).toHaveBeenCalledWith("size");
  });

  it("makes the primary cell a real link and the whole row clickable", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    table({ rowHref: (r) => `/people/${r.id}` });
    const t = screen.getByRole("table");
    const link = within(t).getByRole("link", { name: "Bob" });
    expect(link).toHaveAttribute("href", "/people/b");
    const row = link.closest("tr")!;
    expect(row.className).toContain("cursor-pointer");
    fireEvent.click(within(row).getByText("5"));
    expect(push).toHaveBeenCalledWith("/people/b");
    fireEvent.click(within(row).getByText("5"), { metaKey: true });
    expect(open).toHaveBeenCalledWith("/people/b", "_blank", "noopener");
    fireEvent(within(row).getByText("5"), new MouseEvent("auxclick", { bubbles: true, button: 1 }));
    expect(open).toHaveBeenCalledTimes(2);
    open.mockRestore();
  });

  it("opens a drawer row and keeps the actions menu from opening the row", () => {
    const onRowOpen = vi.fn();
    const onSelect = vi.fn();
    table({ onRowOpen, rowActions: () => [{ label: "Archive", onSelect }] });
    const t = screen.getByRole("table");
    fireEvent.click(within(t).getAllByText("2")[0]);
    expect(onRowOpen).toHaveBeenCalledWith(rows[0]);
    onRowOpen.mockClear();
    const kebab = within(t).getAllByRole("button", { name: "Row actions" })[0];
    fireEvent.click(kebab);
    expect(onRowOpen).not.toHaveBeenCalled();
  });

  it("selects one row or the whole page", () => {
    const onChange = vi.fn();
    table({ selection: { selected: new Set(["a"]), onChange } });
    onChange.mockClear();
    const t = screen.getByRole("table");
    fireEvent.click(within(t).getByRole("checkbox", { name: "Select every row on this page" }));
    expect(onChange).toHaveBeenLastCalledWith(new Set(["a", "b"]));
    fireEvent.click(within(t).getAllByRole("checkbox", { name: "Select row" })[0]);
    expect(onChange).toHaveBeenLastCalledWith(new Set());
  });

  it("shows the empty, no-match and error states", () => {
    const { unmount } = table({ rows: [], total: 0 });
    expect(screen.getByText("Nobody")).toBeInTheDocument();
    unmount();
    const list = { ...makeList(), q: "zzz" };
    const second = table({ rows: [], total: 0, list });
    expect(screen.getByText("Nothing matches")).toBeInTheDocument();
    second.unmount();
    const onRetry = vi.fn();
    table({ rows: [], total: 0, error: true, onRetry });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalled();
  });
});
