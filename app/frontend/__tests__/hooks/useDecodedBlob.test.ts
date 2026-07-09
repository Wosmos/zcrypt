import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useDecodedBlob } from "@/hooks/useDecodedBlob";

const blob = new Blob(["payload"]);

describe("useDecodedBlob", () => {
  it("starts with null value and null error", () => {
    const decode = vi.fn().mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() =>
      useDecodedBlob(blob, decode, "boom")
    );
    expect(result.current.value).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("sets the decoded value on success", async () => {
    const decode = vi.fn().mockResolvedValue("decoded!");
    const { result } = renderHook(() =>
      useDecodedBlob(blob, decode, "boom")
    );
    await waitFor(() => expect(result.current.value).toBe("decoded!"));
    expect(result.current.error).toBeNull();
    expect(decode).toHaveBeenCalledWith(blob);
  });

  it("sets the error message (never the raw error) on failure", async () => {
    const decode = vi.fn().mockRejectedValue(new Error("leaky details"));
    const { result } = renderHook(() =>
      useDecodedBlob(blob, decode, "Could not read file")
    );
    await waitFor(() => expect(result.current.error).toBe("Could not read file"));
    expect(result.current.value).toBeNull();
  });

  it("resets and re-decodes when the decode function identity changes", async () => {
    const first = vi.fn().mockResolvedValue("one");
    const second = vi.fn().mockResolvedValue("two");
    const { result, rerender } = renderHook(
      ({ decode }) => useDecodedBlob(blob, decode, "boom"),
      { initialProps: { decode: first } }
    );
    await waitFor(() => expect(result.current.value).toBe("one"));

    rerender({ decode: second });
    await waitFor(() => expect(result.current.value).toBe("two"));
    expect(second).toHaveBeenCalledWith(blob);
  });

  it("ignores a resolution that arrives after unmount (cancellation guard)", async () => {
    let resolve!: (v: string) => void;
    const decode = vi.fn(
      () => new Promise<string>((r) => (resolve = r))
    );
    const { result, unmount } = renderHook(() =>
      useDecodedBlob(blob, decode, "boom")
    );
    unmount();
    resolve("late");
    await Promise.resolve();
    expect(result.current.value).toBeNull();
  });

  it("ignores a rejection that arrives after unmount", async () => {
    let reject!: (e: unknown) => void;
    const decode = vi.fn(
      () => new Promise<string>((_, rej) => (reject = rej))
    );
    const { result, unmount } = renderHook(() =>
      useDecodedBlob(blob, decode, "boom")
    );
    unmount();
    reject(new Error("late"));
    await Promise.resolve();
    expect(result.current.error).toBeNull();
  });
});
