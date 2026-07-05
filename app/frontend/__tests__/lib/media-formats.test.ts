import { describe, it, expect } from "vitest";
import {
  extOf,
  isAudioFile,
  isVideoFile,
  isMediaFile,
  mediaKindFor,
  mediaMimeFor,
} from "@/lib/media-formats";

describe("extOf", () => {
  it("returns the lowercased extension without the dot", () => {
    expect(extOf("song.MP3")).toBe("mp3");
    expect(extOf("clip.Mp4")).toBe("mp4");
  });

  it("returns the last segment for dotted names", () => {
    expect(extOf("archive.tar.gz")).toBe("gz");
  });

  it("returns the whole (lowercased) name when there is no extension", () => {
    // split(".").pop() yields the full string when no dot is present.
    expect(extOf("README")).toBe("readme");
  });
});

describe("isAudioFile", () => {
  it("is true for a known audio extension", () => {
    expect(isAudioFile("track.flac")).toBe(true);
  });
  it("is false for a non-audio extension", () => {
    expect(isAudioFile("clip.mp4")).toBe(false);
    expect(isAudioFile("notes.txt")).toBe(false);
  });
});

describe("isVideoFile", () => {
  it("is true for a known video extension", () => {
    expect(isVideoFile("movie.mkv")).toBe(true);
  });
  it("is false for a non-video extension", () => {
    expect(isVideoFile("song.mp3")).toBe(false);
    expect(isVideoFile("notes.txt")).toBe(false);
  });
});

describe("isMediaFile", () => {
  it("is true for audio", () => {
    expect(isMediaFile("song.mp3")).toBe(true);
  });
  it("is true for video", () => {
    expect(isMediaFile("movie.mp4")).toBe(true);
  });
  it("is false for non-media", () => {
    expect(isMediaFile("notes.txt")).toBe(false);
  });
});

describe("mediaKindFor", () => {
  it("returns 'audio' for mp3 and the WhatsApp .mpeg voice-note case", () => {
    expect(mediaKindFor("song.mp3")).toBe("audio");
    expect(mediaKindFor("voicenote.mpeg")).toBe("audio");
  });
  it("returns 'video' for mp4 and mkv", () => {
    expect(mediaKindFor("clip.mp4")).toBe("video");
    expect(mediaKindFor("clip.mkv")).toBe("video");
  });
  it("is case-insensitive", () => {
    expect(mediaKindFor("SONG.MP3")).toBe("audio");
    expect(mediaKindFor("CLIP.MP4")).toBe("video");
  });
  it("returns null for a non-media file", () => {
    expect(mediaKindFor("notes.txt")).toBeNull();
  });
});

describe("mediaMimeFor", () => {
  it("maps .mpeg to audio/mpeg (WhatsApp voice-note case)", () => {
    expect(mediaMimeFor("voicenote.mpeg")).toBe("audio/mpeg");
  });
  it("maps .mp4 to video/mp4", () => {
    expect(mediaMimeFor("clip.mp4")).toBe("video/mp4");
  });
  it("is case-insensitive", () => {
    expect(mediaMimeFor("CLIP.MP4")).toBe("video/mp4");
  });
  it("returns undefined for an unknown extension", () => {
    expect(mediaMimeFor("notes.txt")).toBeUndefined();
  });
});
