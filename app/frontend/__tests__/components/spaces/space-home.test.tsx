import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { installDomStubs, renderWithQuery } from "./test-utils";

const { api, spaces, auth, toast } = vi.hoisted(() => ({
  api: { getSharedVault: vi.fn() },
  spaces: { unshareFileFromSpace: vi.fn(), downloadSpaceFile: vi.fn() },
  auth: { user: { id: "u1" } },
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const runReady = (action: () => Promise<void>) => {
  void action();
};
vi.mock("@/components/spaces/use-vault-ready", () => ({
  useVaultReady: () => runReady,
  spaceKeysReady: () => true,
}));
vi.mock("@/lib/api", () => api);
vi.mock("@/store/toast", () => ({ toast }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "s1" }),
  useRouter: () => ({ push: vi.fn() }),
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
  unshareFileFromSpace: spaces.unshareFileFromSpace,
  downloadSpaceFile: spaces.downloadSpaceFile,
  decryptSpaceFileName: async () => null,
}));
vi.mock("@/store/auth", () => ({
  useAuthStore: Object.assign((sel: (s: typeof auth) => unknown) => sel(auth), {
    getState: () => auth,
  }),
}));
vi.mock("@/store/files", () => {
  const result = { data: [], isPending: false };
  return { useFilesQuery: () => result };
});
vi.mock("@/store/space-adds", () => ({
  useSpaceAdds: Object.assign(
    (sel: (s: { jobs: Record<string, never> }) => unknown) => sel({ jobs: {} }),
    { getState: () => ({ enqueue: vi.fn() }) },
  ),
}));
vi.mock("@/lib/query-client", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  return { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) };
});
vi.mock("@/hooks/useSpaceMeta", () => ({
  useSpaceMeta: (v?: { name: string }) =>
    v
      ? { name: v.name.replace(/^s1:/, ""), description: "", ready: true }
      : { name: "", description: "", ready: false },
}));

import { SpaceHome } from "@/components/spaces/space-home";

const file = (n: number) => ({
  file_id: `f${n}`,
  wrapped_cek: "cek",
  name: `report-${n}.pdf`,
  size: 1000 * n,
  added_at: `2026-10-0${n}T00:00:00Z`,
});

const detail = (role: "viewer" | "editor" = "editor", owner = "u1") => ({
  id: "s1",
  name: "s1:Atlas",
  description: "",
  owner_id: owner,
  role,
  file_ids: [],
  created_at: "",
  updated_at: "",
  size_limit_bytes: 0,
  members: [{ id: "m1", vault_id: "s1", user_id: "u1", username: "ada", role: "admin", joined_at: "" }],
  files: [file(1), file(2), file(3)],
});

beforeEach(() => {
  installDomStubs();
  vi.clearAllMocks();
  api.getSharedVault.mockResolvedValue(detail());
  spaces.unshareFileFromSpace.mockResolvedValue(undefined);
});
afterEach(cleanup);

async function ready() {
  renderWithQuery(<SpaceHome />);
  await screen.findByText("report-1.pdf");
  return screen.getByRole("listbox");
}

describe("SpaceHome keyboard", () => {
  it("renders the decrypted space name and its files as options", async () => {
    await ready();
    expect(screen.getByRole("heading", { name: "Atlas" })).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("Cmd+A selects every file and announces it", async () => {
    const list = await ready();
    const first = screen.getAllByRole("option")[0];
    first.focus();
    fireEvent.keyDown(list, { key: "a", metaKey: true });
    screen.getAllByRole("option").forEach((o) => expect(o).toHaveAttribute("aria-selected", "true"));
    expect(screen.getAllByText("3 files selected").length).toBeGreaterThan(0);
    expect(screen.getByRole("toolbar", { name: "Selection actions" })).toBeInTheDocument();
  });

  it("Delete opens a confirm for the selection and removes the files on confirm", async () => {
    const list = await ready();
    const options = screen.getAllByRole("option");
    options[0].focus();
    fireEvent.keyDown(list, { key: "a", metaKey: true });
    fireEvent.keyDown(options[0], { key: "Delete" });

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Remove 3 files from this Space?")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(spaces.unshareFileFromSpace).toHaveBeenCalledTimes(3));
    expect(spaces.unshareFileFromSpace).toHaveBeenCalledWith("s1", "f2");
    await waitFor(() => expect(screen.queryAllByRole("option")).toHaveLength(0));
    expect(screen.getAllByText("Removed 3 files").length).toBeGreaterThan(0);
  });

  it("Escape clears the selection", async () => {
    const list = await ready();
    const options = screen.getAllByRole("option");
    options[1].focus();
    fireEvent.keyDown(options[1], { key: " " });
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(list, { key: "Escape" });
    await waitFor(() => expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "false"));
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });

  it("viewers cannot remove: Delete does nothing and the bulk bar has no Remove", async () => {
    api.getSharedVault.mockResolvedValue(detail("viewer", "someone-else"));
    const list = await ready();
    const options = screen.getAllByRole("option");
    options[0].focus();
    fireEvent.keyDown(list, { key: "a", metaKey: true });
    fireEvent.keyDown(options[0], { key: "Delete" });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remove from space/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download/i })).toBeInTheDocument();
  });
});
