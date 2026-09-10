import { describe, it, expect, beforeEach, vi } from "vitest";

// Unlike api-endpoints.test.ts (which mocks @/lib/sealed to inspect routing),
// this suite runs the REAL sealing so the optional-field branches in the write
// wrappers are exercised: a label/description that's present gets sealed, one
// that's absent is passed through untouched.
const { getState } = vi.hoisted(() => ({
  getState: vi.fn(() => ({ accessToken: "t", clearAuth: vi.fn(), user: { id: "u-seal" } })),
}));
vi.mock("@/store/auth", () => ({ useAuthStore: { getState } }));
vi.mock("@/lib/auth-fetch", () => ({ tryRefreshToken: vi.fn() }));
vi.mock("@/store/passphrase", () => ({
  usePassphraseStore: { getState: () => ({ getPassphrase: () => "vault-pass" }) },
}));

import * as api from "@/lib/api";
import { isSealed } from "@/lib/sealed";

let sent: Record<string, unknown>;

beforeEach(() => {
  sent = {};
  getState.mockReturnValue({ accessToken: "t", clearAuth: vi.fn(), user: { id: "u-seal" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      sent = JSON.parse((init?.body as string) ?? "{}");
      return new Response(JSON.stringify(sent), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
});

describe("api write wrappers seal user-authored text", () => {
  it("seals a sync folder's path and its optional label / device name when given", async () => {
    await api.createSyncFolder({ folder_path: "/Users/me/Docs", label: "Docs", device_name: "mac" });
    expect(isSealed(sent.folder_path as string)).toBe(true);
    expect(isSealed(sent.label as string)).toBe(true);
    expect(isSealed(sent.device_name as string)).toBe(true);
    expect(JSON.stringify(sent)).not.toContain("/Users/me/Docs");
  });

  it("passes absent optional sync fields through untouched", async () => {
    await api.createSyncFolder({ folder_path: "/srv/data" });
    expect(isSealed(sent.folder_path as string)).toBe(true);
    expect(sent.label).toBeUndefined();
    expect(sent.device_name).toBeUndefined();
  });

  it("seals a timed vault's name, and its description only when present", async () => {
    await api.createExpiringVault({ name: "Leak", description: "for the journalist" } as never);
    expect(isSealed(sent.name as string)).toBe(true);
    expect(isSealed(sent.description as string)).toBe(true);

    await api.createExpiringVault({ name: "Bare" } as never);
    expect(isSealed(sent.name as string)).toBe(true);
    expect(sent.description).toBeUndefined();
  });

  it("seals a snapshot label", async () => {
    await api.createVaultSnapshot("before the migration");
    expect(isSealed(sent.label as string)).toBe(true);
    expect(JSON.stringify(sent)).not.toContain("migration");
  });

  it("seals an updated sync-folder label but leaves a label-less update alone", async () => {
    await api.updateSyncFolder("id", { enabled: true, label: "Renamed" });
    expect(isSealed(sent.label as string)).toBe(true);
    await api.updateSyncFolder("id", { enabled: false });
    expect(sent).toEqual({ enabled: false });
  });
});
