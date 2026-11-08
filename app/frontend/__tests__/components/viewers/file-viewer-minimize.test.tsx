import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FileViewer } from "@/components/viewers/file-viewer";
import { useNowPlaying } from "@/store/now-playing";
import type { FileMetadata } from "@/types";

const media = (id: string, name: string) =>
  ({
    id,
    original_name: name,
    original_size: 1000,
    chunk_count: 1,
    folder_id: "f1",
  }) as unknown as FileMetadata;

let revoke: ReturnType<typeof vi.fn>;
let made = 0;

beforeEach(() => {
  made = 0;
  revoke = vi.fn();
  URL.revokeObjectURL = revoke as unknown as typeof URL.revokeObjectURL;
  URL.createObjectURL = vi.fn(() => `blob:viewer-${++made}`) as unknown as typeof URL.createObjectURL;
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  act(() => useNowPlaying.getState().close());
  vi.restoreAllMocks();
});

function openViewer(files: FileMetadata[], index: number, onClose = vi.fn()) {
  const decrypt = vi.fn(async () => new Blob(["x"], { type: "audio/mpeg" }));
  const utils = render(
    <FileViewer
      open
      files={files}
      index={index}
      onIndexChange={() => {}}
      onClose={onClose}
      decrypt={decrypt}
    />,
  );
  return { ...utils, decrypt, onClose };
}

describe("FileViewer minimize", () => {
  it("hands the decrypted track to the mini player without decrypting or revoking it", async () => {
    const files = [media("a", "one.mp3"), media("doc", "notes.pdf"), media("b", "two.mp3")];
    const { decrypt, onClose, rerender } = openViewer(files, 0);
    const minimize = await screen.findByRole("button", { name: "Mini player" });

    fireEvent.click(minimize);
    rerender(
      <FileViewer
        open={false}
        files={files}
        index={0}
        onIndexChange={() => {}}
        onClose={onClose}
        decrypt={decrypt}
      />,
    );

    const s = useNowPlaying.getState();
    expect(s.src).toBe("blob:viewer-1");
    expect(s.queue.map((f) => f.id)).toEqual(["a", "b"]);
    expect(s.position).toBe(0);
    expect(decrypt).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalledWith("blob:viewer-1");
  });

  it("opening media in the viewer stops the mini player and releases its file", async () => {
    act(() =>
      useNowPlaying.getState().start({
        queue: [media("x", "old.mp3")],
        position: 0,
        src: "blob:mini",
        startAt: 0,
        autoplay: true,
        decrypt: vi.fn(),
      }),
    );
    openViewer([media("a", "one.mp3")], 0);
    await screen.findByRole("button", { name: "Mini player" });
    expect(useNowPlaying.getState().src).toBeNull();
    expect(revoke).toHaveBeenCalledWith("blob:mini");
  });
});
