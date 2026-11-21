import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { installDomStubs, renderWithQuery } from "./test-utils";

const { api, spaces, nav, adds, toast, files } = vi.hoisted(() => ({
  api: { listFolders: vi.fn() },
  spaces: {
    createSpace: vi.fn(),
    inviteToSpace: vi.fn(),
    loadSpaceKey: vi.fn(),
    warmSpaceKeys: vi.fn(),
  },
  nav: { push: vi.fn() },
  adds: { enqueue: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  files: {
    result: {
      data: [
        {
          id: "f1",
          original_name: "plan.pdf",
          original_size: 10,
          folder_id: null,
        },
        {
          id: "f2",
          original_name: "photo.png",
          original_size: 20,
          folder_id: null,
        },
      ],
      isPending: false,
    },
  },
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
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: nav.push }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/spaces", async (orig) => ({
  ...(await orig<typeof import("@/lib/spaces")>()),
  createSpace: spaces.createSpace,
  inviteToSpace: spaces.inviteToSpace,
  loadSpaceKey: spaces.loadSpaceKey,
  warmSpaceKeys: spaces.warmSpaceKeys,
}));
vi.mock("@/lib/keys", () => ({ ensureUserKeypair: vi.fn() }));
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
  useSpaceAdds: Object.assign(() => undefined, { getState: () => adds }),
}));
vi.mock("@/hooks/useSpaceBatchLimit", () => ({ useSpaceBatchLimit: () => 200 }));
vi.mock("@/lib/query-client", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  return { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) };
});

import { SpaceNew } from "@/components/spaces/space-new";
import { KeyChangeHost } from "@/components/spaces/key-change";
import { KeyChangedError } from "@/lib/key-pins";

const vault = { id: "new-id", name: "s1:Atlas", description: "", owner_id: "u1", file_ids: [] };

beforeEach(() => {
  installDomStubs();
  vi.clearAllMocks();
  api.listFolders.mockResolvedValue([]);
  spaces.createSpace.mockResolvedValue(vault);
  spaces.loadSpaceKey.mockResolvedValue(new Uint8Array(32));
  spaces.inviteToSpace.mockResolvedValue({ user_id: "peer", role: "viewer" });
});
afterEach(cleanup);

function fillName(value = "Atlas") {
  fireEvent.change(screen.getByLabelText(/space name/i), { target: { value } });
}

describe("SpaceNew", () => {
  it("creates the space, navigates immediately and enqueues the picked files in the background", async () => {
    renderWithQuery(<SpaceNew />);
    fillName();
    fireEvent.click(screen.getByRole("button", { name: /choose files/i }));
    const options = await screen.findAllByRole("option");
    fireEvent.click(options[0]);
    fireEvent.click(screen.getByRole("button", { name: "Create Space" }));

    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/spaces/new-id"));
    expect(spaces.createSpace).toHaveBeenCalledWith("Atlas", "", [], 0);
    expect(adds.enqueue).toHaveBeenCalledTimes(1);
    const [v, ids, name] = adds.enqueue.mock.calls[0];
    expect(v).toBe(vault);
    expect(ids).toHaveLength(1);
    expect(name).toBe("Atlas");
  });

  it("requires a name", async () => {
    renderWithQuery(<SpaceNew />);
    expect(screen.getByRole("button", { name: "Create Space" })).toBeDisabled();
    expect(spaces.createSpace).not.toHaveBeenCalled();
  });

  it("confirms a changed peer key and retries the invite with that peer approved", async () => {
    spaces.inviteToSpace
      .mockRejectedValueOnce(new KeyChangedError("peer-1", "NEW-FP", "OLD-FP"))
      .mockResolvedValueOnce({ user_id: "peer-1", role: "editor" });

    renderWithQuery(
      <>
        <SpaceNew />
        <KeyChangeHost />
      </>,
    );
    fillName();
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "bob@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByRole("button", { name: "Create Space" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("OLD-FP")).toBeInTheDocument();
    expect(within(dialog).getByText("NEW-FP")).toBeInTheDocument();
    expect(nav.push).toHaveBeenCalledWith("/spaces/new-id");

    fireEvent.click(within(dialog).getByRole("button", { name: "Trust the new key" }));

    await waitFor(() => expect(spaces.inviteToSpace).toHaveBeenCalledTimes(2));
    expect(spaces.inviteToSpace.mock.calls[0][3]).toEqual({ acceptChangedKeys: [] });
    expect(spaces.inviteToSpace.mock.calls[1][3]).toEqual({ acceptChangedKeys: ["peer-1"] });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Invited 1 person"));
  });

  it("rejects an entry that is not an email before any lookup", async () => {
    renderWithQuery(<SpaceNew />);
    fillName();
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "bob" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Enter a valid email.")).toBeInTheDocument();
    expect(spaces.inviteToSpace).not.toHaveBeenCalled();
  });

  it("does not retry when the changed key is declined", async () => {
    spaces.inviteToSpace.mockRejectedValue(new KeyChangedError("peer-1", "NEW-FP", "OLD-FP"));
    renderWithQuery(
      <>
        <SpaceNew />
        <KeyChangeHost />
      </>,
    );
    fillName();
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "bob@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByRole("button", { name: "Create Space" }));

    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(toast.warning).toHaveBeenCalled());
    expect(spaces.inviteToSpace).toHaveBeenCalledTimes(1);
  });
});
