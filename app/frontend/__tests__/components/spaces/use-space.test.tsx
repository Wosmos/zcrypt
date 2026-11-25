import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const h = vi.hoisted(() => ({
  detail: {} as Record<string, unknown>,
  handOff: vi.fn(async () => 0),
  rotate: vi.fn(async () => true),
  ready: true,
}));
vi.mock("@/lib/space-rotation", () => ({ rotateIfNeeded: h.rotate }));

vi.mock("@/lib/api", () => ({ getSharedVault: async () => h.detail }));
vi.mock("@/lib/space-handoff", () => ({ handOffPendingKeys: h.handOff }));
vi.mock("@/lib/query-client", () => ({ queryClient: new QueryClient() }));
vi.mock("@/store/auth", () => ({
  useAuthStore: (sel: (s: { user: { id: string } }) => unknown) => sel({ user: { id: "u1" } }),
}));
vi.mock("@/store/keys", () => ({
  useKeysStore: (sel: (s: { ready: boolean }) => unknown) => sel({ ready: h.ready }),
}));
vi.mock("@/store/files", () => ({ useFilesQuery: () => ({ data: [] }) }));

import { useSpaceDetail } from "@/components/spaces/use-space";

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  h.handOff.mockClear();
  h.rotate.mockClear();
  h.ready = true;
  h.detail = { id: "s1", owner_id: "u1", role: "admin", members: [], files: [] };
});

describe("useSpaceDetail re-key", () => {
  it("re-keys a flagged Space instead of handing keys over", async () => {
    h.detail = { ...h.detail, needs_rotation: true };
    renderHook(() => useSpaceDetail("s1"), { wrapper });
    await waitFor(() => expect(h.rotate).toHaveBeenCalledTimes(1));
    expect(h.handOff).not.toHaveBeenCalled();
  });
});

describe("useSpaceDetail key hand-off", () => {
  it("runs the hand-off when an owner or admin loads the Space", async () => {
    renderHook(() => useSpaceDetail("s1"), { wrapper });
    await waitFor(() => expect(h.handOff).toHaveBeenCalledTimes(1));
  });

  it("does not run it for a member who cannot manage, or while locked", async () => {
    h.detail = { id: "s1", owner_id: "someone", role: "viewer", members: [], files: [] };
    const { result } = renderHook(() => useSpaceDetail("s1"), { wrapper });
    await waitFor(() => expect(result.current.detail).not.toBeNull());
    expect(h.handOff).not.toHaveBeenCalled();

    h.detail = { id: "s1", owner_id: "u1", role: "admin", members: [], files: [] };
    h.ready = false;
    const locked = renderHook(() => useSpaceDetail("s1"), { wrapper });
    await waitFor(() => expect(locked.result.current.detail).not.toBeNull());
    expect(h.handOff).not.toHaveBeenCalled();
  });
});
