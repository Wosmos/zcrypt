import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  rotate: vi.fn(async (..._a: unknown[]) => {}),
  reload: vi.fn(async (..._a: unknown[]) => ({})),
  invalidate: vi.fn(),
  fetchQuery: vi.fn(),
  getVault: vi.fn(),
  ready: true,
  user: { id: "admin" } as { id: string } | null,
}));

vi.mock("@/lib/api", () => ({ getSharedVault: h.getVault }));
vi.mock("@/lib/query-client", () => ({
  queryClient: { invalidateQueries: h.invalidate, fetchQuery: h.fetchQuery },
}));
vi.mock("@/store/auth", () => ({ useAuthStore: { getState: () => ({ user: h.user }) } }));
vi.mock("@/store/keys", () => ({ useKeysStore: { getState: () => ({ ready: h.ready }) } }));
vi.mock("@/lib/spaces", () => ({
  rotateSpaceKey: h.rotate,
  reloadSpace: h.reload,
  spacePerms: (v: { owner_id: string; role?: string }, id?: string) => ({
    rotate: v.owner_id === id || v.role === "admin",
  }),
}));

import {
  ROTATE_BACKOFF_MS,
  resetRotationBackoff,
  rotateForSpace,
  rotateIfNeeded,
} from "@/lib/space-rotation";
import type { SharedVaultDetail } from "@/types";

const members = [{ user_id: "owner" }, { user_id: "admin" }];
const files = [{ file_id: "f1" }];
const detail = (over: Partial<SharedVaultDetail> = {}): SharedVaultDetail =>
  ({ id: "s1", owner_id: "owner", role: "admin", needs_rotation: true, members, files, ...over }) as unknown as SharedVaultDetail;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  resetRotationBackoff();
  h.ready = true;
  h.user = { id: "admin" };
  h.rotate.mockResolvedValue(undefined);
});

describe("rotateIfNeeded", () => {
  it("re-keys a flagged Space from an admin device and refreshes it", async () => {
    expect(await rotateIfNeeded(detail())).toBe(true);
    expect(h.rotate).toHaveBeenCalledWith(expect.objectContaining({ id: "s1" }), members, files);
    expect(h.invalidate).toHaveBeenCalledWith({ queryKey: ["space", "s1"] });
  });

  it("passes empty lists when the detail carries none", async () => {
    await rotateIfNeeded(detail({ members: undefined, files: undefined } as never));
    expect(h.rotate).toHaveBeenCalledWith(expect.anything(), [], []);
  });

  it("does nothing for a Space that needs no re-key, a locked device, or an editor", async () => {
    expect(await rotateIfNeeded(detail({ needs_rotation: false }))).toBe(false);
    h.ready = false;
    expect(await rotateIfNeeded(detail())).toBe(false);
    h.ready = true;
    h.user = { id: "ed" };
    expect(await rotateIfNeeded(detail({ role: "editor" }))).toBe(false);
    h.user = null;
    expect(await rotateIfNeeded(detail({ role: "editor" }))).toBe(false);
    expect(h.rotate).not.toHaveBeenCalled();
  });

  it("runs one re-key at a time per Space", async () => {
    let finish!: () => void;
    h.rotate.mockImplementationOnce(() => new Promise<void>((r) => (finish = r)));
    const first = rotateIfNeeded(detail());
    expect(await rotateIfNeeded(detail())).toBe(false);
    finish();
    expect(await first).toBe(true);
    expect(h.rotate).toHaveBeenCalledTimes(1);
  });

  it("after a failure reloads the Space and waits out the backoff", async () => {
    vi.useFakeTimers();
    h.rotate.mockRejectedValueOnce(new Error("network"));
    h.reload.mockRejectedValueOnce(new Error("offline"));
    expect(await rotateIfNeeded(detail())).toBe(false);
    expect(h.reload).toHaveBeenCalledWith("s1");
    expect(await rotateIfNeeded(detail())).toBe(false);
    expect(h.rotate).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(ROTATE_BACKOFF_MS + 1);
    expect(await rotateIfNeeded(detail())).toBe(true);
  });
});

describe("rotateForSpace", () => {
  it("fetches the Space uncached and re-keys it", async () => {
    h.fetchQuery.mockImplementation(async (o: { queryFn: () => unknown; staleTime: number }) => {
      expect(o.staleTime).toBe(0);
      return o.queryFn();
    });
    h.getVault.mockResolvedValue(detail());
    await rotateForSpace("s1");
    expect(h.getVault).toHaveBeenCalledWith("s1");
    expect(h.rotate).toHaveBeenCalledTimes(1);
  });

  it("stays quiet when the fetch fails", async () => {
    h.fetchQuery.mockRejectedValue(new Error("down"));
    await expect(rotateForSpace("s1")).resolves.toBeUndefined();
    expect(h.rotate).not.toHaveBeenCalled();
  });
});
