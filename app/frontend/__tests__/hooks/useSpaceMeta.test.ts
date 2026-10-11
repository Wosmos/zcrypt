import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("@/lib/spaces", () => ({ loadSpaceKey: vi.fn(), openSpaceText: vi.fn() }));

import { loadSpaceKey, openSpaceText } from "@/lib/spaces";
import { useSpaceMeta } from "@/hooks/useSpaceMeta";
import { useKeysStore } from "@/store/keys";
import { tr } from "@/store/translate";
import type { SharedVault } from "@/types";

const vault = (over: Partial<SharedVault>) =>
  ({ id: "v1", name: "", description: "", wrapped_space_key: "w", ...over }) as SharedVault;
const KEY = new Uint8Array([1]);

beforeEach(() => {
  vi.clearAllMocks();
  useKeysStore.setState({ ready: true });
  vi.mocked(loadSpaceKey).mockResolvedValue(KEY);
  vi.mocked(openSpaceText).mockImplementation(async (_k, v) => v.replace(/^s1:/, "open:"));
});

describe("useSpaceMeta", () => {
  it("is empty and not ready without a vault", () => {
    const { result } = renderHook(() => useSpaceMeta(undefined));
    expect(result.current).toEqual({ name: "", description: "", ready: false });
  });

  it("returns legacy plaintext immediately", () => {
    const { result } = renderHook(() => useSpaceMeta(vault({ name: "Team", description: "d" })));
    expect(result.current).toEqual({ name: "Team", description: "d", ready: true });
    expect(loadSpaceKey).not.toHaveBeenCalled();
  });

  it("falls back to the untitled label for a blank plaintext name", () => {
    const { result } = renderHook(() => useSpaceMeta(vault({ name: "" })));
    expect(result.current.name).toBe(tr("l10n.untitledSpace"));
    expect(result.current.ready).toBe(true);
  });

  it("shows the locked label while keys are not loaded, then opens sealed text", async () => {
    useKeysStore.setState({ ready: false });
    const v = vault({ name: "s1:abc", description: "s1:def" });
    const { result } = renderHook(() => useSpaceMeta(v));
    expect(result.current).toEqual({
      name: tr("l10n.lockedSpace"),
      description: "",
      ready: false,
    });
    expect(loadSpaceKey).not.toHaveBeenCalled();
    useKeysStore.setState({ ready: true });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current).toEqual({ name: "open:abc", description: "open:def", ready: true });
  });

  it("opens a sealed description next to a plaintext name", async () => {
    const { result } = renderHook(() => useSpaceMeta(vault({ name: "Plain", description: "s1:x" })));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.description).toBe("open:x");
  });

  it("shows an empty name while opening with keys ready", () => {
    vi.mocked(loadSpaceKey).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSpaceMeta(vault({ name: "s1:a" })));
    expect(result.current).toEqual({ name: "", description: "", ready: false });
  });

  it("uses the untitled label when the sealed name opens to nothing", async () => {
    vi.mocked(openSpaceText).mockResolvedValue("");
    const { result } = renderHook(() => useSpaceMeta(vault({ name: "s1:a" })));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.name).toBe(tr("l10n.untitledSpace"));
  });

  it("uses the untitled label when the space key is missing", async () => {
    vi.mocked(loadSpaceKey).mockResolvedValue(null);
    const { result } = renderHook(() => useSpaceMeta(vault({ name: "s1:a", description: "s1:b" })));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current).toEqual({
      name: tr("l10n.untitledSpace"),
      description: "",
      ready: true,
    });
  });

  it("uses the untitled label when opening fails", async () => {
    vi.mocked(openSpaceText).mockRejectedValue(new Error("bad tag"));
    const { result } = renderHook(() => useSpaceMeta(vault({ name: "s1:a" })));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.name).toBe(tr("l10n.untitledSpace"));
  });

  it("re-opens when the vault text changes and ignores a result that arrives after unmount", async () => {
    const { result, rerender } = renderHook(({ v }) => useSpaceMeta(v), {
      initialProps: { v: vault({ name: "s1:a" }) },
    });
    await waitFor(() => expect(result.current.name).toBe("open:a"));
    rerender({ v: vault({ name: "s1:b" }) });
    await waitFor(() => expect(result.current.name).toBe("open:b"));

    let release!: (k: Uint8Array) => void;
    vi.mocked(loadSpaceKey).mockReturnValue(new Promise((r) => (release = r)));
    const late = renderHook(() => useSpaceMeta(vault({ id: "v2", name: "s1:z" })));
    late.unmount();
    release(KEY);
    await waitFor(() => expect(openSpaceText).toHaveBeenCalledWith(KEY, "s1:z"));
    expect(late.result.current.ready).toBe(false);
  });
});
