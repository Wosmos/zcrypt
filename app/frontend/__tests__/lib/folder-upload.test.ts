import { describe, it, expect, vi, beforeEach } from "vitest";

const { listFoldersMock, createFolderMock, encryptNameMock, ensureNamesMock, names, recordMock } =
  vi.hoisted(() => ({
    listFoldersMock: vi.fn(),
    createFolderMock: vi.fn(),
    encryptNameMock: vi.fn(async (name: string) => `enc:${name}`),
    ensureNamesMock: vi.fn(async () => {}),
    names: new Map<string, string>(),
    recordMock: vi.fn(),
  }));

vi.mock("@/lib/api", () => ({ listFolders: listFoldersMock, createFolder: createFolderMock }));
vi.mock("@/lib/name-crypto", () => ({ encryptName: encryptNameMock }));
vi.mock("@/lib/file-names", () => ({
  ensureNames: ensureNamesMock,
  peekName: (enc: string) => names.get(enc),
}));
vi.mock("@/store/folder-registry", () => ({
  useFolderRegistry: { getState: () => ({ record: recordMock }) },
}));

import {
  droppedEntries,
  ensureFolderTree,
  pathKey,
  pickFromDirectoryInput,
  walkEntries,
} from "@/lib/folder-upload";

type Entry = FileSystemEntry;

function fileEntry(name: string): Entry {
  const file = new File(["x"], name);
  return {
    name,
    isFile: true,
    isDirectory: false,
    file: (ok: (f: File) => void) => ok(file),
  } as unknown as Entry;
}

function dirEntry(name: string, children: Entry[], batchSize = 100): Entry {
  return {
    name,
    isFile: false,
    isDirectory: true,
    createReader: () => {
      let at = 0;
      return {
        readEntries: (ok: (e: Entry[]) => void) => {
          const batch = children.slice(at, at + batchSize);
          at += batch.length;
          ok(batch);
        },
      };
    },
  } as unknown as Entry;
}

function transfer(items: { kind: string; entry: Entry | null }[]): DataTransfer {
  return {
    items: items.map((i) => ({ kind: i.kind, webkitGetAsEntry: () => i.entry })),
  } as unknown as DataTransfer;
}

describe("droppedEntries", () => {
  it("returns the top-level entries when the drop holds a folder", () => {
    const dir = dirEntry("Photos", []);
    const loose = fileEntry("a.txt");
    const dt = transfer([
      { kind: "file", entry: dir },
      { kind: "file", entry: loose },
      { kind: "string", entry: null },
      { kind: "file", entry: null },
    ]);
    expect(droppedEntries(dt)).toEqual([dir, loose]);
  });

  it("returns null for a drop of plain files, or a drop with no item list", () => {
    expect(droppedEntries(transfer([{ kind: "file", entry: fileEntry("a.txt") }]))).toBeNull();
    expect(droppedEntries({} as DataTransfer)).toBeNull();
  });
});

describe("walkEntries", () => {
  it("collects every file with its folder path and every folder, skipping OS junk", async () => {
    const pick = await walkEntries([
      dirEntry(
        "Trip",
        [
          fileEntry("a.jpg"),
          fileEntry(".DS_Store"),
          fileEntry("._a.jpg"),
          dirEntry("Day 2", [fileEntry("b.jpg")]),
          dirEntry("Empty", []),
        ],
        2,
      ),
      fileEntry("loose.txt"),
      { name: "odd", isFile: false, isDirectory: false } as unknown as Entry,
    ]);
    expect(pick.files.map((f) => [f.file.name, f.dir])).toEqual([
      ["a.jpg", ["Trip"]],
      ["b.jpg", ["Trip", "Day 2"]],
      ["loose.txt", []],
    ]);
    expect(pick.dirs).toEqual([["Trip"], ["Trip", "Day 2"], ["Trip", "Empty"]]);
  });
});

describe("pickFromDirectoryInput", () => {
  const withPath = (name: string, rel: string) => {
    const f = new File(["x"], name);
    Object.defineProperty(f, "webkitRelativePath", { value: rel });
    return f;
  };

  it("derives folders from each file's relative path, listing each folder once", () => {
    const pick = pickFromDirectoryInput([
      withPath("a.jpg", "Trip/a.jpg"),
      withPath("b.jpg", "Trip/Day 2/b.jpg"),
      withPath("c.jpg", "Trip/Day 2/c.jpg"),
      withPath("Thumbs.db", "Trip/Thumbs.db"),
      new File(["x"], "plain.txt"),
    ]);
    expect(pick.files.map((f) => [f.file.name, f.dir])).toEqual([
      ["a.jpg", ["Trip"]],
      ["b.jpg", ["Trip", "Day 2"]],
      ["c.jpg", ["Trip", "Day 2"]],
      ["plain.txt", []],
    ]);
    expect(pick.dirs).toEqual([["Trip"], ["Trip", "Day 2"]]);
  });
});

describe("ensureFolderTree", () => {
  const key = {} as CryptoKey;

  beforeEach(() => {
    vi.clearAllMocks();
    names.clear();
    let n = 0;
    createFolderMock.mockImplementation(async () => ({ id: `new-${++n}` }));
  });

  it("reuses an existing folder by name, case-insensitively, and creates the rest under it", async () => {
    names.set("enc-trip", " trip ");
    listFoldersMock.mockImplementation(async (parentId: string | null) =>
      parentId === "root" ? [{ id: "trip-id", encrypted_name: "enc-trip" }, { id: "x", encrypted_name: "enc-unknown" }] : [],
    );
    const ids = await ensureFolderTree("root", [["Trip", "Day 2"], ["Trip"], ["Trip", "Day 2", "Night"]], key);

    expect(ids.get(pathKey([]))).toBe("root");
    expect(ids.get(pathKey(["Trip"]))).toBe("trip-id");
    expect(ids.get(pathKey(["Trip", "Day 2"]))).toBe("new-1");
    expect(ids.get(pathKey(["Trip", "Day 2", "Night"]))).toBe("new-2");
    expect(createFolderMock).toHaveBeenNthCalledWith(1, { encrypted_name: "enc:Day 2", parent_id: "trip-id" });
    expect(createFolderMock).toHaveBeenNthCalledWith(2, { encrypted_name: "enc:Night", parent_id: "new-1" });
    expect(listFoldersMock).toHaveBeenCalledTimes(2);
    expect(recordMock).toHaveBeenCalledWith([{ id: "new-1" }]);
  });

  it("creates at the vault root and lists each parent once for repeated paths", async () => {
    listFoldersMock.mockResolvedValue([]);
    const ids = await ensureFolderTree(null, [["A"], ["A"], ["B"]], key);
    expect(ids.get(pathKey(["A"]))).toBe("new-1");
    expect(ids.get(pathKey(["B"]))).toBe("new-2");
    expect(listFoldersMock).toHaveBeenCalledTimes(1);
    expect(listFoldersMock).toHaveBeenCalledWith(null);
  });

  it("falls back to the root as parent when a path's parent was never listed", async () => {
    listFoldersMock.mockResolvedValue([]);
    const ids = await ensureFolderTree("root", [["Orphan", "Child"]], key);
    expect(createFolderMock).toHaveBeenCalledWith({ encrypted_name: "enc:Child", parent_id: "root" });
    expect(ids.get(pathKey(["Orphan", "Child"]))).toBe("new-1");
  });
});
