import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { FileMetadata } from "@/types";

const m = vi.hoisted(() => ({
  push: vi.fn(),
  pathname: "/settings",
  unlocked: true,
  files: [] as unknown[],
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: m.push }),
  usePathname: () => m.pathname,
}));
vi.mock("@/components/providers/vault-lock-provider", () => ({
  useVaultLockContext: () => ({ unlocked: m.unlocked }),
}));
vi.mock("@/store/files", () => ({ useFilesQuery: () => ({ data: m.files }) }));
vi.mock("@/hooks/useIsMobile", () => ({ useIsMobile: () => false }));

import { GlobalSearch } from "@/components/ui/global-search";
import { useVaultSearch } from "@/components/ui/command-palette";
import { useRecentlyViewedStore } from "@/store/recently-viewed";

const file = (id: string, name: string) =>
  ({ id, original_name: name, original_size: 1024, folder_id: null }) as FileMetadata;

beforeEach(() => {
  m.pathname = "/settings";
  m.unlocked = true;
  m.files = Array.from({ length: 10 }, (_, i) => file(`f${i}`, `photo-${i}.jpg`));
  useRecentlyViewedStore.setState({
    entries: m.files.map((f, i) => ({ fileId: (f as FileMetadata).id, viewedAt: 1000 - i })),
  });
  useVaultSearch.setState({ query: "", pendingOpen: null });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const input = () => screen.getByRole("combobox");

describe("GlobalSearch", () => {
  it("shows only the six most recent files on focus", () => {
    render(<GlobalSearch />);
    fireEvent.focus(input());
    expect(screen.getByText("Recents")).toBeTruthy();
    expect(screen.getAllByRole("option")).toHaveLength(6);
  });

  it("hides recents while the vault is locked", () => {
    m.unlocked = false;
    render(<GlobalSearch />);
    fireEvent.focus(input());
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("opens a matching file in the vault from another page", () => {
    render(<GlobalSearch />);
    fireEvent.change(input(), { target: { value: "photo-3" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(useVaultSearch.getState().pendingOpen).toBe("f3");
    expect(m.push).toHaveBeenCalledWith("/dashboard");
  });

  it("filters the vault live when typing on the vault page", () => {
    m.pathname = "/dashboard";
    render(<GlobalSearch />);
    fireEvent.change(input(), { target: { value: "photo" } });
    expect(useVaultSearch.getState().query).toBe("photo");
    expect(m.push).not.toHaveBeenCalled();
  });

  it("offers a show-all option that carries the query to the vault", () => {
    render(<GlobalSearch />);
    fireEvent.change(input(), { target: { value: "nothing-here" } });
    expect(screen.getByText("No files match")).toBeTruthy();
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(useVaultSearch.getState().query).toBe("nothing-here");
    expect(m.push).toHaveBeenCalledWith("/dashboard");
  });

  it("focuses with the / shortcut", () => {
    render(<GlobalSearch />);
    fireEvent.keyDown(window, { key: "/" });
    expect(document.activeElement).toBe(input());
  });
});
