import { describe, it, expect, beforeEach, vi } from "vitest";
import { createFileShareLink, sealFileNameForLink } from "@/lib/file-share";
import { decryptName } from "@/lib/name-crypto";
import { userNameKey } from "@/lib/sealed";
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
vi.mock("@/lib/name-crypto", () => ({
  decryptName: vi.fn(),
}));
vi.mock("@/lib/sealed", () => ({
  sealText: vi.fn(async (t: string) => `enc1:${t}`),
  keyFromBytes: vi.fn(async () => ({}) as CryptoKey),
  userNameKey: vi.fn(),
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
const decryptNameMock = vi.mocked(decryptName);
const userNameKeyMock = vi.mocked(userNameKey);
const nameKey = {} as CryptoKey;

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
    userNameKeyMock.mockResolvedValue(nameKey);
    decryptNameMock.mockResolvedValue("report.pdf");
  });

  it("seals the owner's decrypted file name under the link key", async () => {
    getFileMetaMock.mockResolvedValue({
      salt: "c2FsdA==",
      wrapped_cek: "d3JhcHBlZA==",
      encrypted_name: "ENC",
      original_name: "",
    } as Awaited<ReturnType<typeof getFileMeta>>);
    await createFileShareLink("file-1");
    expect(decryptNameMock).toHaveBeenCalledWith("ENC", nameKey);
    expect(createShareMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "enc1:report.pdf" })
    );
  });

  it("sends no name when the file has none readable", async () => {
    await createFileShareLink("file-1");
    expect(createShareMock).toHaveBeenCalledWith(expect.objectContaining({ name: undefined }));
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

describe("sealFileNameForLink", () => {
  const linkKey = {} as CryptoKey;
  beforeEach(() => vi.clearAllMocks());

  it("falls back to the legacy plaintext name when decryption fails", async () => {
    decryptNameMock.mockRejectedValue(new Error("bad key"));
    await expect(
      sealFileNameForLink({ encrypted_name: "ENC", original_name: "old.txt" }, nameKey, linkKey)
    ).resolves.toBe("enc1:old.txt");
  });

  it("uses the legacy name when the vault name key is unavailable", async () => {
    await expect(
      sealFileNameForLink({ encrypted_name: "ENC", original_name: "old.txt" }, null, linkKey)
    ).resolves.toBe("enc1:old.txt");
    expect(decryptNameMock).not.toHaveBeenCalled();
  });

  it("returns undefined when no name exists at all", async () => {
    decryptNameMock.mockResolvedValue("");
    await expect(sealFileNameForLink({ encrypted_name: "ENC" }, nameKey, linkKey)).resolves.toBe(
      undefined
    );
    await expect(sealFileNameForLink({}, nameKey, linkKey)).resolves.toBe(undefined);
  });
});
