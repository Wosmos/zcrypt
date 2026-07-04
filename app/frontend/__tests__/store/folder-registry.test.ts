import { describe, it, expect, beforeEach } from "vitest";
import { useFolderRegistry } from "@/store/folder-registry";
import type { Folder } from "@/types";

function makeFolder(overrides: Partial<Folder> & { id: string }): Folder {
  return {
    user_id: "user-1",
    encrypted_name: "enc-name",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("useFolderRegistry", () => {
  beforeEach(() => {
    useFolderRegistry.setState({ byId: {} });
  });

  it("starts empty", () => {
    expect(useFolderRegistry.getState().byId).toEqual({});
  });

  it("get() returns null for an unknown folder", () => {
    expect(useFolderRegistry.getState().get("nope")).toBeNull();
  });

  it("isProtected() returns false for an unknown folder", () => {
    expect(useFolderRegistry.getState().isProtected("nope")).toBe(false);
  });

  it("record() does nothing for an empty batch (and leaves byId referentially unchanged)", () => {
    const before = useFolderRegistry.getState().byId;
    useFolderRegistry.getState().record([]);
    expect(useFolderRegistry.getState().byId).toBe(before);
  });

  it("record() stores protection info for protected and unprotected folders", () => {
    const protectedFolder = makeFolder({
      id: "f1",
      pw_salt: "salt-b64",
      pw_verifier: "verifier-b64",
    });
    const openFolder = makeFolder({ id: "f2" });

    useFolderRegistry.getState().record([protectedFolder, openFolder]);

    expect(useFolderRegistry.getState().get("f1")).toEqual({
      pwSalt: "salt-b64",
      pwVerifier: "verifier-b64",
    });
    expect(useFolderRegistry.getState().get("f2")).toEqual({
      pwSalt: null,
      pwVerifier: null,
    });
    expect(useFolderRegistry.getState().isProtected("f1")).toBe(true);
    expect(useFolderRegistry.getState().isProtected("f2")).toBe(false);
  });

  it("record() treats an explicit null pw_salt the same as absent", () => {
    const folder = makeFolder({ id: "f3", pw_salt: null, pw_verifier: null });
    useFolderRegistry.getState().record([folder]);
    expect(useFolderRegistry.getState().get("f3")).toEqual({ pwSalt: null, pwVerifier: null });
    expect(useFolderRegistry.getState().isProtected("f3")).toBe(false);
  });

  it("record() refreshes an already-known folder's info (protect after the fact)", () => {
    useFolderRegistry.getState().record([makeFolder({ id: "f1" })]);
    expect(useFolderRegistry.getState().isProtected("f1")).toBe(false);

    useFolderRegistry
      .getState()
      .record([makeFolder({ id: "f1", pw_salt: "s", pw_verifier: "v" })]);
    expect(useFolderRegistry.getState().isProtected("f1")).toBe(true);
    expect(useFolderRegistry.getState().get("f1")).toEqual({ pwSalt: "s", pwVerifier: "v" });
  });

  it("record() merges into the existing registry rather than replacing it", () => {
    useFolderRegistry.getState().record([makeFolder({ id: "f1" })]);
    useFolderRegistry.getState().record([makeFolder({ id: "f2", pw_salt: "s2" })]);
    expect(Object.keys(useFolderRegistry.getState().byId).sort()).toEqual(["f1", "f2"]);
  });
});
