import { describe, it, expect, afterEach, vi } from "vitest";
import {
  canDocumentPictureInPicture,
  canVideoPictureInPicture,
  isInVideoPictureInPicture,
  toggleVideoPictureInPicture,
} from "@/lib/picture-in-picture";

function setDocument(props: Record<string, unknown>) {
  for (const [k, v] of Object.entries(props)) {
    Object.defineProperty(document, k, { value: v, configurable: true });
  }
}

afterEach(() => {
  setDocument({ pictureInPictureEnabled: undefined, pictureInPictureElement: null });
  delete (window as unknown as Record<string, unknown>).documentPictureInPicture;
});

describe("video picture-in-picture", () => {
  it("is unavailable without an element or browser support", () => {
    expect(canVideoPictureInPicture(null)).toBe(false);
    expect(canVideoPictureInPicture(document.createElement("video"))).toBe(false);
  });

  it("uses the standard API when the browser enables it", async () => {
    setDocument({ pictureInPictureEnabled: true, pictureInPictureElement: null });
    const el = document.createElement("video");
    const request = vi.fn(async () => ({}) as PictureInPictureWindow);
    el.requestPictureInPicture = request;
    expect(canVideoPictureInPicture(el)).toBe(true);
    await expect(toggleVideoPictureInPicture(el)).resolves.toBe(true);
    expect(request).toHaveBeenCalled();
  });

  it("closes the window when the element is already floating", async () => {
    const el = document.createElement("video");
    const exit = vi.fn(async () => {});
    setDocument({ pictureInPictureEnabled: true, pictureInPictureElement: el, exitPictureInPicture: exit });
    el.requestPictureInPicture = vi.fn();
    expect(isInVideoPictureInPicture(el)).toBe(true);
    await toggleVideoPictureInPicture(el);
    expect(exit).toHaveBeenCalled();
    expect(el.requestPictureInPicture).not.toHaveBeenCalled();
  });

  it("falls back to WebKit presentation mode (Safari, the Mac app)", async () => {
    const el = document.createElement("video") as HTMLVideoElement & Record<string, unknown>;
    el.webkitSupportsPresentationMode = (m: string) => m === "picture-in-picture";
    el.webkitPresentationMode = "inline";
    const set = vi.fn();
    el.webkitSetPresentationMode = set;
    expect(canVideoPictureInPicture(el)).toBe(true);
    await toggleVideoPictureInPicture(el);
    expect(set).toHaveBeenCalledWith("picture-in-picture");
  });

  it("reports a refusal instead of throwing", async () => {
    setDocument({ pictureInPictureEnabled: true, pictureInPictureElement: null });
    const el = document.createElement("video");
    el.requestPictureInPicture = vi.fn(async () => {
      throw new DOMException("no gesture", "NotAllowedError");
    });
    await expect(toggleVideoPictureInPicture(el)).resolves.toBe(false);
  });
});

describe("document picture-in-picture", () => {
  it("is offered only where the browser has it", () => {
    expect(canDocumentPictureInPicture()).toBe(false);
    (window as unknown as Record<string, unknown>).documentPictureInPicture = { requestWindow: vi.fn() };
    expect(canDocumentPictureInPicture()).toBe(true);
  });
});
