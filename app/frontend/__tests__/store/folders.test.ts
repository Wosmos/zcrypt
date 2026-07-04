import { describe, it, expect, beforeEach } from "vitest";
import { useFolderStore, type Crumb } from "@/store/folders";
import type { Folder } from "@/types";

const ROOT_CRUMB: Crumb = { id: null, name: "My Vault" };

function makeFolder(id: string): Folder {
  return {
    id,
    user_id: "user-1",
    encrypted_name: "enc-name",
    created_at: "2026-01-01T00:00:00Z",
  };
}

describe("useFolderStore", () => {
  beforeEach(() => {
    useFolderStore.getState().reset();
    useFolderStore.setState({ loading: false });
  });

  it("starts at the vault root with just the root crumb", () => {
    const s = useFolderStore.getState();
    expect(s.currentFolderId).toBeNull();
    expect(s.breadcrumb).toEqual([ROOT_CRUMB]);
    expect(s.folders).toEqual([]);
    expect(s.decryptedNames).toEqual({});
    expect(s.loading).toBe(false);
  });

  it("setFolders / setDecryptedNames / setLoading are plain setters", () => {
    const folders = [makeFolder("f1")];
    useFolderStore.getState().setFolders(folders);
    expect(useFolderStore.getState().folders).toBe(folders);

    useFolderStore.getState().setDecryptedNames({ f1: "Documents" });
    expect(useFolderStore.getState().decryptedNames).toEqual({ f1: "Documents" });

    useFolderStore.getState().setLoading(true);
    expect(useFolderStore.getState().loading).toBe(true);
  });

  describe("setCurrentFolder", () => {
    it("navigating to root (null) resets the breadcrumb to just the root crumb", () => {
      useFolderStore.getState().setCurrentFolder("f1", "Docs");
      useFolderStore.getState().setCurrentFolder(null, "ignored");
      expect(useFolderStore.getState().currentFolderId).toBeNull();
      expect(useFolderStore.getState().breadcrumb).toEqual([ROOT_CRUMB]);
    });

    it("opening a new folder appends it to the breadcrumb trail", () => {
      useFolderStore.getState().setCurrentFolder("f1", "Docs");
      expect(useFolderStore.getState().currentFolderId).toBe("f1");
      expect(useFolderStore.getState().breadcrumb).toEqual([ROOT_CRUMB, { id: "f1", name: "Docs" }]);

      useFolderStore.getState().setCurrentFolder("f2", "Nested");
      expect(useFolderStore.getState().breadcrumb).toEqual([
        ROOT_CRUMB,
        { id: "f1", name: "Docs" },
        { id: "f2", name: "Nested" },
      ]);
    });

    it("re-opening a crumb already on the trail truncates back to it instead of duplicating", () => {
      useFolderStore.getState().setCurrentFolder("f1", "Docs");
      useFolderStore.getState().setCurrentFolder("f2", "Nested");
      useFolderStore.getState().setCurrentFolder("f1", "Docs (renamed, ignored)");

      expect(useFolderStore.getState().currentFolderId).toBe("f1");
      expect(useFolderStore.getState().breadcrumb).toEqual([ROOT_CRUMB, { id: "f1", name: "Docs" }]);
    });
  });

  it("pushCrumb appends a crumb and makes it current", () => {
    useFolderStore.getState().pushCrumb({ id: "f1", name: "Docs" });
    expect(useFolderStore.getState().currentFolderId).toBe("f1");
    expect(useFolderStore.getState().breadcrumb).toEqual([ROOT_CRUMB, { id: "f1", name: "Docs" }]);
  });

  describe("navigateToCrumb", () => {
    it("jumps back to an earlier crumb, truncating the trail", () => {
      useFolderStore.getState().setCurrentFolder("f1", "Docs");
      useFolderStore.getState().setCurrentFolder("f2", "Nested");
      useFolderStore.getState().navigateToCrumb(0);
      expect(useFolderStore.getState().currentFolderId).toBeNull();
      expect(useFolderStore.getState().breadcrumb).toEqual([ROOT_CRUMB]);
    });

    it("is a no-op for an out-of-range index", () => {
      useFolderStore.getState().setCurrentFolder("f1", "Docs");
      const before = useFolderStore.getState();
      useFolderStore.getState().navigateToCrumb(99);
      const after = useFolderStore.getState();
      expect(after.currentFolderId).toBe(before.currentFolderId);
      expect(after.breadcrumb).toEqual(before.breadcrumb);
    });
  });

  it("reset() clears folder navigation and data but leaves loading untouched", () => {
    useFolderStore.getState().setCurrentFolder("f1", "Docs");
    useFolderStore.getState().setFolders([makeFolder("f1")]);
    useFolderStore.getState().setDecryptedNames({ f1: "Docs" });
    useFolderStore.getState().setLoading(true);

    useFolderStore.getState().reset();

    const s = useFolderStore.getState();
    expect(s.currentFolderId).toBeNull();
    expect(s.breadcrumb).toEqual([ROOT_CRUMB]);
    expect(s.folders).toEqual([]);
    expect(s.decryptedNames).toEqual({});
    expect(s.loading).toBe(true); // reset() intentionally doesn't touch `loading`
  });
});
