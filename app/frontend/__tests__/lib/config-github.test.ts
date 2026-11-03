import { afterEach, describe, expect, it, vi } from "vitest";

async function load(repo?: string) {
  vi.resetModules();
  if (repo === undefined) vi.stubEnv("NEXT_PUBLIC_GITHUB_REPO", "");
  else vi.stubEnv("NEXT_PUBLIC_GITHUB_REPO", repo);
  return import("@/lib/config");
}

describe("github repo config", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("defaults to the current repository", async () => {
    const c = await load();
    expect(c.GITHUB_REPO).toBe("https://github.com/Wosmos/zcrypt");
    expect(c.GITHUB_OWNER).toBe("Wosmos");
    expect(c.SPONSOR_URL).toBe("https://github.com/sponsors/Wosmos");
    expect(c.LATEST_RELEASE_API).toBe("https://api.github.com/repos/Wosmos/zcrypt/releases/latest");
  });

  it("derives every URL from an overridden repo URL", async () => {
    const c = await load("https://github.com/acme/vault/");
    expect(c.GITHUB_REPO).toBe("https://github.com/acme/vault");
    expect(c.SPONSOR_URL).toBe("https://github.com/sponsors/acme");
    expect(c.LATEST_RELEASE_API).toBe("https://api.github.com/repos/acme/vault/releases/latest");
  });

  it("accepts owner/name shorthand", async () => {
    const c = await load("acme/vault");
    expect(c.GITHUB_REPO).toBe("https://github.com/acme/vault");
  });
});
