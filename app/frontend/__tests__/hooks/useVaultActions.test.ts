import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { FileMetadata, QuotaInfo } from "@/types";
import type { IncompleteUpload } from "@/lib/api";
import type { UseVaultLock } from "@/hooks/useVaultLock";
import type { UseFolderProtection } from "@/hooks/useFolderProtection";

// ── Hoisted mock state (referenced by the vi.mock factories below) ─────────
const {
  mockUploadStoreState,
  mockDownloadStoreState,
  mockPassphraseGetPassphrase,
  mockFolderRegistryState,
  mockFolderPasswordState,
  mockNotifyFn,
  mockNotificationsActions,
  mockToast,
  mockFormatBytes,
  mockDeleteFile,
  mockBulkDeleteFiles,
  mockMoveFile,
  mockInvalidateTrash,
  mockClearDecryptCacheForFile,
  mockCachedDecrypt,
  mockRunDecryptPipeline,
  mockPrimeThumbnails,
  mockEnsureUserKeypair,
  tauriModuleMock,
  capturedProgress,
} = vi.hoisted(() => {
  return {
    mockUploadStoreState: {
      startUpload: vi.fn(),
      startDesktopUpload: vi.fn(),
      updateStatus: vi.fn(),
      setError: vi.fn(),
      findByFileId: vi.fn(),
    },
    mockDownloadStoreState: {
      startDownload: vi.fn(),
      startBulkZipDownload: vi.fn(),
      queue: [] as { fileId: string; status: string }[],
    },
    mockPassphraseGetPassphrase: vi.fn((): string | null => null),
    mockFolderRegistryState: {
      isProtected: vi.fn((_folderId: string): boolean => false),
    },
    mockFolderPasswordState: {
      cache: {} as Record<string, unknown>,
      get: vi.fn((): string | null => null),
    },
    mockNotifyFn: vi.fn(),
    mockNotificationsActions: {
      uploadComplete: vi.fn(),
      uploadFailed: vi.fn(),
      downloadComplete: vi.fn(),
      downloadFailed: vi.fn(),
      serverError: vi.fn(),
      serverReconnected: vi.fn(),
      systemWarning: vi.fn(),
    },
    mockToast: {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warning: vi.fn(),
    },
    mockFormatBytes: vi.fn((n: number) => `${n}B`),
    mockDeleteFile: vi.fn(),
    mockBulkDeleteFiles: vi.fn(),
    mockMoveFile: vi.fn(),
    mockInvalidateTrash: vi.fn(),
    mockClearDecryptCacheForFile: vi.fn(),
    mockCachedDecrypt: vi.fn(),
    mockRunDecryptPipeline: vi.fn(),
    mockPrimeThumbnails: vi.fn(),
    mockEnsureUserKeypair: vi.fn(async () => {}),
    tauriModuleMock: { isTauri: false, pickFiles: vi.fn(), localUpload: vi.fn() },
    capturedProgress: { current: null as ((e: unknown) => void) | null },
  };
});

vi.mock("@/store/upload", () => ({
  useUploadStore: Object.assign(
    (selector?: (s: typeof mockUploadStoreState) => unknown) =>
      selector ? selector(mockUploadStoreState) : mockUploadStoreState,
    { getState: () => mockUploadStoreState }
  ),
}));

vi.mock("@/store/download", () => ({
  useDownloadStore: Object.assign(
    (selector?: (s: typeof mockDownloadStoreState) => unknown) =>
      selector ? selector(mockDownloadStoreState) : mockDownloadStoreState,
    { getState: () => mockDownloadStoreState }
  ),
}));

// The auth store persists to localStorage at module load — mock it so importing
// the hook (which now reads useAuthStore.getState().user for desktop downloads)
// doesn't touch localStorage in the test env.
vi.mock("@/store/auth", () => ({
  useAuthStore: { getState: () => ({ user: { id: "test-user" } }) },
}));

vi.mock("@/store/passphrase", () => ({
  usePassphraseStore: {
    getState: () => ({ getPassphrase: mockPassphraseGetPassphrase }),
  },
}));

vi.mock("@/store/folder-registry", () => ({
  useFolderRegistry: Object.assign(
    (selector?: (s: typeof mockFolderRegistryState) => unknown) =>
      selector ? selector(mockFolderRegistryState) : mockFolderRegistryState,
    { getState: () => mockFolderRegistryState }
  ),
}));

vi.mock("@/store/folder-passwords", () => ({
  useFolderPasswordStore: Object.assign(
    (selector?: (s: typeof mockFolderPasswordState) => unknown) =>
      selector ? selector(mockFolderPasswordState) : mockFolderPasswordState,
    { getState: () => mockFolderPasswordState }
  ),
}));

vi.mock("@/hooks/useOperationStatus", () => ({
  useOperationStatus: (cb: (e: unknown) => void) => {
    capturedProgress.current = cb;
  },
}));

vi.mock("@/hooks/useNotifications", () => ({
  useNotifications: () => ({
    notify: mockNotifyFn,
    requestPermission: vi.fn(),
    isSupported: true,
    isGranted: true,
  }),
}));

vi.mock("@/store/notifications", () => ({
  notifications: mockNotificationsActions,
}));

vi.mock("@/lib/api", () => ({
  deleteFile: mockDeleteFile,
  bulkDeleteFiles: mockBulkDeleteFiles,
  moveFile: mockMoveFile,
}));

vi.mock("@/store/trash", () => ({
  invalidateTrash: mockInvalidateTrash,
}));

vi.mock("@/lib/decrypt-cache", () => ({
  clearDecryptCacheForFile: mockClearDecryptCacheForFile,
  cachedDecrypt: mockCachedDecrypt,
}));

vi.mock("@/hooks/useFileDecryptor", () => ({
  runDecryptPipeline: mockRunDecryptPipeline,
}));

vi.mock("@/store/toast", () => ({
  toast: mockToast,
}));

vi.mock("@/lib/utils", () => ({
  formatBytes: mockFormatBytes,
}));

vi.mock("@/hooks/useThumbnail", () => ({
  primeThumbnails: mockPrimeThumbnails,
}));

vi.mock("@/lib/keys", () => ({
  ensureUserKeypair: mockEnsureUserKeypair,
}));

vi.mock("@/lib/tauri", () => tauriModuleMock);

vi.mock("@/lib/crypto", () => ({
  IncorrectPassphraseError: class IncorrectPassphraseError extends Error {
    constructor() {
      super("Incorrect passphrase — could not unlock this file.");
      this.name = "IncorrectPassphraseError";
    }
  },
}));

vi.mock("@/hooks/useFolderProtection", () => ({
  FolderUnlockCancelled: class FolderUnlockCancelled extends Error {
    constructor() {
      super("Folder unlock cancelled");
      this.name = "FolderUnlockCancelled";
    }
  },
}));

// Imports AFTER the mocks so the module graph picks them up.
import { useVaultActions } from "@/hooks/useVaultActions";
import { IncorrectPassphraseError } from "@/lib/crypto";
import { FolderUnlockCancelled } from "@/hooks/useFolderProtection";

type Args = Parameters<typeof useVaultActions>[0];

// Dynamic import() resolution inside startPreview spans more than one microtask
// tick under vite-node's module loader, so a single setTimeout(0) isn't always
// enough to drain it — loop a few macrotask turns to be safe.
async function flush(rounds = 10) {
  for (let i = 0; i < rounds; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

function makeFile(overrides: Partial<FileMetadata> = {}): FileMetadata {
  return {
    id: "file-1",
    original_name: "photo.png",
    original_size: 1000,
    compressed_size: 900,
    encrypted_size: 950,
    chunk_count: 1,
    sha256: "abc123",
    created_at: "2026-01-01T00:00:00Z",
    folder_id: null,
    ...overrides,
  };
}

function makeQuota(overrides: Partial<QuotaInfo> = {}): QuotaInfo {
  return {
    used_bytes: 0,
    quota_bytes: 1000,
    has_personal_key: false,
    is_unlimited: false,
    plan: "free",
    max_concurrent_uploads: 3,
    max_file_size: 1000,
    can_upload: true,
    allows_byob: false,
    ...overrides,
  };
}

function makeVault(overrides: Partial<UseVaultLock> = {}): UseVaultLock {
  return {
    unlocked: false,
    persistent: false,
    remainingMinutes: 0,
    remainingSeconds: 0,
    unlock: vi.fn(),
    lock: vi.fn(),
    withPassphrase: vi.fn((action: (pp: string) => void) => action("vault-pass")),
    modalProps: {
      open: false,
      title: "",
      subtitle: "",
      confirmLabel: "",
      error: null,
      onConfirm: vi.fn(),
      onClose: vi.fn(),
    },
    setError: vi.fn(),
    reopen: vi.fn((onUnlocked?: (pp: string) => void) => onUnlocked?.("vault-pass")),
    ...overrides,
  };
}

function makeFolderProtection(overrides: Partial<UseFolderProtection> = {}): UseFolderProtection {
  return {
    passwordForFile: vi.fn(async () => "vault-pass"),
    thumbnailPasswordResolver: vi.fn(() => "vault-pass"),
    isFileProtected: vi.fn(() => false),
    withFolderPassword: vi.fn((_fid: string, _fname: string, action: () => void) => action()),
    clearFolderPassword: vi.fn(),
    protectFolder: vi.fn(async () => {}),
    unprotectFolder: vi.fn(async () => {}),
    rekeyFileForMove: vi.fn(async () => {}),
    modalState: {
      open: false,
      folderId: null,
      folderName: "",
      error: null,
      onConfirm: vi.fn(),
      onClose: vi.fn(),
    },
    ...overrides,
  };
}

function makeArgs(overrides: Partial<Args> = {}): Args {
  const initialFiles = (overrides.files ?? []) as FileMetadata[];
  // Stateful, not just a recorder: applies the updater against the CURRENT
  // array (seeded from `files`) so per-element map/filter callbacks inside the
  // updater actually run against real rows, not an empty array — needed to
  // exercise both branches of e.g. `f.id === fileId ? ... : f`.
  let current = initialFiles;
  const setFiles = vi.fn((updater: unknown) => {
    current =
      typeof updater === "function"
        ? (updater as (p: FileMetadata[]) => FileMetadata[])(current)
        : (updater as FileMetadata[]);
  });
  return {
    vault: makeVault(),
    files: initialFiles,
    quotaInfo: null,
    selectedPlatform: null,
    refresh: vi.fn(async () => {}),
    refreshQuota: vi.fn(async () => {}),
    setFiles,
    openPreview: vi.fn(),
    closePreview: vi.fn(),
    folderProtection: makeFolderProtection(),
    currentFolderId: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPassphraseGetPassphrase.mockReturnValue(null);
  mockFolderRegistryState.isProtected.mockReturnValue(false);
  mockFolderPasswordState.get.mockReturnValue(null);
  mockFolderPasswordState.cache = {};
  mockDownloadStoreState.queue = [];
  mockDeleteFile.mockResolvedValue({ success: true });
  mockBulkDeleteFiles.mockResolvedValue({ deleted: 0, failed: 0 });
  mockMoveFile.mockResolvedValue({ success: true });
  mockInvalidateTrash.mockResolvedValue(undefined);
  // Passthrough by default so the lambda passed to cachedDecrypt (which calls
  // runDecryptPipeline) actually runs, exercising that closure's body too.
  mockCachedDecrypt.mockImplementation(
    (_id: string, _folderId: string | null, decrypt: () => Promise<Blob>) => decrypt()
  );
  mockRunDecryptPipeline.mockResolvedValue(new Blob(["default"]));
  // Invokes the per-file resolver lambda passed as the 2nd arg, so that
  // closure's body (which delegates to folderProtection.thumbnailPasswordResolver)
  // actually runs instead of just being constructed.
  mockPrimeThumbnails.mockImplementation(
    (_pp: string, resolver?: (fileId: string) => string | null) => {
      resolver?.("probe-file-id");
    }
  );
  tauriModuleMock.isTauri = false;
  capturedProgress.current = null;
});

describe("handleFilesSelected", () => {
  it("fires the preparing toast before the quota gate, and blocks upload when can_upload is false", () => {
    const args = makeArgs({ quotaInfo: makeQuota({ can_upload: false }) });
    const { result } = renderHook(() => useVaultActions(args));

    act(() => {
      result.current.handleFilesSelected([new File(["a"], "a.png")]);
    });

    expect(mockToast.info).toHaveBeenCalledWith(expect.stringContaining("Preparing 1 file for upload"));
    expect(mockToast.warning).toHaveBeenCalledWith(
      "No storage platform connected. Go to Settings to connect one."
    );
    expect(mockToast.info.mock.invocationCallOrder[0]).toBeLessThan(
      mockToast.warning.mock.invocationCallOrder[0]
    );
    expect(mockUploadStoreState.startUpload).not.toHaveBeenCalled();
  });

  it("skips duplicate files by name+size and uploads only the rest", () => {
    const existing = makeFile({ id: "existing", original_name: "dup.png", original_size: 100 });
    const dupFile = new File(["x"], "dup.png");
    Object.defineProperty(dupFile, "size", { value: 100 });
    const newFile = new File(["y"], "new.png");
    Object.defineProperty(newFile, "size", { value: 200 });

    const args = makeArgs({ files: [existing] });
    const { result } = renderHook(() => useVaultActions(args));

    act(() => {
      result.current.handleFilesSelected([dupFile, newFile]);
    });

    expect(mockToast.warning).toHaveBeenCalledWith(
      expect.stringContaining("Skipped 1 duplicate: dup.png")
    );
    expect(mockUploadStoreState.startUpload).toHaveBeenCalledTimes(1);
    const uploaded = mockUploadStoreState.startUpload.mock.calls[0][0] as File[];
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0].name).toBe("new.png");
  });

  it("truncates the duplicate-name list and pluralizes past 3 dupes", () => {
    const names = ["a.png", "b.png", "c.png", "d.png"];
    const existingFiles = names.map((n, i) => makeFile({ id: `e${i}`, original_name: n, original_size: 10 }));
    const dupFiles = names.map((n) => {
      const f = new File(["x"], n);
      Object.defineProperty(f, "size", { value: 10 });
      return f;
    });

    const args = makeArgs({ files: existingFiles });
    const { result } = renderHook(() => useVaultActions(args));

    act(() => {
      result.current.handleFilesSelected(dupFiles);
    });

    expect(mockToast.warning).toHaveBeenCalledWith(
      "Skipped 4 duplicates: a.png, b.png, c.png +1 more"
    );
  });

  it("returns early without uploading when every selected file is a duplicate", () => {
    const existing = makeFile({ id: "existing", original_name: "dup.png", original_size: 100 });
    const dupFile = new File(["x"], "dup.png");
    Object.defineProperty(dupFile, "size", { value: 100 });

    const vault = makeVault();
    const args = makeArgs({ files: [existing], vault });
    const { result } = renderHook(() => useVaultActions(args));

    act(() => {
      result.current.handleFilesSelected([dupFile]);
    });

    expect(vault.withPassphrase).not.toHaveBeenCalled();
    expect(mockUploadStoreState.startUpload).not.toHaveBeenCalled();
  });

  it("wraps a protected-folder upload with the folder password", () => {
    mockFolderRegistryState.isProtected.mockReturnValue(true);
    mockFolderPasswordState.get.mockReturnValue("folder-pass");
    const folderProtection = makeFolderProtection();
    const vault = makeVault();
    const args = makeArgs({ vault, folderProtection, currentFolderId: "folder-1" });
    const { result } = renderHook(() => useVaultActions(args));

    act(() => {
      result.current.handleFilesSelected([new File(["a"], "a.png")]);
    });

    expect(vault.withPassphrase).toHaveBeenCalled();
    expect(folderProtection.withFolderPassword).toHaveBeenCalledWith(
      "folder-1",
      "this folder",
      expect.any(Function)
    );
    expect(mockUploadStoreState.startUpload).toHaveBeenCalledWith(
      expect.any(Array),
      "folder-pass",
      undefined, // no platformOverride and selectedPlatform is null -> falls through to undefined
      undefined,
      args.refresh,
      "folder-1"
    );
  });

  it("does not upload when the folder password is missing after unlock (cancelled/expired)", () => {
    mockFolderRegistryState.isProtected.mockReturnValue(true);
    mockFolderPasswordState.get.mockReturnValue(null);
    const args = makeArgs({ currentFolderId: "folder-1" });
    const { result } = renderHook(() => useVaultActions(args));

    act(() => {
      result.current.handleFilesSelected([new File(["a"], "a.png")]);
    });

    expect(mockUploadStoreState.startUpload).not.toHaveBeenCalled();
  });

  it("wraps an unprotected upload with the vault passphrase and primes thumbnails", () => {
    const vault = makeVault();
    const args = makeArgs({ vault, currentFolderId: null, selectedPlatform: "github" });
    const { result } = renderHook(() => useVaultActions(args));

    act(() => {
      result.current.handleFilesSelected([new File(["a"], "a.png")]);
    });

    expect(vault.withPassphrase).toHaveBeenCalled();
    expect(mockPrimeThumbnails).toHaveBeenCalledWith("vault-pass", expect.any(Function));
    expect(mockUploadStoreState.startUpload).toHaveBeenCalledWith(
      expect.any(Array),
      "vault-pass",
      "github",
      undefined,
      args.refresh,
      null
    );
  });
});

describe("handleResumeIncomplete", () => {
  it("resumes on the upload's ORIGINAL platform, even when it differs from the selected one", () => {
    const vault = makeVault();
    const args = makeArgs({ vault, selectedPlatform: "huggingface" });
    const { result } = renderHook(() => useVaultActions(args));

    const file = new File(["a"], "resume.bin");
    const upload: IncompleteUpload = {
      session_id: "s1",
      file_id: "f1",
      filename: "resume.bin",
      original_size: 500,
      platform: "github",
      account: "acct",
      chunk_count: 5,
      uploaded_chunks: 2,
      created_at: "2026-01-01T00:00:00Z",
      expires_at: "2026-01-02T00:00:00Z",
    };

    act(() => {
      result.current.handleResumeIncomplete(file, upload);
    });

    expect(vault.withPassphrase).toHaveBeenCalled();
    expect(mockUploadStoreState.startUpload).toHaveBeenCalledWith(
      [file],
      "vault-pass",
      "github",
      undefined,
      args.refresh,
      null
    );
  });
});

describe("handleDownload", () => {
  it("does nothing when the file cannot be found", () => {
    const vault = makeVault();
    const args = makeArgs({ vault, files: [] });
    const { result } = renderHook(() => useVaultActions(args));

    act(() => {
      result.current.handleDownload("missing.png");
    });

    expect(vault.withPassphrase).not.toHaveBeenCalled();
    expect(mockDownloadStoreState.startDownload).not.toHaveBeenCalled();
  });

  it("skips when the file is already downloading", () => {
    const file = makeFile({ id: "f1", original_name: "a.png" });
    mockDownloadStoreState.queue = [{ fileId: "f1", status: "downloading" }];
    const vault = makeVault();
    const args = makeArgs({ vault, files: [file] });
    const { result } = renderHook(() => useVaultActions(args));

    act(() => {
      result.current.handleDownload("a.png");
    });

    expect(vault.withPassphrase).not.toHaveBeenCalled();
    expect(mockDownloadStoreState.startDownload).not.toHaveBeenCalled();
  });

  it("unlocks the vault and starts the download with a per-file password resolver", () => {
    const file = makeFile({ id: "f1", original_name: "a.png", original_size: 42 });
    const folderProtection = makeFolderProtection();
    const args = makeArgs({ files: [file], folderProtection });
    const { result } = renderHook(() => useVaultActions(args));

    act(() => {
      result.current.handleDownload("a.png");
    });

    expect(mockDownloadStoreState.startDownload).toHaveBeenCalledWith(
      "f1",
      "a.png",
      42,
      "vault-pass",
      expect.any(Function)
    );

    const resolver = mockDownloadStoreState.startDownload.mock.calls[0][4] as (
      id: string
    ) => Promise<string>;
    void resolver("f1");
    expect(folderProtection.passwordForFile).toHaveBeenCalledWith(file);
  });

  it("rejects the per-file resolver when the file is not in the current list", async () => {
    const file = makeFile({ id: "f1", original_name: "a.png" });
    const args = makeArgs({ files: [file] });
    const { result } = renderHook(() => useVaultActions(args));

    act(() => {
      result.current.handleDownload("a.png");
    });

    const resolver = mockDownloadStoreState.startDownload.mock.calls[0][4] as (
      id: string
    ) => Promise<string>;
    await expect(resolver("unknown-id")).rejects.toThrow("File not found");
  });
});

describe("handleBulkDownload", () => {
  it("does nothing when no ids match a known file", () => {
    const args = makeArgs({ files: [makeFile({ id: "f1" })] });
    const { result } = renderHook(() => useVaultActions(args));

    act(() => {
      result.current.handleBulkDownload(["missing"]);
    });

    expect(mockDownloadStoreState.startBulkZipDownload).not.toHaveBeenCalled();
  });

  it("warns and refuses when the total size exceeds the 2GB cap", () => {
    const bigFile = makeFile({ id: "big", original_size: 3 * 1024 * 1024 * 1024 });
    const args = makeArgs({ files: [bigFile] });
    const { result } = renderHook(() => useVaultActions(args));

    act(() => {
      result.current.handleBulkDownload(["big"]);
    });

    expect(mockToast.warning).toHaveBeenCalledWith(expect.stringContaining("too large for ZIP"));
    expect(mockDownloadStoreState.startBulkZipDownload).not.toHaveBeenCalled();
  });

  it("starts the bulk zip download when under the cap", () => {
    const f1 = makeFile({ id: "f1", original_name: "one.png", original_size: 10 });
    const f2 = makeFile({ id: "f2", original_name: "two.png", original_size: 20 });
    const vault = makeVault();
    const args = makeArgs({ vault, files: [f1, f2] });
    const { result } = renderHook(() => useVaultActions(args));

    act(() => {
      result.current.handleBulkDownload(["f1", "f2"]);
    });

    expect(vault.withPassphrase).toHaveBeenCalled();
    expect(mockDownloadStoreState.startBulkZipDownload).toHaveBeenCalledWith(
      [
        { fileId: "f1", filename: "one.png", fileSize: 10 },
        { fileId: "f2", filename: "two.png", fileSize: 20 },
      ],
      "vault-pass",
      expect.any(Function)
    );
  });
});

describe("handlePreview / startPreview", () => {
  it("does nothing when the file cannot be found", async () => {
    const args = makeArgs({ files: [] });
    const { result } = renderHook(() => useVaultActions(args));

    await act(async () => {
      result.current.handlePreview("missing.png");
      await flush();
    });

    expect(args.openPreview).not.toHaveBeenCalled();
  });

  it("decrypts and opens the preview on success", async () => {
    const file = makeFile({ id: "f1", original_name: "a.png", original_size: 42 });
    const blob = new Blob(["plaintext"]);
    // Goes through the default cachedDecrypt passthrough, which invokes the
    // lambda that calls runDecryptPipeline(file, passphrase) — exercising that
    // closure body, not just constructing it.
    mockRunDecryptPipeline.mockResolvedValue(blob);
    const args = makeArgs({ files: [file] });
    const { result } = renderHook(() => useVaultActions(args));

    act(() => {
      result.current.handlePreview("a.png");
    });
    expect(args.openPreview).toHaveBeenNthCalledWith(1, null, "a.png", 42); // synchronous, before any decrypt work starts

    // startPreview's chain runs through two sequential dynamic import()s before
    // the decrypt result lands — a variable number of microtask/macrotask
    // ticks depending on module-cache state, not a fixed count. waitFor polls
    // until the assertion holds instead of gambling on flush()'s tick budget.
    await waitFor(() => {
      expect(args.openPreview).toHaveBeenNthCalledWith(2, blob, "a.png", 42);
    });
    expect(mockCachedDecrypt).toHaveBeenCalledWith("f1", null, expect.any(Function));
  });

  it("recovers from a wrong VAULT passphrase by locking, prompting, and retrying", async () => {
    const file = makeFile({ id: "f1", original_name: "a.png", folder_id: null, original_size: 42 });
    // First decrypt fails with a wrong-key error; the retry (after vault.reopen
    // re-unlocks, using the DEFAULT vault mock which invokes its callback)
    // succeeds — exercises the retry closure body, not just its construction.
    mockCachedDecrypt
      .mockImplementationOnce(async () => {
        throw new IncorrectPassphraseError();
      })
      .mockImplementation((_id: string, _folderId: string | null, decrypt: () => Promise<Blob>) => decrypt());
    const blob = new Blob(["retried"]);
    mockRunDecryptPipeline.mockResolvedValue(blob);
    const vault = makeVault();
    const args = makeArgs({ files: [file], vault });
    const { result } = renderHook(() => useVaultActions(args));

    act(() => {
      result.current.handlePreview("a.png");
    });

    // Same non-deterministic tick count as the success test above — wait for
    // the final effect (the retried preview opening) rather than a fixed delay.
    await waitFor(() => {
      expect(args.openPreview).toHaveBeenLastCalledWith(blob, "a.png", 42);
    });
    expect(args.closePreview).toHaveBeenCalled();
    expect(vault.lock).toHaveBeenCalled();
    expect(vault.setError).toHaveBeenCalledWith("Incorrect passphrase. Please try again.");
    expect(vault.reopen).toHaveBeenCalledWith(expect.any(Function));
  });

  it("recovers from a wrong FOLDER password by clearing the cache, re-prompting, and retrying", async () => {
    const file = makeFile({ id: "f1", original_name: "a.png", folder_id: "folder-1", original_size: 42 });
    // First decrypt fails with a wrong-key error; the retry (after the folder
    // re-prompt) succeeds — exercises the actual retry closure, not just its
    // construction, and confirms the preview eventually opens.
    mockCachedDecrypt
      .mockImplementationOnce(async () => {
        throw new Error("Decryption failed — wrong passphrase?");
      })
      .mockImplementation((_id: string, _folderId: string | null, decrypt: () => Promise<Blob>) => decrypt());
    const blob = new Blob(["retried"]);
    mockRunDecryptPipeline.mockResolvedValue(blob);
    mockFolderRegistryState.isProtected.mockReturnValue(true);
    const folderProtection = makeFolderProtection(); // default withFolderPassword runs the action
    const args = makeArgs({ files: [file], folderProtection });
    const { result } = renderHook(() => useVaultActions(args));

    act(() => {
      result.current.handlePreview("a.png");
    });

    await waitFor(() => {
      expect(args.openPreview).toHaveBeenLastCalledWith(blob, "a.png", 42);
    });
    expect(args.closePreview).toHaveBeenCalled();
    expect(folderProtection.clearFolderPassword).toHaveBeenCalledWith("folder-1");
    expect(folderProtection.withFolderPassword).toHaveBeenCalledWith(
      "folder-1",
      "this folder",
      expect.any(Function)
    );
  });

  it("surfaces a generic/integrity error via a toast without touching vault or folder state", async () => {
    const file = makeFile({ id: "f1", original_name: "a.png", folder_id: null });
    mockCachedDecrypt.mockRejectedValue(new Error("Integrity check failed: hash mismatch"));
    const vault = makeVault();
    const folderProtection = makeFolderProtection();
    const args = makeArgs({ files: [file], vault, folderProtection });
    const { result } = renderHook(() => useVaultActions(args));

    act(() => {
      result.current.handlePreview("a.png");
    });

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Integrity check failed: hash mismatch");
    });
    expect(args.closePreview).toHaveBeenCalled();
    expect(vault.lock).not.toHaveBeenCalled();
    expect(folderProtection.clearFolderPassword).not.toHaveBeenCalled();
  });

  it("falls back to a generic 'Preview failed' message when a non-Error value is thrown", async () => {
    const file = makeFile({ id: "f1", original_name: "a.png", folder_id: null });
    mockCachedDecrypt.mockRejectedValue("some non-Error rejection reason");
    const args = makeArgs({ files: [file] });
    const { result } = renderHook(() => useVaultActions(args));

    act(() => {
      result.current.handlePreview("a.png");
    });

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Preview failed");
    });
  });
});

describe("moveFileWithRekey", () => {
  it("throws when the file is not found", async () => {
    const args = makeArgs({ files: [] });
    const { result } = renderHook(() => useVaultActions(args));

    await expect(result.current.moveFileWithRekey("unknown", null)).rejects.toThrow(
      "File not found"
    );
  });

  it("no-ops when the destination equals the source folder", async () => {
    const file = makeFile({ id: "f1", folder_id: "f1-folder" });
    const args = makeArgs({ files: [file] });
    const { result } = renderHook(() => useVaultActions(args));

    await result.current.moveFileWithRekey("f1", "f1-folder");

    expect(mockMoveFile).not.toHaveBeenCalled();
  });

  it("moves directly (no re-key) between two unprotected zones", async () => {
    const file = makeFile({ id: "f1", folder_id: null });
    const args = makeArgs({ files: [file] });
    const { result } = renderHook(() => useVaultActions(args));

    await result.current.moveFileWithRekey("f1", "dest-folder");

    expect(mockMoveFile).toHaveBeenCalledWith("f1", "dest-folder");
    expect(mockClearDecryptCacheForFile).toHaveBeenCalledWith("f1");
  });

  it("re-keys across a protection boundary before moving", async () => {
    const file = makeFile({ id: "f1", folder_id: "src-protected" });
    mockFolderRegistryState.isProtected.mockImplementation((fid: string) => fid === "src-protected");
    const folderProtection = makeFolderProtection({
      passwordForFile: vi.fn(async (f: FileMetadata) =>
        f.folder_id === "src-protected" ? "src-pass" : "dest-pass"
      ),
    });
    const args = makeArgs({ files: [file], folderProtection });
    const { result } = renderHook(() => useVaultActions(args));

    await result.current.moveFileWithRekey("f1", null);

    expect(folderProtection.rekeyFileForMove).toHaveBeenCalledWith("f1", "src-pass", "dest-pass");
    expect(mockMoveFile).toHaveBeenCalledWith("f1", null);
    expect(mockClearDecryptCacheForFile).toHaveBeenCalledWith("f1");
  });
});

describe("handleMoveFileTo", () => {
  it("does nothing when the file cannot be found", () => {
    const args = makeArgs({ files: [] });
    const { result } = renderHook(() => useVaultActions(args));

    act(() => {
      result.current.handleMoveFileTo("unknown", "dest");
    });

    expect(args.setFiles).not.toHaveBeenCalled();
  });

  it("does nothing when already in the destination folder", () => {
    const file = makeFile({ id: "f1", folder_id: "same" });
    const args = makeArgs({ files: [file] });
    const { result } = renderHook(() => useVaultActions(args));

    act(() => {
      result.current.handleMoveFileTo("f1", "same");
    });

    expect(args.setFiles).not.toHaveBeenCalled();
  });

  it("optimistically moves the file and shows a 'to Root' toast on success", async () => {
    const file = makeFile({ id: "f1", original_name: "a.png", folder_id: "some-folder" });
    // A sibling file (untouched by the move) so the optimistic map's ternary
    // exercises BOTH the matching-id and non-matching-id branches.
    const sibling = makeFile({ id: "f2", original_name: "b.png", folder_id: "some-folder" });
    const args = makeArgs({ files: [file, sibling] });
    const { result } = renderHook(() => useVaultActions(args));

    await act(async () => {
      result.current.handleMoveFileTo("f1", null);
      await flush();
    });

    expect(args.setFiles).toHaveBeenCalledTimes(1);
    expect(mockToast.success).toHaveBeenCalledWith('Moved "a.png" to Root');
    expect(mockClearDecryptCacheForFile).toHaveBeenCalledWith("f1");
    expect(args.refresh).not.toHaveBeenCalled();
  });

  it("shows a plain 'Moved' toast when moving into a folder (not Root)", async () => {
    const file = makeFile({ id: "f1", original_name: "a.png", folder_id: null });
    const args = makeArgs({ files: [file] });
    const { result } = renderHook(() => useVaultActions(args));

    await act(async () => {
      result.current.handleMoveFileTo("f1", "dest-folder");
      await flush();
    });

    expect(mockToast.success).toHaveBeenCalledWith('Moved "a.png"');
  });

  it("reverts and shows an error toast + refreshes on a real failure", async () => {
    const file = makeFile({ id: "f1", original_name: "a.png", folder_id: null });
    // A sibling file so the revert map's ternary exercises BOTH the
    // matching-id (reverted) and non-matching-id (left alone) branches.
    const sibling = makeFile({ id: "f2", original_name: "b.png", folder_id: null });
    mockMoveFile.mockRejectedValue(new Error("network down"));
    const args = makeArgs({ files: [file, sibling] });
    const { result } = renderHook(() => useVaultActions(args));

    await act(async () => {
      result.current.handleMoveFileTo("f1", "dest-folder");
      await flush();
    });

    expect(args.setFiles).toHaveBeenCalledTimes(2); // optimistic + revert
    expect(mockToast.error).toHaveBeenCalledWith("network down");
    expect(args.refresh).toHaveBeenCalled();
  });

  it("falls back to a generic 'Failed to move file' message when a non-Error value is thrown", async () => {
    const file = makeFile({ id: "f1", original_name: "a.png", folder_id: null });
    mockMoveFile.mockRejectedValue("plain rejection reason");
    const args = makeArgs({ files: [file] });
    const { result } = renderHook(() => useVaultActions(args));

    await act(async () => {
      result.current.handleMoveFileTo("f1", "dest-folder");
      await flush();
    });

    expect(mockToast.error).toHaveBeenCalledWith("Failed to move file");
  });

  it("reverts quietly (no error toast, no refresh) when the folder unlock is cancelled", async () => {
    const file = makeFile({ id: "f1", original_name: "a.png", folder_id: "src-protected" });
    mockFolderRegistryState.isProtected.mockImplementation((fid: string) => fid === "src-protected");
    const folderProtection = makeFolderProtection({
      passwordForFile: vi.fn(async () => {
        throw new FolderUnlockCancelled();
      }),
    });
    const args = makeArgs({ files: [file], folderProtection });
    const { result } = renderHook(() => useVaultActions(args));

    await act(async () => {
      result.current.handleMoveFileTo("f1", null);
      await flush();
    });

    expect(args.setFiles).toHaveBeenCalledTimes(2); // optimistic + quiet revert
    expect(mockToast.info).toHaveBeenCalledWith("Move cancelled");
    expect(mockToast.error).not.toHaveBeenCalled();
    expect(args.refresh).not.toHaveBeenCalled();
  });
});

describe("executeDelete", () => {
  it("optimistically removes the file and invalidates trash on success", async () => {
    const target = makeFile({ id: "f1" });
    // A sibling file so the filter predicate exercises BOTH outcomes: removed
    // (matches target.id) and kept (doesn't).
    const sibling = makeFile({ id: "f2" });
    const args = makeArgs({ files: [target, sibling] });
    const { result } = renderHook(() => useVaultActions(args));

    await act(async () => {
      result.current.executeDelete(target);
      await flush();
    });

    expect(args.setFiles).toHaveBeenCalledTimes(1);
    expect(mockClearDecryptCacheForFile).toHaveBeenCalledWith("f1");
    expect(mockToast.success).toHaveBeenCalledWith("File deleted");
    expect(args.refreshQuota).toHaveBeenCalledTimes(1);
    expect(mockDeleteFile).toHaveBeenCalledWith("f1");
    expect(mockInvalidateTrash).toHaveBeenCalled();
  });

  it("reconciles (refetch + error toast) on failure", async () => {
    const target = makeFile({ id: "f1" });
    mockDeleteFile.mockRejectedValue(new Error("delete boom"));
    const args = makeArgs({ files: [target] });
    const { result } = renderHook(() => useVaultActions(args));

    await act(async () => {
      result.current.executeDelete(target);
      await flush();
    });

    expect(mockToast.error).toHaveBeenCalledWith("delete boom");
    expect(args.refresh).toHaveBeenCalled();
    expect(args.refreshQuota).toHaveBeenCalledTimes(2); // optimistic + failure reconcile
  });

  it("falls back to a generic 'Delete failed' message when a non-Error value is thrown", async () => {
    const target = makeFile({ id: "f1" });
    mockDeleteFile.mockRejectedValue("plain rejection reason");
    const args = makeArgs({ files: [target] });
    const { result } = renderHook(() => useVaultActions(args));

    await act(async () => {
      result.current.executeDelete(target);
      await flush();
    });

    expect(mockToast.error).toHaveBeenCalledWith("Delete failed");
  });
});

describe("executeBulkDelete", () => {
  it("no-ops for an empty id list", async () => {
    const args = makeArgs({ files: [] });
    const { result } = renderHook(() => useVaultActions(args));

    await result.current.executeBulkDelete([]);

    expect(args.setFiles).not.toHaveBeenCalled();
    expect(mockBulkDeleteFiles).not.toHaveBeenCalled();
  });

  it("optimistically removes and reports full success", async () => {
    // A third, untouched file so the filter predicate exercises BOTH outcomes:
    // removed (id in the delete set) and kept (id not in it).
    const files = [makeFile({ id: "f1" }), makeFile({ id: "f2" }), makeFile({ id: "kept" })];
    mockBulkDeleteFiles.mockResolvedValue({ deleted: 2, failed: 0 });
    const args = makeArgs({ files });
    const { result } = renderHook(() => useVaultActions(args));

    await result.current.executeBulkDelete(["f1", "f2"]);

    expect(args.setFiles).toHaveBeenCalledTimes(1);
    expect(mockClearDecryptCacheForFile).toHaveBeenCalledTimes(2);
    expect(mockToast.success).toHaveBeenCalledWith("Deleted 2 files");
    expect(mockInvalidateTrash).toHaveBeenCalled();
    expect(args.refreshQuota).toHaveBeenCalled();
  });

  it("uses the singular 'file' wording when exactly one file is deleted", async () => {
    mockBulkDeleteFiles.mockResolvedValue({ deleted: 1, failed: 0 });
    const args = makeArgs({ files: [makeFile({ id: "f1" })] });
    const { result } = renderHook(() => useVaultActions(args));

    await result.current.executeBulkDelete(["f1"]);

    expect(mockToast.success).toHaveBeenCalledWith("Deleted 1 file");
  });

  it("reports a partial failure and triggers a refetch", async () => {
    mockBulkDeleteFiles.mockResolvedValue({ deleted: 1, failed: 1 });
    const args = makeArgs({ files: [makeFile({ id: "f1" }), makeFile({ id: "f2" })] });
    const { result } = renderHook(() => useVaultActions(args));

    await result.current.executeBulkDelete(["f1", "f2"]);

    expect(mockToast.warning).toHaveBeenCalledWith("1 deleted, 1 failed");
    expect(args.refresh).toHaveBeenCalled();
    expect(mockInvalidateTrash).toHaveBeenCalled();
  });

  it("reconciles on a thrown error", async () => {
    mockBulkDeleteFiles.mockRejectedValue(new Error("bulk boom"));
    const args = makeArgs({ files: [makeFile({ id: "f1" })] });
    const { result } = renderHook(() => useVaultActions(args));

    await result.current.executeBulkDelete(["f1"]);

    expect(mockToast.error).toHaveBeenCalledWith("bulk boom");
    expect(args.refresh).toHaveBeenCalled();
    expect(args.refreshQuota).toHaveBeenCalled();
    expect(mockInvalidateTrash).not.toHaveBeenCalled();
  });

  it("falls back to a generic 'Bulk delete failed' message when a non-Error value is thrown", async () => {
    mockBulkDeleteFiles.mockRejectedValue("plain rejection reason");
    const args = makeArgs({ files: [makeFile({ id: "f1" })] });
    const { result } = renderHook(() => useVaultActions(args));

    await result.current.executeBulkDelete(["f1"]);

    expect(mockToast.error).toHaveBeenCalledWith("Bulk delete failed");
  });
});

describe("useOperationStatus SSE handler", () => {
  const targetItem = {
    id: "upload-item-1",
    file: new File(["x"], "photo.png"),
    status: "uploading" as const,
    progress: 50,
    stage: "Uploading…",
    startedAt: 0,
  };

  it("ignores events without a file_id", () => {
    renderHook(() => useVaultActions(makeArgs()));
    act(() => {
      capturedProgress.current?.({ file_id: "", stage: "done", percent: 100, bytes_processed: 1, total_bytes: 1 });
    });
    expect(mockUploadStoreState.findByFileId).not.toHaveBeenCalled();
  });

  it("ignores events for an upload the store doesn't know about", () => {
    mockUploadStoreState.findByFileId.mockReturnValue(undefined);
    renderHook(() => useVaultActions(makeArgs()));
    act(() => {
      capturedProgress.current?.({
        file_id: "f1",
        stage: "done",
        percent: 100,
        bytes_processed: 1,
        total_bytes: 1,
      });
    });
    expect(mockUploadStoreState.updateStatus).not.toHaveBeenCalled();
    expect(mockUploadStoreState.setError).not.toHaveBeenCalled();
  });

  it("handles an error-stage event: sets the error and fires a failure notification", () => {
    mockUploadStoreState.findByFileId.mockReturnValue(targetItem);
    renderHook(() => useVaultActions(makeArgs()));

    act(() => {
      capturedProgress.current?.({
        file_id: "f1",
        stage: "error: boom",
        percent: 0,
        bytes_processed: 0,
        total_bytes: 100,
      });
    });

    expect(mockUploadStoreState.setError).toHaveBeenCalledWith("upload-item-1", "boom");
    expect(mockNotificationsActions.uploadFailed).toHaveBeenCalledWith("photo.png", "boom");
    expect(mockUploadStoreState.updateStatus).not.toHaveBeenCalled();
  });

  it("handles a done-stage event: updates status to done and fires a completion notification", () => {
    mockUploadStoreState.findByFileId.mockReturnValue(targetItem);
    renderHook(() => useVaultActions(makeArgs()));

    act(() => {
      capturedProgress.current?.({
        file_id: "f1",
        stage: "done",
        percent: 100,
        bytes_processed: 500,
        total_bytes: 500,
      });
    });

    expect(mockUploadStoreState.updateStatus).toHaveBeenCalledWith(
      "upload-item-1",
      "done",
      100,
      "done",
      500,
      500
    );
    expect(mockNotifyFn).toHaveBeenCalledWith("Upload complete", {
      body: "photo.png",
      tag: "upload-done",
    });
    expect(mockNotificationsActions.uploadComplete).toHaveBeenCalledWith("photo.png");
  });

  it("does NOT call updateStatus for an intermediate progress stage (regression lock)", () => {
    mockUploadStoreState.findByFileId.mockReturnValue(targetItem);
    renderHook(() => useVaultActions(makeArgs()));

    act(() => {
      capturedProgress.current?.({
        file_id: "f1",
        stage: "uploading",
        percent: 60,
        bytes_processed: 60,
        total_bytes: 100,
      });
    });

    expect(mockUploadStoreState.updateStatus).not.toHaveBeenCalled();
    expect(mockUploadStoreState.setError).not.toHaveBeenCalled();
    expect(mockNotifyFn).not.toHaveBeenCalled();
    expect(mockNotificationsActions.uploadComplete).not.toHaveBeenCalled();
  });
});

describe("thumbnail priming effect", () => {
  it("primes thumbnails and ensures a keypair when unlocked with files and a cached passphrase", () => {
    mockPassphraseGetPassphrase.mockReturnValue("cached-pass");
    const args = makeArgs({ vault: makeVault({ unlocked: true }), files: [makeFile({ id: "f1" })] });
    renderHook(() => useVaultActions(args));

    expect(mockPrimeThumbnails).toHaveBeenCalledWith("cached-pass", expect.any(Function));
    expect(mockEnsureUserKeypair).toHaveBeenCalledWith("cached-pass");
  });

  it("does nothing when locked", () => {
    mockPassphraseGetPassphrase.mockReturnValue("cached-pass");
    const args = makeArgs({ vault: makeVault({ unlocked: false }), files: [makeFile({ id: "f1" })] });
    renderHook(() => useVaultActions(args));

    expect(mockPrimeThumbnails).not.toHaveBeenCalled();
  });

  it("does nothing when there are no files", () => {
    mockPassphraseGetPassphrase.mockReturnValue("cached-pass");
    const args = makeArgs({ vault: makeVault({ unlocked: true }), files: [] });
    renderHook(() => useVaultActions(args));

    expect(mockPrimeThumbnails).not.toHaveBeenCalled();
  });

  it("does nothing when no passphrase is cached", () => {
    mockPassphraseGetPassphrase.mockReturnValue(null);
    const args = makeArgs({ vault: makeVault({ unlocked: true }), files: [makeFile({ id: "f1" })] });
    renderHook(() => useVaultActions(args));

    expect(mockPrimeThumbnails).not.toHaveBeenCalled();
    expect(mockEnsureUserKeypair).not.toHaveBeenCalled();
  });
});

describe("Tauri desktop upload routing", () => {
  it("routes to desktop upload instead of the web pipeline when isTauri is true", async () => {
    tauriModuleMock.isTauri = true;
    vi.resetModules();
    const { useVaultActions: freshUseVaultActions } = await import("@/hooks/useVaultActions");

    const vault = makeVault();
    const args = makeArgs({ vault });
    const { result } = renderHook(() => freshUseVaultActions(args));

    const file = new File(["a"], "resume.bin");
    const upload: IncompleteUpload = {
      session_id: "s1",
      file_id: "f1",
      filename: "resume.bin",
      original_size: 500,
      platform: "github",
      account: "acct",
      chunk_count: 5,
      uploaded_chunks: 2,
      created_at: "2026-01-01T00:00:00Z",
      expires_at: "2026-01-02T00:00:00Z",
    };

    act(() => {
      result.current.handleResumeIncomplete(file, upload);
    });

    expect(mockUploadStoreState.startDesktopUpload).toHaveBeenCalledWith("vault-pass", args.refresh);
    expect(mockUploadStoreState.startUpload).not.toHaveBeenCalled();

    tauriModuleMock.isTauri = false;
    vi.resetModules();
  });
});
