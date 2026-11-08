import { describe, it, expect, beforeEach, vi } from "vitest";
import { useNowPlaying, currentTrack } from "@/store/now-playing";
import { clearDecryptCache, clearDecryptCacheForFolder } from "@/lib/decrypt-cache";
import type { FileMetadata } from "@/types";

const file = (id: string, folder = "f1") =>
  ({ id, original_name: `${id}.mp3`, folder_id: folder }) as unknown as FileMetadata;

let revoke: ReturnType<typeof vi.fn>;
let made = 0;
beforeEach(() => {
  revoke = vi.fn();
  made = 0;
  URL.revokeObjectURL = revoke as unknown as typeof URL.revokeObjectURL;
  URL.createObjectURL = vi.fn(() => `blob:new-${++made}`) as unknown as typeof URL.createObjectURL;
  useNowPlaying.setState({ src: null, queue: [], position: 0 });
});

function startWith(src = "blob:handed", decrypt = vi.fn(async () => new Blob(["x"]))) {
  useNowPlaying.getState().start({
    queue: [file("a"), file("b"), file("c")],
    position: 0,
    src,
    startAt: 12,
    autoplay: true,
    decrypt,
  });
  return decrypt;
}

describe("now-playing store", () => {
  it("takes over a handed URL and reports the track being played", () => {
    startWith();
    const s = useNowPlaying.getState();
    expect(s.src).toBe("blob:handed");
    expect(s.startAt).toBe(12);
    expect(currentTrack(s)?.id).toBe("a");
    expect(revoke).not.toHaveBeenCalled();
  });

  it("revokes the plaintext URL when closed", () => {
    startWith();
    useNowPlaying.getState().close();
    expect(revoke).toHaveBeenCalledWith("blob:handed");
    expect(useNowPlaying.getState().src).toBeNull();
    expect(currentTrack(useNowPlaying.getState())).toBeNull();
  });

  it("revokes the previous URL when another track is handed over", () => {
    startWith("blob:one");
    startWith("blob:two");
    expect(revoke).toHaveBeenCalledWith("blob:one");
    expect(useNowPlaying.getState().src).toBe("blob:two");
  });

  it("plays another queue entry: decrypts it, swaps the URL and revokes the old one", async () => {
    const decrypt = startWith();
    await useNowPlaying.getState().playAt(2);
    const s = useNowPlaying.getState();
    expect(decrypt).toHaveBeenCalledWith(expect.objectContaining({ id: "c" }));
    expect(s.src).toBe("blob:new-1");
    expect(s.position).toBe(2);
    expect(s.startAt).toBe(0);
    expect(revoke).toHaveBeenCalledWith("blob:handed");
  });

  it("revokes a late decrypt that finishes after the player was closed", async () => {
    let finish: (b: Blob) => void = () => {};
    startWith(
      "blob:handed",
      vi.fn(
        () =>
          new Promise<Blob>((r) => {
            finish = r;
          }),
      ),
    );
    const pending = useNowPlaying.getState().playAt(1);
    useNowPlaying.getState().close();
    finish(new Blob(["x"]));
    await pending;
    expect(useNowPlaying.getState().src).toBeNull();
    expect(revoke).toHaveBeenCalledWith("blob:new-1");
  });

  it("keeps the current track and flags the error when the next one can't be decrypted", async () => {
    startWith(
      "blob:handed",
      vi.fn(async () => {
        throw new Error("nope");
      }),
    );
    await useNowPlaying.getState().playAt(1);
    const s = useNowPlaying.getState();
    expect(s.error).toBe(true);
    expect(s.loading).toBe(false);
    expect(s.src).toBe("blob:handed");
  });

  it("stops and revokes on a vault lock, TTL expiry or logout", () => {
    startWith();
    clearDecryptCache();
    expect(useNowPlaying.getState().src).toBeNull();
    expect(revoke).toHaveBeenCalledWith("blob:handed");
  });

  it("stops only when the re-locked folder is the one playing", () => {
    startWith();
    clearDecryptCacheForFolder("other");
    expect(useNowPlaying.getState().src).toBe("blob:handed");
    clearDecryptCacheForFolder("f1");
    expect(useNowPlaying.getState().src).toBeNull();
  });
});
