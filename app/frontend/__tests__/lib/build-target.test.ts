import { afterEach, describe, expect, it, vi } from "vitest";
import { Role } from "@/types";

async function load(native: string | undefined) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_NATIVE_BUILD", native);
  return import("@/lib/build-target");
}

describe("build-target", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("shows admin to admins on the website", async () => {
    const { ADMIN_IN_BUILD, showsAdmin } = await load(undefined);
    expect(ADMIN_IN_BUILD).toBe(true);
    expect(showsAdmin(Role.Admin)).toBe(true);
    expect(showsAdmin(Role.User)).toBe(false);
    expect(showsAdmin(undefined)).toBe(false);
  });

  it("never shows admin in the desktop and Android apps", async () => {
    const { ADMIN_IN_BUILD, showsAdmin } = await load("1");
    expect(ADMIN_IN_BUILD).toBe(false);
    expect(showsAdmin(Role.Admin)).toBe(false);
  });
});
