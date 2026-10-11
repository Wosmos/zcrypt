import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { installDomStubs, renderWithQuery } from "./test-utils";

const { api, spaces, nav, adds, limit, files } = vi.hoisted(() => ({
  api: { getSharedVault: vi.fn(), listFolders: vi.fn() },
  spaces: { warmSpaceKeys: vi.fn() },
  nav: { push: vi.fn() },
  adds: { enqueue: vi.fn() },
  limit: { value: 2 },
  files: {
    result: {
      data: [1, 2, 3, 4].map((n) => ({
        id: `f${n}`,
        original_name: `file-${n}.txt`,
        original_size: n,
        folder_id: null,
      })),
      isPending: false,
    },
  },
}));

vi.mock("@/lib/api", () => api);
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "s1" }),
  useRouter: () => ({ push: nav.push }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("@/lib/spaces", async (orig) => ({
  ...(await orig<typeof import("@/lib/spaces")>()),
  warmSpaceKeys: spaces.warmSpaceKeys,
}));
vi.mock("@/store/auth", () => {
  const state = { user: { id: "u1" } };
  return {
    useAuthStore: Object.assign((sel: (s: typeof state) => unknown) => sel(state), {
      getState: () => state,
    }),
  };
});
vi.mock("@/store/files", () => ({ useFilesQuery: () => files.result }));
vi.mock("@/store/space-adds", () => ({
  useSpaceAdds: Object.assign(
    (sel: (s: { jobs: Record<string, never> }) => unknown) => sel({ jobs: {} }),
    { getState: () => adds },
  ),
}));
vi.mock("@/hooks/useSpaceBatchLimit", () => ({ useSpaceBatchLimit: () => limit.value }));
vi.mock("@/hooks/useSpaceMeta", () => ({
  useSpaceMeta: (v?: { name: string }) =>
    v
      ? { name: v.name.replace(/^s1:/, ""), description: "", ready: true }
      : { name: "", description: "", ready: false },
}));
vi.mock("@/lib/query-client", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  return { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) };
});

import { SpaceAdd } from "@/components/spaces/space-add";

const detail = {
  id: "s1",
  name: "s1:Atlas",
  description: "",
  owner_id: "u1",
  role: "editor",
  file_ids: [],
  created_at: "",
  updated_at: "",
  size_limit_bytes: 0,
  members: [],
  files: [{ file_id: "f4", wrapped_cek: "c", added_at: "2026-10-01T00:00:00Z" }],
};

beforeEach(() => {
  installDomStubs();
  vi.clearAllMocks();
  limit.value = 2;
  api.listFolders.mockResolvedValue([]);
  api.getSharedVault.mockResolvedValue(detail);
});
afterEach(cleanup);

async function ready() {
  renderWithQuery(<SpaceAdd />);
  await screen.findByText("file-1.txt");
  return screen.getByRole("listbox", { name: "Your files" });
}

describe("SpaceAdd", () => {
  it("lists only files not already in the space", async () => {
    await ready();
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(screen.queryByText("file-4.txt")).not.toBeInTheDocument();
  });

  it("disables Add above the plan batch limit with a clear message", async () => {
    const list = await ready();
    screen.getAllByRole("option")[0].focus();
    fireEvent.keyDown(list, { key: "a", ctrlKey: true });

    expect(screen.getByText("3 selected")).toBeInTheDocument();
    expect(screen.getByText(/adds up to 2 files at a time/i)).toBeInTheDocument();
    expect(screen.getByText(/deselect 1 file to continue/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add 3 files/i })).toBeDisabled();
  });

  it("enqueues in the background and returns to the space; warms keys after a pause", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await ready();
      const opts = screen.getAllByRole("option");
      fireEvent.click(opts[0]);
      fireEvent.click(opts[1]);
      await act(async () => {
        vi.advanceTimersByTime(350);
      });
      expect(spaces.warmSpaceKeys).toHaveBeenCalledTimes(1);
      expect(spaces.warmSpaceKeys.mock.calls[0][0].sort()).toEqual(["f1", "f2"]);

      const add = screen.getByRole("button", { name: /add 2 files/i });
      expect(add).toBeEnabled();
      fireEvent.click(add);
      expect(adds.enqueue).toHaveBeenCalledTimes(1);
      const [v, ids, name] = adds.enqueue.mock.calls[0];
      expect(v.id).toBe("s1");
      expect([...ids].sort()).toEqual(["f1", "f2"]);
      expect(name).toBe("Atlas");
      await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/spaces/s1"));
    } finally {
      vi.useRealTimers();
    }
  });
});
