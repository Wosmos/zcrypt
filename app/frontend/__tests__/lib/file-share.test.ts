import { describe, it, expect, beforeEach, vi } from "vitest";
import { createFileShareLink } from "@/lib/file-share";
import { getFileMeta, createShare } from "@/lib/api";
import { resolveFileKey, generateCEK, wrapKey } from "@/lib/crypto";
import { invalidateShares } from "@/hooks/useShares";
import { usePassphraseStore } from "@/store/passphrase";

vi.mock("@/store/passphrase", () => ({
  usePassphraseStore: { getState: vi.fn() },
}));
vi.mock("@/lib/api", () => ({
  getFileMeta: vi.fn(),
  createShare: vi.fn(),
}));
vi.mock("@/lib/crypto", () => ({
  resolveFileKey: vi.fn(),
  generateCEK: vi.fn(),
  wrapKey: vi.fn(),
  fromBase64: vi.fn(() => new Uint8Array([1, 2, 3])),
  toBase64: vi.fn(() => "B64"),
  toArrayBuffer: vi.fn((u: Uint8Array) => u.buffer),
}));
vi.mock("@/hooks/useShares", () => ({
  invalidateShares: vi.fn(),
}));

const getState = vi.mocked(usePassphraseStore.getState);
const getFileMetaMock = vi.mocked(getFileMeta);
const createShareMock = vi.mocked(createShare);
const resolveFileKeyMock = vi.mocked(resolveFileKey);
const generateCEKMock = vi.mocked(generateCEK);
const wrapKeyMock = vi.mocked(wrapKey);
const invalidateSharesMock = vi.mocked(invalidateShares);

function unlockedWith(passphrase: string | null) {
  getState.mockReturnValue({ getPassphrase: () => passphrase } as ReturnType<
    typeof usePassphraseStore.getState
  >);
}

describe("createFileShareLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    unlockedWith("correct horse");
    getFileMetaMock.mockResolvedValue({
      salt: "c2FsdA==",
      wrapped_cek: "d3JhcHBlZA==",
    } as Awaited<ReturnType<typeof getFileMeta>>);
    resolveFileKeyMock.mockResolvedValue(new Uint8Array([9, 9, 9]).buffer);
    generateCEKMock.mockReturnValue(new Uint8Array([5, 5, 5]));
    wrapKeyMock.mockResolvedValue(new Uint8Array([7, 7]));
    createShareMock.mockResolvedValue({ token: "tok123" } as Awaited<
      ReturnType<typeof createShare>
    >);
  });

  it("throws a friendly error when the vault is locked", async () => {
    unlockedWith(null);
    await expect(createFileShareLink("file-1")).rejects.toThrow(/passphrase is locked/i);
    expect(getFileMetaMock).not.toHaveBeenCalled();
  });

  it("throws when the file predates envelope encryption (no wrapped_cek)", async () => {
    getFileMetaMock.mockResolvedValue({ salt: "c2FsdA==" } as Awaited<
      ReturnType<typeof getFileMeta>
    >);
    await expect(createFileShareLink("file-1")).rejects.toThrow(/before sharing was supported/i);
    expect(createShareMock).not.toHaveBeenCalled();
  });

  it("recovers the CEK, re-wraps it, creates the share, and builds the #fragment URL", async () => {
    const out = await createFileShareLink("file-1");

    expect(resolveFileKeyMock).toHaveBeenCalledOnce();
    expect(generateCEKMock).toHaveBeenCalledOnce();
    expect(wrapKeyMock).toHaveBeenCalledOnce();
    expect(createShareMock).toHaveBeenCalledWith(
      expect.objectContaining({ file_id: "file-1", wrapped_cek: "B64" })
    );
    expect(out.token).toBe("tok123");
    expect(out.shareKey).toBe("B64");
    expect(out.url).toBe(`${window.location.origin}/s/tok123#key=B64`);
  });

  it("passes optional password / expiry / limit through to createShare", async () => {
    await createFileShareLink("file-1", {
      password: "hunter2",
      expiresHours: 24,
      maxDownloads: 5,
    });
    expect(createShareMock).toHaveBeenCalledWith(
      expect.objectContaining({
        password: "hunter2",
        expires_in_hours: 24,
        max_downloads: 5,
      })
    );
  });

  it("omits optional fields (sends undefined) when not provided", async () => {
    await createFileShareLink("file-1");
    expect(createShareMock).toHaveBeenCalledWith(
      expect.objectContaining({
        password: undefined,
        expires_in_hours: undefined,
        max_downloads: undefined,
      })
    );
  });

  it("invalidates the shares cache for the file", async () => {
    await createFileShareLink("file-99");
    expect(invalidateSharesMock).toHaveBeenCalledWith("file-99");
  });
});
