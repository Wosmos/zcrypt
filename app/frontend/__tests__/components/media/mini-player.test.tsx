import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MiniPlayer } from "@/components/media/mini-player";
import { useNowPlaying } from "@/store/now-playing";
import type { FileMetadata } from "@/types";

const file = (id: string, name: string) =>
  ({ id, original_name: name, folder_id: "f1" }) as unknown as FileMetadata;

type Handler = (() => void) | null;
let handlers: Record<string, Handler>;
let revoke: ReturnType<typeof vi.fn>;

beforeEach(() => {
  handlers = {};
  revoke = vi.fn();
  URL.revokeObjectURL = revoke as unknown as typeof URL.revokeObjectURL;
  Object.defineProperty(navigator, "mediaSession", {
    configurable: true,
    value: {
      metadata: null,
      setActionHandler: (action: string, fn: Handler) => {
        handlers[action] = fn;
      },
    },
  });
  vi.stubGlobal(
    "MediaMetadata",
    class {
      title: string;
      constructor(init: { title: string }) {
        this.title = init.title;
      }
    },
  );
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  act(() => useNowPlaying.getState().close());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function play(queue: FileMetadata[], position = 0) {
  act(() =>
    useNowPlaying.getState().start({
      queue,
      position,
      src: "blob:track",
      startAt: 30,
      autoplay: true,
      decrypt: vi.fn(async () => new Blob(["x"])),
    }),
  );
}

describe("MiniPlayer", () => {
  it("renders nothing until a track is handed over", () => {
    const { container } = render(<MiniPlayer />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the track and plays it from the handed-over URL", () => {
    render(<MiniPlayer />);
    play([file("a", "song.mp3")]);
    expect(screen.getByRole("region", { name: "Now playing" })).toBeInTheDocument();
    expect(screen.getByText("song.mp3")).toBeInTheDocument();
    expect(document.querySelector("audio")?.getAttribute("src")).toBe("blob:track");
  });

  it("uses a video element for video and offers no picture-in-picture where unsupported", () => {
    render(<MiniPlayer />);
    play([file("v", "clip.mp4")]);
    expect(document.querySelector("video")?.getAttribute("src")).toBe("blob:track");
    expect(screen.queryByRole("button", { name: "Picture in picture" })).toBeNull();
  });

  it("closing releases the decrypted file and the OS media controls", () => {
    render(<MiniPlayer />);
    play([file("a", "song.mp3"), file("b", "next.mp3")]);
    expect(handlers.nexttrack).toBeTypeOf("function");
    expect((navigator.mediaSession.metadata as unknown as { title: string }).title).toBe("song.mp3");

    fireEvent.click(screen.getByRole("button", { name: "Close player" }));

    expect(revoke).toHaveBeenCalledWith("blob:track");
    expect(screen.queryByRole("region", { name: "Now playing" })).toBeNull();
    expect(handlers.play).toBeNull();
    expect(handlers.nexttrack).toBeNull();
    expect(navigator.mediaSession.metadata).toBeNull();
  });

  it("only registers next/previous where the queue has them", () => {
    render(<MiniPlayer />);
    play([file("a", "only.mp3")]);
    expect(handlers.nexttrack).toBeNull();
    expect(handlers.previoustrack).toBeNull();
    expect(screen.getByRole("button", { name: "Next track" })).toBeDisabled();
  });
});
